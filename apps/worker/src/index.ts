import { createInboundMessageWorker } from './workers/inbound-worker.js';
import { createOutboundMessageWorker } from './workers/outbound-worker.js';
import { closeAllQueues, closeRedisConnection } from '@wcos/queue';
import { prisma } from '@wcos/db';

async function main() {
  console.log('⚡ Initializing WCOS Sales Agent Worker Service...');

  const inboundWorker = createInboundMessageWorker();
  const outboundWorker = createOutboundMessageWorker();

  console.log('✅ Inbound Message Worker listening on queue: wcos-inbound-messages');
  console.log('✅ Outbound Message Worker listening on queue: wcos-outbound-messages');

  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
    try {
      await inboundWorker.close();
      await outboundWorker.close();
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
