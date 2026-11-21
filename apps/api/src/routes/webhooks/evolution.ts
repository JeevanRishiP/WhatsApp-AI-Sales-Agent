import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { enqueueInboundMessage } from '@wcos/queue';
import { type NormalizedMessage } from '@wcos/types';
import { timingSafeCompare } from '@wcos/crypto';
import { isNewWebhookMessage } from '../../middleware/deduplication.js';
import { config } from '../../config.js';

interface EvolutionWebhookParams {
  tenantId?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const evolutionWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  const handleEvolutionWebhook = async (request: any, reply: any) => {
    // 1. Mandatory Webhook Authentication (unconditional — fail closed)
    const headers = request.headers as Record<string, string | undefined>;
    const apiKeyHeader = (headers['apikey'] || headers['x-api-key'] || '').trim();
    if (!apiKeyHeader) {
      return reply.status(401).send({ error: 'Missing Evolution API key' });
    }

    const validGlobalKey = timingSafeCompare(apiKeyHeader, config.EVOLUTION_API_GLOBAL_KEY);
    const validWebhookSecret = config.EVOLUTION_WEBHOOK_SECRET
      ? timingSafeCompare(apiKeyHeader, config.EVOLUTION_WEBHOOK_SECRET)
      : false;

    if (!validGlobalKey && !validWebhookSecret) {
      return reply.status(401).send({ error: 'Invalid Evolution API key' });
    }

    const body = (request.body || {}) as Record<string, any>;
    const paramTenantId = request.params?.tenantId;
    let tenantId: string | undefined;

    if (paramTenantId) {
      if (!UUID_REGEX.test(paramTenantId)) {
        return reply.status(400).send({ error: 'Invalid tenantId parameter' });
      }
      const tenant = await prisma.tenant.findFirst({
        where: { id: paramTenantId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!tenant) {
        return reply.status(404).send({ error: 'Active tenant not found' });
      }
      tenantId = tenant.id;
    }

    const instanceName = body['instance'] || body['instanceName'];
    const senderRaw = body['sender'] || body['ownerJid'] || body['destination'] || '';
    const senderDigits = String(senderRaw).replace(/@.*$/, '').replace(/[^0-9]/g, '');
    const senderLast10 = senderDigits.length >= 10 ? senderDigits.slice(-10) : '';

    // 2. Match active tenant by WhatsApp instance name
    if (!tenantId && instanceName) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          whatsappInstanceName: String(instanceName),
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      tenantId = tenant?.id;
    }

    // 3. Match active tenant by WhatsApp phone number
    if (!tenantId && senderLast10) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { whatsappPhoneNumber: senderLast10 },
            { whatsappPhoneNumber: `91${senderLast10}` },
            { whatsappPhoneNumber: `+91${senderLast10}` },
            { ownerPhone: senderLast10 },
            { ownerPhone: `+91${senderLast10}` },
          ],
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      tenantId = tenant?.id;
    }

    // 4. Strict isolation: drop unrecognized or inactive tenants
    if (!tenantId) {
      fastify.log.warn(
        { instance: instanceName, sender: senderRaw },
        '[EvolutionWebhook] Unregistered or inactive WhatsApp tenant; dropping message.'
      );
      return reply.status(200).send({
        status: 'ignored_unregistered_tenant',
        instance: instanceName,
      });
    }

    const eventType = body['event'];
    fastify.log.info({ eventType, instance: instanceName, tenantId }, '[EvolutionWebhook] Incoming event');

    if (eventType !== 'messages.upsert' && eventType !== 'messages-upsert') {
      return reply.status(200).send({ status: 'ignored_event_type', event: eventType });
    }

    const messageData = body['data'];
    if (!messageData || !messageData.key) {
      return reply.status(200).send({ status: 'missing_message_data' });
    }

    if (messageData.key.fromMe === true) {
      return reply.status(200).send({ status: 'ignored_from_me' });
    }

    const remoteJid: string = messageData.key.remoteJid || '';
    if (remoteJid.endsWith('@g.us')) {
      return reply.status(200).send({ status: 'ignored_group_message' });
    }

    const providerMessageId: string = messageData.key.id || '';
    const isNew = await isNewWebhookMessage(providerMessageId, 86400, messageData);
    if (!isNew) {
      return reply.status(200).send({ status: 'duplicate_ignored', providerMessageId });
    }

    const rawNumber = remoteJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    if (!rawNumber) {
      return reply.status(200).send({ status: 'ignored_invalid_sender' });
    }
    const customerPhone = rawNumber.startsWith('+') ? rawNumber : `+${rawNumber}`;

    let messageType: NormalizedMessage['type'] = 'text';
    let textContent = '';
    let mediaUrl: string | undefined;
    let buttonPayload: string | undefined;
    let listPayload: string | undefined;

    const innerMsg = messageData.message;
    if (innerMsg) {
      if (typeof innerMsg.conversation === 'string') {
        textContent = innerMsg.conversation;
        messageType = 'text';
      } else if (innerMsg.extendedTextMessage?.text) {
        textContent = innerMsg.extendedTextMessage.text;
        messageType = 'text';
      } else if (innerMsg.imageMessage) {
        textContent = innerMsg.imageMessage.caption || '';
        mediaUrl = innerMsg.imageMessage.url;
        messageType = 'image';
      } else if (innerMsg.audioMessage) {
        mediaUrl = innerMsg.audioMessage.url;
        messageType = 'audio';
      } else if (innerMsg.buttonsResponseMessage) {
        buttonPayload = innerMsg.buttonsResponseMessage.selectedButtonId;
        textContent = innerMsg.buttonsResponseMessage.selectedDisplayText || buttonPayload || '';
        messageType = 'button_reply';
      } else if (innerMsg.listResponseMessage) {
        listPayload = innerMsg.listResponseMessage.singleSelectReply?.selectedRowId;
        textContent = listPayload || '';
        messageType = 'list_reply';
      }
    }

    if (!textContent && !mediaUrl) {
      return reply.status(200).send({ status: 'ignored_unsupported_content' });
    }

    const rawEvent = await prisma.rawWebhookEvent.create({
      data: {
        tenantId,
        source: 'evolution',
        messageId: providerMessageId || `evo-${Date.now()}`,
        payload: body,
      },
    });

    const normalizedMessage: NormalizedMessage = {
      id: providerMessageId || rawEvent.id,
      source: 'evolution',
      instanceName: instanceName || 'default',
      tenantId,
      customerPhone,
      customerName: messageData.pushName || undefined,
      type: messageType,
      text: textContent.trim(),
      mediaUrl,
      buttonPayload,
      listPayload,
      timestamp: new Date(
        messageData.messageTimestamp
          ? Number(messageData.messageTimestamp) * 1000
          : Date.now()
      ),
      rawPayload: body,
    };

    await enqueueInboundMessage({
      tenantId,
      rawEventId: rawEvent.id,
      message: normalizedMessage,
      receivedAt: new Date().toISOString(),
    });

    return reply.status(200).send({
      received: true,
      rawEventId: rawEvent.id,
      providerMessageId,
    });
  };

  fastify.post('/webhooks/evolution', handleEvolutionWebhook);
  fastify.post<{ Params: EvolutionWebhookParams }>(
    '/webhooks/evolution/:tenantId',
    handleEvolutionWebhook
  );
};
