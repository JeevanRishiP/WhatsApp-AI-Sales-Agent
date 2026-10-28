import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { verifyHmacSha256 } from '@wcos/crypto';
import { notifyOrderPaymentConfirmed } from '../../services/payment-notifications.js';

interface RazorpayWebhookParams {
  tenantId: string;
}

export const razorpayWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: RazorpayWebhookParams }>(
    '/webhooks/razorpay/:tenantId',
    async (request, reply) => {
      const { tenantId } = request.params;
      const signature = request.headers['x-razorpay-signature'] as string | undefined;

      if (!signature || !request.rawBody) {
        return reply.status(400).send({ error: 'Missing signature or payload' });
      }

      // 1. Fetch tenant to verify existence
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found' });
      }

      const webhookSecret = process.env['RAZORPAY_WEBHOOK_SECRET'] || 'wcos-razorpay-secret';
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

      // 2. Persist raw event
      await prisma.rawWebhookEvent.create({
        data: {
          tenantId,
          source: 'razorpay',
          messageId: eventMessageId,
          payload: body,
        },
      });

      // 3. Process payment success
      const isSuccessEvent =
        event === 'payment.captured' ||
        event === 'order.paid' ||
        event === 'payment_link.paid';

      if (isSuccessEvent) {
        // Build robust multi-predicate lookup
        const orConditions: any[] = [];
        if (razorpayOrderId) orConditions.push({ razorpayOrderId });
        if (notesOrderId) orConditions.push({ id: notesOrderId });
        if (notesOrderNumber) orConditions.push({ orderNumber: notesOrderNumber });
        if (paymentLinkEntity?.id) orConditions.push({ razorpayOrderId: paymentLinkEntity.id });

        const order =
          orConditions.length > 0
            ? await prisma.order.findFirst({
                where: {
                  tenantId,
                  OR: orConditions,
                },
                include: {
                  items: true,
                  reservation: true,
                },
              })
            : null;

        if (order && order.status !== 'PAYMENT_CONFIRMED') {
          const paymentId = paymentEntity?.id || `pay_${Date.now().toString(36)}`;
          await prisma.$transaction(async (tx) => {
            // Mark order as PAYMENT_CONFIRMED
            await tx.order.update({
              where: { id: order.id },
              data: {
                status: 'PAYMENT_CONFIRMED',
                paymentMethod: 'RAZORPAY_ONLINE',
                razorpayPaymentId: paymentId,
                razorpayOrderId: razorpayOrderId || order.razorpayOrderId || undefined,
              },
            });

            // If an inventory reservation is tied to the order, commit it and deduct stock
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

            // Create outbox event for guaranteed event delivery
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
                },
              },
            });
          });

          // Send guaranteed WhatsApp order confirmation
          await notifyOrderPaymentConfirmed({
            order,
            transactionId: paymentId,
            gatewayName: 'Razorpay',
          });
        }
      }

      return reply.status(200).send({ status: 'ok' });
    }
  );
};
