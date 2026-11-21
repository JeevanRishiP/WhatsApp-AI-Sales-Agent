import { Redis, type RedisOptions } from 'ioredis';

let sharedQueueRedisClient: Redis | null = null;
let sharedCacheRedisClient: Redis | null = null;
const workerConnections = new Set<Redis>();

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  tls?: boolean;
}

function buildRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times: number) {
      return Math.min(times * 100, 3000);
    },
  };
}

function createRedisInstance(redisUrl: string): Redis {
  const options = buildRedisOptions();
  const allowInsecureTls = process.env['REDIS_TLS_INSECURE'] === 'true';

  const client = redisUrl.startsWith('rediss://')
    ? new Redis(redisUrl, {
        ...options,
        tls: {
          rejectUnauthorized: !allowInsecureTls,
        },
      })
    : new Redis(redisUrl, options);

  client.on('error', (err) => {
    console.error('[Redis Error]', err.message);
  });

  return client;
}

/**
 * Primary queue/lock Redis connection (BullMQ Queues, Distributed Locks).
 * Should point to a Redis instance configured with `noeviction`.
 */
export function getRedisConnection(config?: RedisConfig): Redis {
  if (sharedQueueRedisClient && sharedQueueRedisClient.status !== 'end') {
    return sharedQueueRedisClient;
  }

  const redisUrl =
    config?.url ||
    process.env['REDIS_QUEUE_URL'] ||
    process.env['REDIS_URL'] ||
    'redis://localhost:6379';

  sharedQueueRedisClient = createRedisInstance(redisUrl);
  return sharedQueueRedisClient;
}

/**
 * Volatile/cache Redis connection (Rate limiting, OTPs, Magic Links, Deduplication, Carts).
 * Falls back to REDIS_URL when REDIS_CACHE_URL is not configured separately.
 */
export function getRedisCacheConnection(): Redis {
  if (sharedCacheRedisClient && sharedCacheRedisClient.status !== 'end') {
    return sharedCacheRedisClient;
  }

  const redisUrl =
    process.env['REDIS_CACHE_URL'] ||
    process.env['REDIS_URL'] ||
    'redis://localhost:6379';

  sharedCacheRedisClient = createRedisInstance(redisUrl);
  return sharedCacheRedisClient;
}

/**
 * Creates a dedicated blocking connection for an individual BullMQ Worker,
 * preventing head-of-line blocking across concurrent workers and queues.
 */
export function createWorkerRedisConnection(): Redis {
  const redisUrl =
    process.env['REDIS_QUEUE_URL'] ||
    process.env['REDIS_URL'] ||
    'redis://localhost:6379';

  const client = createRedisInstance(redisUrl);
  workerConnections.add(client);
  return client;
}

/**
 * Closes all Redis connections gracefully.
 */
export async function closeRedisConnection(): Promise<void> {
  const tasks: Array<Promise<unknown>> = [];
  if (sharedQueueRedisClient) {
    tasks.push(sharedQueueRedisClient.quit().catch(() => {}));
    sharedQueueRedisClient = null;
  }
  if (sharedCacheRedisClient) {
    tasks.push(sharedCacheRedisClient.quit().catch(() => {}));
    sharedCacheRedisClient = null;
  }
  for (const conn of workerConnections) {
    tasks.push(conn.quit().catch(() => {}));
  }
  workerConnections.clear();
  await Promise.all(tasks);
}
