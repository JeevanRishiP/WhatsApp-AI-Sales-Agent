import { Queue, type QueueOptions } from 'bullmq';
import { getRedisConnection } from './connection.js';

export const QUEUE_NAMES = {
  INBOUND_MESSAGES: 'wcos-inbound-messages',
  OUTBOUND_MESSAGES: 'wcos-outbound-messages',
  FOLLOW_UPS: 'wcos-follow-ups',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const defaultQueueOptions: Partial<QueueOptions> = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // keep for 1 hour
      count: 5000,
    },
    removeOnFail: {
      age: 86400 * 7, // keep failures for 7 days
      count: 10000,
    },
  },
};

const queueRegistry = new Map<string, Queue>();

export function getQueue<T = any>(name: QueueName): Queue<T> {
  if (queueRegistry.has(name)) {
    return queueRegistry.get(name) as Queue<T>;
  }

  const connection = getRedisConnection();
  const queue = new Queue<T>(name, {
    ...defaultQueueOptions,
    connection,
  });

  queueRegistry.set(name, queue);
  return queue;
}

export async function closeAllQueues(): Promise<void> {
  for (const queue of queueRegistry.values()) {
    await queue.close();
  }
  queueRegistry.clear();
}
