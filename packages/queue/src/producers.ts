import { type JobsOptions } from 'bullmq';
import { QUEUE_NAMES, getQueue } from './queues.js';
import {
  type InboundMessageJobData,
  type OutboundMessageJobData,
  type FollowUpJobData,
} from './jobs.js';

/**
 * Enqueues an inbound message for worker processing.
 * Using a deterministic jobId (e.g. rawEventId or messageId) provides BullMQ-level deduplication.
 */
export async function enqueueInboundMessage(
  data: InboundMessageJobData,
  options?: JobsOptions
) {
  const queue = getQueue<InboundMessageJobData>(QUEUE_NAMES.INBOUND_MESSAGES);
  return queue.add('process-inbound-message', data, {
    jobId: `inbound:${data.tenantId}:${data.message.id}`,
    ...options,
  });
}

/**
 * Enqueues an outbound WhatsApp message for sending.
 */
export async function enqueueOutboundMessage(
  data: OutboundMessageJobData,
  options?: JobsOptions
) {
  const queue = getQueue<OutboundMessageJobData>(QUEUE_NAMES.OUTBOUND_MESSAGES);
  return queue.add('send-outbound-message', data, {
    jobId: data.correlationId ? `outbound:${data.correlationId}` : undefined,
    ...options,
  });
}

/**
 * Schedules a follow-up or cart abandonment job with a delay.
 */
export async function scheduleFollowUp(
  data: FollowUpJobData,
  delayMs: number,
  options?: JobsOptions
) {
  const queue = getQueue<FollowUpJobData>(QUEUE_NAMES.FOLLOW_UPS);
  const compositeKey = `followup:${data.tenantId}:${data.customerId}:${data.followUpType}`;
  return queue.add('process-follow-up', data, {
    jobId: compositeKey,
    delay: delayMs,
    ...options,
  });
}
