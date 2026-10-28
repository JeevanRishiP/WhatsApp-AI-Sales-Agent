import { type FastifyPluginAsync } from 'fastify';
import { createHash } from 'node:crypto';
import { prisma } from '@wcos/db';
import { notifyOrderPaymentConfirmed } from '../../services/payment-notifications.js';

/** Verify PhonePe SHA256 webhook checksum inline (no external dep needed) */
function verifyPhonePeChecksum(
  base64Response: string,
  receivedChecksum: string,
  saltKey: string,
  saltIndex: number
): boolean {
  const raw = `${base64Response}${saltKey}`;
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const expected = `${sha256}###${saltIndex}`;
  return expected === receivedChecksum;
}

const PHONEPE_SALT_KEY = process.env['PHONEPE_SALT_KEY'] || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
const PHONEPE_SALT_INDEX = parseInt(process.env['PHONEPE_SALT_INDEX'] || '1', 10);

interface PhonePeWebhookParams {
  tenantId: string;
}

/**
 * PhonePe Webhook Handler
 *
 * Handles callbacks from PhonePe's Pay Page after payment completion.
 * Verifies the SHA256 + saltKey checksum before processing any state transitions.
 *
 * Endpoint: POST /webhooks/phonepe/:tenantId
 * Registration: also handles GET redirect callbacks from PhonePe Pay Page UI
 */
export const phonePeWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── POST: Server-to-server callback from PhonePe ──────────────
  fastify.post<{ Params: PhonePeWebhookParams }>(
    '/webhooks/phonepe/:tenantId',
    async (request, reply) => {
      const { tenantId } = request.params;

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const body = (request.body || {}) as Record<string, any>;

      // PhonePe sends: { response: "<base64>" } with header X-VERIFY
      const base64Response: string = body['response'] || '';
      const xVerify = (request.headers['x-verify'] as string) || '';

      if (!base64Response || !xVerify) {
        return reply.status(400).send({ error: 'Missing PhonePe response or X-VERIFY header' });
      }

      // Verify checksum
      const isValid = verifyPhonePeChecksum(base64Response, xVerify, PHONEPE_SALT_KEY, PHONEPE_SALT_INDEX);
      if (!isValid) {
        fastify.log.warn({ tenantId }, '[PhonePe] Webhook signature verification failed');
        return reply.status(401).send({ error: 'Invalid PhonePe checksum' });
      }

      // Decode and parse the response
      let decoded: any;
      try {
        decoded = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf8'));
      } catch {
        return reply.status(400).send({ error: 'Failed to decode PhonePe response payload' });
      }

      const transactionId: string = decoded?.data?.merchantTransactionId || decoded?.merchantTransactionId || '';
      const status: string = decoded?.data?.state || decoded?.state || decoded?.code || '';
      const phonePePaymentId: string = decoded?.data?.transactionId || decoded?.transactionId || transactionId;

      // Persist raw webhook event
      const eventMessageId = transactionId || `phonepe-evt-${Date.now()}`;
      await prisma.rawWebhookEvent.create({
        data: {
          tenantId,
          source: 'phonepe',
          messageId: eventMessageId,
          payload: decoded,
        },
      });

      const isSuccess =
        status === 'COMPLETED' ||
        status === 'PAYMENT_SUCCESS' ||
        status === 'SUCCESS' ||
        decoded?.success === true;

      if (isSuccess && transactionId) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transactionId);
        const orConditions: any[] = [
          ...(isUuid ? [{ id: transactionId }] : []),
          { razorpayOrderId: `PHONEPE:${transactionId}` },
          { razorpayOrderId: transactionId },
        ];

        const order = await prisma.order.findFirst({
          where: { tenantId, OR: orConditions },
          include: { items: true, reservation: true },
        });

        if (order && order.status !== 'PAYMENT_CONFIRMED') {
          await prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: 'PAYMENT_CONFIRMED',
                paymentMethod: 'PHONEPE_ONLINE' as any,
                razorpayPaymentId: phonePePaymentId,
                statusHistory: [
                  ...((order.statusHistory as any[]) || []),
                  {
                    status: 'PAYMENT_CONFIRMED',
                    timestamp: new Date().toISOString(),
                    updatedBy: 'phonepe_webhook',
                    note: `PhonePe payment confirmed (Txn: ${phonePePaymentId})`,
                  },
                ],
              },
            });

            if (order.reservationId) {
              const reservation = await tx.inventoryReservation.findUnique({
                where: { id: order.reservationId },
              });
              if (reservation && reservation.status === 'ACTIVE') {
                await tx.inventoryReservation.update({
                  where: { id: reservation.id },
                  data: { status: 'COMMITTED' },
                });
                const items = Array.isArray(reservation.items)
                  ? (reservation.items as Array<{ productId: string; quantity: number }>)
                  : [];
                for (const item of items) {
                  if (item.productId && typeof item.quantity === 'number') {
                    await tx.product.update({
                      where: { id: item.productId },
                      data: {
                        stock: { decrement: item.quantity },
                        reserved: { decrement: item.quantity },
                      },
                    });
                  }
                }
              }
            }

            // Reset any active conversation waiting for this order
            await tx.conversation.updateMany({
              where: { tenantId, pendingOrderId: order.id },
              data: {
                stage: 'POST_ORDER',
                pendingOrderId: null,
              },
            });

            await tx.outboxEvent.create({
              data: {
                tenantId,
                aggregateId: order.id,
                aggregateType: 'ORDER',
                eventType: 'ORDER_PAID',
                payload: {
                  orderId: order.id,
                  orderNumber: order.orderNumber,
                  total: order.total.toString(),
                  customerPhone: order.customerPhone,
                  phonePeTransactionId: phonePePaymentId,
                },
              },
            });
          });

          await notifyOrderPaymentConfirmed({
            order,
            transactionId: phonePePaymentId,
            gatewayName: 'PhonePe',
          });
        }
      }

      return reply.status(200).send({ status: 'ok' });
    }
  );

  // ─── GET: Customer redirect callback after payment ──────────────
  // PhonePe redirects customer browser to redirectUrl with query params
  fastify.get<{
    Querystring: { transactionId?: string; orderId?: string; status?: string; tenantId?: string };
  }>(
    '/payments/phonepe/callback',
    async (request, reply) => {
      const { transactionId = '', orderId = '', status = '' } = request.query;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
      const order = isUuid && orderId
        ? await prisma.order.findUnique({ where: { id: orderId } })
        : null;

      // PhonePe Pay Page returns query params to indicate completion
      const isSuccess =
        status === 'SUCCESS' ||
        status === 'COMPLETED' ||
        (order && order.status === 'PAYMENT_CONFIRMED');

      const html = `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>${isSuccess ? 'Payment Successful — PhonePe' : 'Payment Processing — PhonePe'}</title>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d0d1a; color: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
              .card { background: #111827; border: 1px solid #1f2937; border-radius: 16px; max-width: 440px; width: 100%; padding: 40px 32px; text-align: center; }
              .icon { font-size: 4rem; margin-bottom: 16px; }
              h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 8px; }
              p { font-size: 0.875rem; color: #94a3b8; line-height: 1.6; }
              .txn { font-family: monospace; font-size: 0.8rem; color: #60a5fa; margin-top: 12px; }
              .btn { display: inline-block; margin-top: 24px; padding: 12px 28px; background: #6366f1; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 0.9rem; cursor: pointer; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">${isSuccess ? '✅' : '⏳'}</div>
              <h1 style="color: ${isSuccess ? '#4ade80' : '#f8fafc'}">${isSuccess ? 'Payment Successful!' : 'Payment Received'}</h1>
              <p>${isSuccess ? 'Your PhonePe payment has been confirmed. A WhatsApp confirmation has been sent to you.' : 'Your payment is being processed. You will receive a WhatsApp confirmation shortly.'}</p>
              ${transactionId ? `<div class="txn">Txn ID: ${transactionId}</div>` : ''}
              <a href="/" class="btn">Back to Store</a>
            </div>
          </body>
        </html>
      `;
      return reply.type('text/html').send(html);
    }
  );
};
