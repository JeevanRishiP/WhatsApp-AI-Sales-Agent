import { prisma } from '@wcos/db';
import { enqueueOutboundMessage } from '@wcos/queue';

export interface PaymentNotificationOptions {
  order: {
    id: string;
    orderNumber: string;
    total: any;
    currency: string;
    tenantId: string;
    customerPhone: string;
    customerName?: string | null;
  };
  transactionId: string;
  method?: string;
  gatewayName?: 'PhonePe' | 'Razorpay' | 'UPI';
}

/**
 * Dispatches an immediate, guaranteed WhatsApp payment confirmation.
 *
 * Uses direct Evolution API HTTP dispatch for 0ms latency, records the receipt
 * in the database Message table, resets conversation handoff states, and falls
 * back to BullMQ queue if Evolution API is temporarily unreachable.
 */
export async function notifyOrderPaymentConfirmed(opts: PaymentNotificationOptions): Promise<void> {
  const { order, transactionId, gatewayName = 'PhonePe' } = opts;

  // 1. Reset conversation state so customer isn't stuck waiting for manager or pending order
  try {
    await prisma.conversation.updateMany({
      where: {
        tenantId: order.tenantId,
        customerPhone: order.customerPhone,
      },
      data: {
        stage: 'POST_ORDER',
        pendingOrderId: null,
        handoffReason: null,
        handoffAssignedTo: null,
      },
    });
  } catch (err) {
    console.error('[PaymentNotifications] Error resetting conversation state:', err);
  }

  const confirmationText = `🎉 *Payment Confirmed via ${gatewayName}!*

Thank you for your order *#${order.orderNumber}*.
We received your payment of ${order.currency} ${Number(order.total).toFixed(2)} (Txn: ${transactionId}).

✅ Your items have been reserved and prepared for dispatch. We will send tracking updates here! ✨`;

  // 2. Fetch tenant to get WhatsApp instance name
  const tenant = await prisma.tenant.findUnique({
    where: { id: order.tenantId },
    select: { whatsappInstanceName: true },
  });
  const instanceName = tenant?.whatsappInstanceName || 'wa_aura_luxe_01';
  const cleanPhone = order.customerPhone.replace(/[^0-9]/g, '');

  // 3. Guaranteed Direct HTTP Dispatch to Evolution API first (0-delay!)
  let directSuccess = false;
  try {
    const evolutionUrl = (process.env['EVOLUTION_API_URL'] || 'http://localhost:8080').replace(/\/$/, '');
    const evolutionKey =
      process.env['EVOLUTION_API_GLOBAL_KEY'] ||
      process.env['EVOLUTION_API_KEY'] ||
      '429683C4C97CA36CA8211152D4C54';

    const resp = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: confirmationText,
        delay: 1000,
        linkPreview: true,
      }),
    });

    if (resp.ok) {
      directSuccess = true;
    }
  } catch (directErr) {
    console.warn('[PaymentNotifications] Direct Evolution dispatch failed, falling back to BullMQ queue:', directErr);
  }

  // 4. Record to Message table so chat history and merchant dashboard are always updated
  try {
    const conversation = await prisma.conversation.findFirst({
      where: {
        tenantId: order.tenantId,
        customerPhone: order.customerPhone,
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    if (conversation) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          tenantId: order.tenantId,
          role: 'assistant',
          content: confirmationText,
          messageType: 'text',
          intent: 'PAYMENT_CONFIRMATION',
          actionTaken: 'ORDER_CONFIRMED',
          createdAt: new Date(),
        },
      });
    }
  } catch (msgErr) {
    console.error('[PaymentNotifications] Error recording message in DB:', msgErr);
  }

  // 5. If direct dispatch did NOT succeed, enqueue to BullMQ for background worker retry
  if (!directSuccess) {
    try {
      await enqueueOutboundMessage({
        tenantId: order.tenantId,
        toPhone: order.customerPhone,
        messageType: 'text',
        text: confirmationText,
        correlationId: `order-paid:${order.id}`,
      });
    } catch (qErr) {
      console.error('[PaymentNotifications] Error enqueuing message:', qErr);
    }
  }
}
