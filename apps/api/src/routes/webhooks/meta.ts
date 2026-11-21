import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { enqueueInboundMessage } from '@wcos/queue';
import { type NormalizedMessage } from '@wcos/types';
import { timingSafeCompare, verifyHmacSha256 } from '@wcos/crypto';
import { isNewWebhookMessage } from '../../middleware/deduplication.js';
import { config } from '../../config.js';

interface MetaWebhookParams {
  tenantId: string;
}

interface MetaVerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metaWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Verification challenge (GET /webhooks/meta)
  fastify.get<{ Querystring: MetaVerificationQuery }>(
    '/webhooks/meta',
    async (request, reply) => {
      const mode = request.query['hub.mode'];
      const token = request.query['hub.verify_token'] || '';
      const challenge = request.query['hub.challenge'];

      const expectedToken = config.META_VERIFY_TOKEN;
      if (!expectedToken) {
        return reply.status(503).send('Meta webhook verification token not configured');
      }

      if (mode === 'subscribe' && token && timingSafeCompare(token, expectedToken)) {
        return reply.status(200).send(challenge);
      }

      return reply.status(403).send('Forbidden');
    }
  );

  // Incoming webhook messages (POST /webhooks/meta/:tenantId)
  fastify.post<{ Params: MetaWebhookParams }>(
    '/webhooks/meta/:tenantId',
    async (request, reply) => {
      const { tenantId } = request.params;
      if (!UUID_REGEX.test(tenantId)) {
        return reply.status(400).send({ error: 'Invalid tenantId parameter' });
      }

      const appSecret = config.META_APP_SECRET;
      if (!appSecret) {
        return reply.status(503).send({ error: 'Meta webhook secret not configured' });
      }

      // Mandatory HMAC Verification
      const signatureHeader = request.headers['x-hub-signature-256'] as string | undefined;
      if (!signatureHeader || !signatureHeader.startsWith('sha256=') || !request.rawBody) {
        return reply.status(401).send({ error: 'Missing Meta webhook signature or payload' });
      }

      const signature = signatureHeader.slice('sha256='.length);
      const isValid = verifyHmacSha256(request.rawBody, appSecret, signature);
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid HMAC signature' });
      }

      // Verify tenant exists and is ACTIVE
      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, status: 'ACTIVE' },
        select: { id: true, whatsappPhoneNumber: true, evolutionInstanceId: true },
      });
      if (!tenant) {
        return reply.status(404).send({ error: 'Active tenant not found' });
      }

      const body = (request.body || {}) as Record<string, any>;
      const entries = Array.isArray(body['entry']) ? (body['entry'] as any[]) : [];

      let enqueuedCount = 0;

      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value;
          const messages = Array.isArray(value?.messages) ? value.messages : [];
          if (messages.length === 0) {
            continue;
          }

          const phoneNumberId = value?.metadata?.phone_number_id;
          // If tenant has a pinned phoneNumberId stored in evolutionInstanceId, verify ownership
          if (
            tenant.evolutionInstanceId &&
            phoneNumberId &&
            tenant.evolutionInstanceId !== phoneNumberId
          ) {
            fastify.log.warn(
              { tenantId, phoneNumberId },
              '[MetaWebhook] phone_number_id mismatch for tenant; ignoring batch'
            );
            continue;
          }

          const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

          for (const message of messages) {
            const providerMessageId: string = message?.id || '';
            const isNew = await isNewWebhookMessage(providerMessageId, 86400, message);
            if (!isNew) {
              continue;
            }

            const rawEvent = await prisma.rawWebhookEvent.create({
              data: {
                tenantId,
                source: 'meta',
                messageId: providerMessageId || `meta-${Date.now()}`,
                payload: body,
              },
            });

            const fromNumber = String(message.from || '').replace(/[^0-9]/g, '');
            if (!fromNumber) {
              continue;
            }
            const customerPhone = `+${fromNumber}`;
            const contact = contacts.find((c: any) => c.wa_id === message.from) || contacts[0];

            let textContent = '';
            let mediaUrl: string | undefined;
            let buttonPayload: string | undefined;
            let listPayload: string | undefined;
            let msgType: NormalizedMessage['type'] = 'text';

            if (message.type === 'text') {
              textContent = message.text?.body || '';
              msgType = 'text';
            } else if (message.type === 'image') {
              textContent = message.image?.caption || '';
              msgType = 'image';
            } else if (message.type === 'interactive') {
              buttonPayload = message.interactive?.button_reply?.id;
              listPayload = message.interactive?.list_reply?.id;
              textContent =
                message.interactive?.button_reply?.title ||
                message.interactive?.list_reply?.title ||
                '';
              msgType = buttonPayload ? 'button_reply' : 'list_reply';
            }

            const normalizedMessage: NormalizedMessage = {
              id: providerMessageId || rawEvent.id,
              source: 'meta',
              instanceName: phoneNumberId || 'meta-cloud',
              tenantId,
              customerPhone,
              customerName: contact?.profile?.name,
              type: msgType,
              text: textContent,
              mediaUrl,
              buttonPayload,
              listPayload,
              timestamp: new Date(Number(message.timestamp || Date.now() / 1000) * 1000),
              rawPayload: body,
            };

            await enqueueInboundMessage({
              tenantId,
              rawEventId: rawEvent.id,
              message: normalizedMessage,
              receivedAt: new Date().toISOString(),
            });
            enqueuedCount++;
          }
        }
      }

      return reply.status(200).send({ received: true, enqueuedCount });
    }
  );
};
