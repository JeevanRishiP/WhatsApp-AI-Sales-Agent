import { Worker } from 'bullmq';
import { createInboundMessageWorker } from './workers/inbound-worker.js';
import { createOutboundMessageWorker } from './workers/outbound-worker.js';
import { processFollowUp } from './processors/follow-up.js';
import { cleanupExpiredReservations, processOutboxBatch } from './cron/maintenance.js';
import {
  QUEUE_NAMES,
  createWorkerRedisConnection,
  closeAllQueues,
  closeRedisConnection,
  type FollowUpJobData,
} from '@wcos/queue';
import { prisma } from '@wcos/db';

async function main() {
  console.log('⚡ Initializing WCOS Sales Agent Worker Service...');

  const inboundWorker = createInboundMessageWorker();
  const outboundWorker = createOutboundMessageWorker();
  const followUpWorker = new Worker<FollowUpJobData>(
    QUEUE_NAMES.FOLLOW_UPS,
    processFollowUp,
    {
      connection: createWorkerRedisConnection(),
      concurrency: 5,
    }
  );

  followUpWorker.on('failed', (job, err) => {
    console.error(`[FollowUpWorker] Job ${job?.id} failed:`, err);
  });

  // Periodic maintenance: release expired reservations (60s) & flush transactional outbox (10s)
  const reservationTimer = setInterval(() => {
    cleanupExpiredReservations().catch((err) =>
      console.error('[Maintenance] cleanupExpiredReservations failed:', err)
    );
  }, 60_000);

  const outboxTimer = setInterval(() => {
    processOutboxBatch().catch((err) =>
      console.error('[Maintenance] processOutboxBatch failed:', err)
    );
  }, 10_000);

  console.log('✅ Inbound Message Worker listening on queue: wcos-inbound-messages');
  console.log('✅ Outbound Message Worker listening on queue: wcos-outbound-messages');
  console.log('✅ Follow-Up Worker listening on queue: wcos-follow-ups');
  console.log('✅ Maintenance timers scheduled (reservations: 60s, outbox: 10s)');

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
    clearInterval(reservationTimer);
    clearInterval(outboxTimer);
    try {
      await Promise.all([
        inboundWorker.close(),
        outboundWorker.close(),
        followUpWorker.close(),
      ]);
      await closeAllQueues();
      await closeRedisConnection();
      await prisma.$disconnect();
      console.log('Worker connections closed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('Error during worker shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Worker startup failure:', err);
  process.exit(1);
});
