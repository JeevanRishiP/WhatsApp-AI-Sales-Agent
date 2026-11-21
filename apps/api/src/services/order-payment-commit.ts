import { prisma } from '@wcos/db';
import { notifyOrderPaymentConfirmed } from './payment-notifications.js';

export interface CommitOrderPaymentParams {
  tenantId: string;
  orderId: string;
  gateway: 'Razorpay' | 'PhonePe';
  paymentMethod: 'RAZORPAY_ONLINE' | 'PHONEPE_ONLINE';
  paymentId: string;
  gatewayOrderId?: string;
  amountPaidPaise: number;
  currency?: string;
  outboxPayloadExtra?: Record<string, unknown>;
}

/**
 * Shared atomic payment confirmation handler used by both Razorpay and PhonePe webhooks.
 * Guarantees:
 * - Strict amount & currency verification
 * - Idempotent CAS transition from PENDING_PAYMENT -> PAYMENT_CONFIRMED (prevents race/regression)
 * - Atomic inventory commit (stock decrement + reserved release)
 * - Conversation stage reset to POST_ORDER
 * - Single OutboxEvent & WhatsApp confirmation dispatch
 */
export async function commitConfirmedOrderPayment(
  params: CommitOrderPaymentParams
): Promise<{ committed: boolean; reason?: string }> {
  const {
    tenantId,
    orderId,
    gateway,
    paymentMethod,
    paymentId,
    gatewayOrderId,
    amountPaidPaise,
    currency,
    outboxPayloadExtra = {},
  } = params;

  const orderSnapshot = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: { items: true, reservation: true },
  });

  if (!orderSnapshot) {
    return { committed: false, reason: 'order_not_found' };
  }

  // 1. Validate currency & paid amount (>= order total in minor units)
  const expectedPaise = Math.round(Number(orderSnapshot.total) * 100);
  if (currency && currency.toUpperCase() !== orderSnapshot.currency.toUpperCase()) {
    throw new Error(
      `Currency mismatch for order ${orderSnapshot.orderNumber}: expected ${orderSnapshot.currency}, received ${currency}`
    );
  }
  if (!Number.isFinite(amountPaidPaise) || amountPaidPaise < expectedPaise) {
    throw new Error(
      `Underpayment rejected for order ${orderSnapshot.orderNumber}: expected >= ${expectedPaise} paise, received ${amountPaidPaise}`
    );
  }

  const committedResult = await prisma.$transaction(async (tx) => {
    // 2. Atomic Compare-And-Set prevents duplicate concurrent webhooks and state regression
    const existingHistory = Array.isArray(orderSnapshot.statusHistory)
      ? (orderSnapshot.statusHistory as any[])
      : [];

    const casResult = await tx.order.updateMany({
      where: {
        id: orderSnapshot.id,
        tenantId,
        status: 'PENDING_PAYMENT',
      },
      data: {
        status: 'PAYMENT_CONFIRMED',
        paymentMethod,
        razorpayPaymentId: paymentId,
        ...(gatewayOrderId ? { razorpayOrderId: gatewayOrderId } : {}),
        statusHistory: [
          ...existingHistory,
          {
            status: 'PAYMENT_CONFIRMED',
            timestamp: new Date().toISOString(),
            updatedBy: `${gateway.toLowerCase()}_webhook`,
            note: `${gateway} payment confirmed (Ref: ${paymentId})`,
          },
        ],
      },
    });

    if (casResult.count !== 1) {
      return false;
    }

    // 3. Commit InventoryReservation & deduct stock (fallback to order.items if reservation was absent/expired)
    let deductedFromReservation = false;
    if (orderSnapshot.reservationId) {
      const resUpdate = await tx.inventoryReservation.updateMany({
        where: { id: orderSnapshot.reservationId, status: 'ACTIVE' },
        data: { status: 'COMMITTED' },
      });

      if (resUpdate.count === 1 && orderSnapshot.reservation) {
        const resItems = Array.isArray(orderSnapshot.reservation.items)
          ? (orderSnapshot.reservation.items as Array<{ productId: string; quantity: number }>)
          : [];
        for (const item of resItems) {
          if (item.productId && typeof item.quantity === 'number' && item.quantity > 0) {
            await tx.$executeRaw`
              UPDATE "Product"
              SET stock = GREATEST(0, stock - ${item.quantity}),
                  reserved = GREATEST(0, reserved - ${item.quantity}),
                  "updatedAt" = NOW()
              WHERE id = ${item.productId}::uuid AND "tenantId" = ${tenantId}::uuid
            `;
          }
        }
        deductedFromReservation = true;
      }
    }

    if (!deductedFromReservation) {
      for (const item of orderSnapshot.items) {
        await tx.$executeRaw`
          UPDATE "Product"
          SET stock = GREATEST(0, stock - ${item.quantity}),
              "updatedAt" = NOW()
          WHERE id = ${item.productId}::uuid AND "tenantId" = ${tenantId}::uuid
        `;
      }
    }

    // 4. Reset active conversation waiting on this order
    await tx.conversation.updateMany({
      where: {
        tenantId,
        OR: [{ pendingOrderId: orderSnapshot.id }, { customerPhone: orderSnapshot.customerPhone }],
      },
      data: {
        stage: 'POST_ORDER',
        pendingOrderId: null,
      },
    });

    // 5. Append transactional OutboxEvent for reliable downstream propagation
    await tx.outboxEvent.create({
      data: {
        tenantId,
        aggregateId: orderSnapshot.id,
        aggregateType: 'ORDER',
        eventType: 'ORDER_PAID',
        payload: {
          orderId: orderSnapshot.id,
          orderNumber: orderSnapshot.orderNumber,
          total: orderSnapshot.total.toString(),
          customerPhone: orderSnapshot.customerPhone,
          gateway,
          paymentId,
          ...outboxPayloadExtra,
        },
      },
    });

    return true;
  });

  if (!committedResult) {
    return { committed: false, reason: 'already_processed_or_invalid_state' };
  }

  await notifyOrderPaymentConfirmed({
    order: orderSnapshot,
    transactionId: paymentId,
    gatewayName: gateway,
  });

  return { committed: true };
}

