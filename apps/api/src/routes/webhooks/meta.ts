import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { enqueueInboundMessage } from '@wcos/queue';
import { type NormalizedMessage } from '@wcos/types';
import { isNewWebhookMessage } from '../../middleware/deduplication.js';
import { verifyHmacSha256 } from '@wcos/crypto';

interface MetaWebhookParams {
  tenantId: string;
}

interface MetaVerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

export const metaWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Verification challenge (GET /webhooks/meta)
  fastify.get<{ Querystring: MetaVerificationQuery }>(
    '/webhooks/meta',
    async (request, reply) => {
      const mode = request.query['hub.mode'];
      const token = request.query['hub.verify_token'];
      const challenge = request.query['hub.challenge'];

      const expectedToken = process.env['META_VERIFY_TOKEN'] || 'wcos-meta-verify-token';

      if (mode === 'subscribe' && token === expectedToken) {
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
      const signatureHeader = request.headers['x-hub-signature-256'] as string | undefined;

      // HMAC Verification if app secret is configured
      const appSecret = process.env['META_APP_SECRET'];
      if (appSecret && signatureHeader && request.rawBody) {
        const signature = signatureHeader.replace('sha256=', '');
        const isValid = verifyHmacSha256(request.rawBody, appSecret, signature);
        if (!isValid) {
          return reply.status(401).send({ error: 'Invalid HMAC signature' });
        }
      }

      const body = (request.body || {}) as Record<string, any>;
      const entries = body['entry'] as any[] | undefined;
      const entry = entries?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      if (!message) {
        // Status updates (read, delivered, sent) — acknowledge and skip
        return reply.status(200).send({ status: 'acknowledged_status_update' });
      }

      const providerMessageId: string = message.id;

      // Deduplication check via Redis SETNX
      const isNew = await isNewWebhookMessage(providerMessageId);
      if (!isNew) {
        return reply.status(200).send({ status: 'duplicate_ignored', providerMessageId });
      }

      // Persist raw event
      const rawEvent = await prisma.rawWebhookEvent.create({
        data: {
          tenantId,
          source: 'meta',
          messageId: providerMessageId,
          payload: body,
        },
      });

      const customerPhone = message.from.startsWith('+') ? message.from : `+${message.from}`;
      const contact = value.contacts?.[0];

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
        id: providerMessageId,
        source: 'meta',
        instanceName: value?.metadata?.phone_number_id || 'default',
        tenantId,
        customerPhone,
        customerName: contact?.profile?.name,
        type: msgType,
        text: textContent,
        mediaUrl,
        buttonPayload,
        listPayload,
        timestamp: new Date(Number(message.timestamp) * 1000),
        rawPayload: body,
      };

      await enqueueInboundMessage({
        tenantId,
        rawEventId: rawEvent.id,
        message: normalizedMessage,
        receivedAt: new Date().toISOString(),
      });

      return reply.status(200).send({ received: true, rawEventId: rawEvent.id });
    }
  );
};
