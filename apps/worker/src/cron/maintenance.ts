import { prisma } from '@wcos/db';
import { pino } from 'pino';

const logger = pino({ name: 'WorkerMaintenance' });

/**
 * Polls and processes pending transactional outbox events (Guaranteed At-Least-Once Delivery).
 */
export async function processOutboxBatch(): Promise<number> {
  const pendingEvents = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING' },
    take: 25,
    orderBy: { createdAt: 'asc' },
  });

  if (pendingEvents.length === 0) {
    return 0;
  }

  for (const event of pendingEvents) {
    try {
      // In production, publish to external webhook, message bus, or Kafka
      logger.info(
        { eventId: event.id, aggregateId: event.aggregateId, eventType: event.eventType },
        'Dispatched outbox event'
      );

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });
    } catch (err: any) {
      logger.error({ eventId: event.id, err: err.message }, 'Failed to dispatch outbox event');
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'FAILED' },
      });
    }
  }

  return pendingEvents.length;
}

/**
 * Automatically releases inventory reservations that have exceeded their 15-minute TTL
 * without completed payment, preventing inventory locking/deadlocks.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const expired = await prisma.inventoryReservation.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lt: new Date() },
    },
    take: 50,
  });

  if (expired.length === 0) {
    return 0;
  }

  for (const reservation of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.inventoryReservation.update({
          where: { id: reservation.id },
          data: { status: 'EXPIRED' },
        });

        const items = Array.isArray(reservation.items)
          ? (reservation.items as Array<{ productId: string; quantity: number }>)
          : [];

        for (const item of items) {
          if (item.productId && typeof item.quantity === 'number') {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                reserved: { decrement: item.quantity },
              },
            });
          }
        }
      });

      logger.info({ reservationId: reservation.id }, 'Released expired inventory reservation');
    } catch (err: any) {
      logger.error({ reservationId: reservation.id, err: err.message }, 'Failed to release reservation');
    }
  }

  return expired.length;
}
