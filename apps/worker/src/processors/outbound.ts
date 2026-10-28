import { type Job } from 'bullmq';
import { prisma } from '@wcos/db';
import { type OutboundMessageJobData } from '@wcos/queue';
import { EvolutionClient } from '../whatsapp/evolution-client.js';

export async function processOutboundMessage(job: Job<OutboundMessageJobData>): Promise<void> {
  const { tenantId, toPhone, messageType, text, mediaUrl, buttons } = job.data;

  // 1. Fetch tenant WhatsApp instance name
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    throw new Error(`[OutboundProcessor] Tenant ${tenantId} not found.`);
  }

  const instanceName = tenant.whatsappInstanceName;
  const client = new EvolutionClient();

  // 2. Dispatch via Evolution WhatsApp API
  if (messageType === 'image' && mediaUrl) {
    await client.sendMedia(instanceName, toPhone, mediaUrl, text, 'image');
  } else if (messageType === 'buttons' && buttons && buttons.length > 0) {
    await client.sendButtons(instanceName, toPhone, tenant.name, text, buttons);
  } else {
    await client.sendText(instanceName, toPhone, text);
  }
}
