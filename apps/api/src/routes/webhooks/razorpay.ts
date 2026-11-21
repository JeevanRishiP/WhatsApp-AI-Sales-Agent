import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { verifyHmacSha256 } from '@wcos/crypto';
import { createTenantPaymentServices } from '@wcos/payments';
import { commitConfirmedOrderPayment } from '../../services/order-payment-commit.js';
import { config } from '../../config.js';

interface RazorpayWebhookParams {
  tenantId: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const razorpayWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: RazorpayWebhookParams }>(
    '/webhooks/razorpay/:tenantId',
    async (request, reply) => {
      const { tenantId } = request.params;
      if (!UUID_REGEX.test(tenantId)) {
        return reply.status(400).send({ error: 'Invalid tenantId parameter' });
      }

      const signature = request.headers['x-razorpay-signature'] as string | undefined;
      if (!signature || !request.rawBody) {
        return reply.status(400).send({ error: 'Missing signature or payload' });
      }

      const tenant = await prisma.tenant.findFirst({
        where: { id: tenantId, status: 'ACTIVE' },
        select: { id: true, paymentConfigEncrypted: true },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Active tenant not found' });
      }

      const { secrets } = createTenantPaymentServices(tenant.id, tenant.paymentConfigEncrypted);
      const webhookSecret =
        secrets?.razorpayWebhookSecret ||
        process.env['RAZORPAY_WEBHOOK_SECRET'] ||
        (config.NODE_ENV !== 'production' ? 'wcos-razorpay-secret' : '');

      if (!webhookSecret) {
        return reply.status(503).send({ error: 'Razorpay webhook secret not configured for tenant' });
      }

      const isValid = verifyHmacSha256(request.rawBody, webhookSecret, signature);
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid Razorpay signature' });
      }

      const body = (request.body || {}) as Record<string, any>;
      const event: string = body['event'] || '';
      const payload = body['payload'] || {};

      const paymentEntity = payload.payment?.entity;
      const paymentLinkEntity = payload.payment_link?.entity;
      const orderEntity = payload.order?.entity;

      const razorpayOrderId: string | undefined =
        paymentEntity?.order_id ||
        orderEntity?.id ||
        paymentLinkEntity?.order_id ||
        paymentLinkEntity?.id;

      const notesOrderId =
        paymentEntity?.notes?.orderId ||
        paymentLinkEntity?.notes?.orderId ||
        orderEntity?.notes?.orderId;

      const notesOrderNumber =
        paymentEntity?.notes?.orderNumber ||
        paymentLinkEntity?.notes?.orderNumber ||
        orderEntity?.notes?.orderNumber;

      const eventMessageId =
        paymentEntity?.id ||
        paymentLinkEntity?.id ||
        razorpayOrderId ||
        `rzp-evt-${Date.now()}`;

      await prisma.rawWebhookEvent.create({
        data: {
          tenantId,
          source: 'razorpay',
          messageId: String(eventMessageId),
          payload: body,
        },
      });

      const isSuccessEvent =
        event === 'payment.captured' ||
        event === 'order.paid' ||
        event === 'payment_link.paid';

      if (isSuccessEvent) {
        const orConditions: any[] = [];
        if (razorpayOrderId) orConditions.push({ razorpayOrderId });
        if (notesOrderId && UUID_REGEX.test(String(notesOrderId))) {
          orConditions.push({ id: notesOrderId });
        }
        if (notesOrderNumber) orConditions.push({ orderNumber: notesOrderNumber });
        if (paymentLinkEntity?.id) orConditions.push({ razorpayOrderId: paymentLinkEntity.id });

        const order =
          orConditions.length > 0
            ? await prisma.order.findFirst({
                where: { tenantId, OR: orConditions },
                select: { id: true, total: true, currency: true },
              })
            : null;

        if (order) {
          const paymentId = String(paymentEntity?.id || paymentLinkEntity?.id || `pay_${Date.now().toString(36)}`);
          const paidPaise = Number(
            paymentEntity?.amount ??
              orderEntity?.amount_paid ??
              paymentLinkEntity?.amount_paid ??
              0
          );
          const paidCurrency =
            paymentEntity?.currency || orderEntity?.currency || paymentLinkEntity?.currency;

          try {
            await commitConfirmedOrderPayment({
              tenantId,
              orderId: order.id,
              gateway: 'Razorpay',
              paymentMethod: 'RAZORPAY_ONLINE',
              paymentId,
              gatewayOrderId: razorpayOrderId,
              amountPaidPaise: paidPaise,
              currency: paidCurrency,
              outboxPayloadExtra: { razorpayPaymentId: paymentId },
            });
          } catch (err: any) {
            fastify.log.error({ err: err.message, orderId: order.id }, '[RazorpayWebhook] Rejected payment commit');
            return reply.status(400).send({ error: err.message });
          }
        }
      }

      return reply.status(200).send({ status: 'ok' });
    }
  );
};
