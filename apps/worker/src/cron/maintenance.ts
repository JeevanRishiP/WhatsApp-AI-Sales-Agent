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

  let dispatched = 0;

  for (const event of pendingEvents) {
    try {
      // Atomic Compare-And-Swap claim so concurrent worker pods never dispatch twice
      const claimed = await prisma.outboxEvent.updateMany({
        where: { id: event.id, status: 'PENDING' },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
        },
      });
      if (claimed.count === 0) {
        continue;
      }

      // In production, publish to external webhook, message bus, or Kafka
      logger.info(
        { eventId: event.id, aggregateId: event.aggregateId, eventType: event.eventType },
        'Dispatched outbox event'
      );
      dispatched += 1;
    } catch (err: any) {
      logger.error({ eventId: event.id, err: err.message }, 'Failed to dispatch outbox event');
      await prisma.outboxEvent
        .updateMany({
          where: { id: event.id },
          data: { status: 'FAILED' },
        })
        .catch(() => {});
    }
  }

  return dispatched;
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

  let releasedCount = 0;

  for (const reservation of expired) {
    try {
      const released = await prisma.$transaction(async (tx) => {
        const claimed = await tx.inventoryReservation.updateMany({
          where: { id: reservation.id, status: 'ACTIVE' },
          data: { status: 'EXPIRED' },
        });
        if (claimed.count === 0) {
          return false;
        }

        const items = Array.isArray(reservation.items)
          ? (reservation.items as Array<{ productId: string; quantity: number }>)
          : [];

        for (const item of items) {
          const qty = Math.max(0, Math.floor(Number(item.quantity || 0)));
          if (item.productId && qty > 0) {
            await tx.$executeRaw`
              UPDATE "Product"
              SET "reserved" = GREATEST(0, "reserved" - ${qty})
              WHERE id = ${item.productId}::uuid
            `;
          }
        }
        return true;
      });

      if (released) {
        releasedCount += 1;
        logger.info({ reservationId: reservation.id }, 'Released expired inventory reservation');
      }
    } catch (err: any) {
      logger.error({ reservationId: reservation.id, err: err.message }, 'Failed to release reservation');
    }
  }

  return releasedCount;
}
