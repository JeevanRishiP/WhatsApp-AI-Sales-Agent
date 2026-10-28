import { Worker, type Job } from 'bullmq';
import { prisma } from '@wcos/db';
import { QUEUE_NAMES, getRedisConnection, type OutboundMessageJobData } from '@wcos/queue';
import { EvolutionClient } from '../whatsapp/evolution-client.js';

export function createOutboundMessageWorker(): Worker<OutboundMessageJobData> {
  const connection = getRedisConnection();
  const evolutionClient = new EvolutionClient();

  const worker = new Worker<OutboundMessageJobData>(
    QUEUE_NAMES.OUTBOUND_MESSAGES,
    async (job: Job<OutboundMessageJobData>) => {
      const { tenantId, toPhone, messageType: _messageType, text, mediaUrl, buttons } = job.data;

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      const instanceName = tenant?.whatsappInstanceName || 'sales-bot';

      if (buttons && buttons.length > 0) {
        await evolutionClient.sendButtons(
          instanceName,
          toPhone,
          tenant?.name || 'Store',
          text,
          buttons
        );
      } else if (mediaUrl) {
        await evolutionClient.sendMedia(instanceName, toPhone, mediaUrl, text);
      } else {
        await evolutionClient.sendText(instanceName, toPhone, text);
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  return worker;
}
