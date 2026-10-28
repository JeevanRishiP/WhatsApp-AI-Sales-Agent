import { type Job } from 'bullmq';
import { prisma } from '@wcos/db';
import { type FollowUpJobData, enqueueOutboundMessage, scheduleFollowUp } from '@wcos/queue';
import { CartService } from '../cart/cart-service.js';

export async function processFollowUp(job: Job<FollowUpJobData>): Promise<void> {
  const { tenantId, sessionId, followUpType } = job.data;

  // 1. Fetch conversation
  const conversation = sessionId
    ? await prisma.conversation.findUnique({ where: { id: sessionId } })
    : null;

  if (!conversation) {
    return;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return;

  const customerPhone = conversation.customerPhone;

  // 2. Handle Cart Abandonment (1 Hour)
  if (followUpType === 'cart_abandonment_1h') {
    if (conversation.stage === 'CART_ACTIVE') {
      const cart = await CartService.getCart(tenantId, customerPhone);
      if (cart.items.length > 0) {
        await enqueueOutboundMessage({
          tenantId,
          toPhone: customerPhone,
          messageType: 'text',
          text: `👋 Hi! We noticed you left *${cart.itemCount} item(s)* in your shopping cart at *${tenant.name}*.\n\n${CartService.formatCartSummary(cart)}\n\nWould you like to complete your order before stocks run out? Just reply *Checkout*!`,
          correlationId: `abandon-1h:${conversation.id}`,
        });

        // Schedule 24h follow-up if still abandoned
        await scheduleFollowUp(
          {
            tenantId,
            customerId: conversation.id,
            sessionId: conversation.id,
            followUpType: 'cart_abandonment_24h',
          },
          23 * 60 * 60 * 1000
        );
      }
    }
  }

  // 3. Handle Cart Abandonment (24 Hours)
  else if (followUpType === 'cart_abandonment_24h') {
    if (conversation.stage === 'CART_ACTIVE') {
      const cart = await CartService.getCart(tenantId, customerPhone);
      if (cart.items.length > 0) {
        await enqueueOutboundMessage({
          tenantId,
          toPhone: customerPhone,
          messageType: 'text',
          text: `⏳ Final reminder from *${tenant.name}*: The items in your cart are in high demand and selling fast!\n\nReply *Checkout* to grab yours today, or let us know if you have any questions!`,
          correlationId: `abandon-24h:${conversation.id}`,
        });
      }
    }
  }

  // 4. Handle Payment Reminder (15 Minutes)
  else if (followUpType === 'payment_reminder_15m') {
    if (conversation.stage === 'AWAITING_PAYMENT' && conversation.pendingOrderId) {
      const order = await prisma.order.findUnique({
        where: { id: conversation.pendingOrderId },
      });

      if (order && order.status === 'PENDING_PAYMENT') {
        await enqueueOutboundMessage({
          tenantId,
          toPhone: customerPhone,
          messageType: 'text',
          text: `⚠️ *Payment Reminder for Order #${order.orderNumber}*\n\nYour item reservation is expiring soon. Please complete your payment to confirm your order.\n\nIf you need help with payment, simply reply to this message!`,
          correlationId: `pay-remind:${order.id}`,
        });
      }
    }
  }
}
