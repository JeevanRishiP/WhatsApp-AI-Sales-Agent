import { Redis, type RedisOptions } from 'ioredis';

let sharedRedisClient: Redis | null = null;

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  tls?: boolean;
}

/**
 * Creates or retrieves a Redis client configured for BullMQ.
 * Note: BullMQ requires `maxRetriesPerRequest: null`.
 */
export function getRedisConnection(config?: RedisConfig): Redis {
  if (sharedRedisClient && sharedRedisClient.status !== 'end') {
    return sharedRedisClient;
  }

  const redisUrl = config?.url || process.env['REDIS_URL'] || 'redis://localhost:6379';

  const defaultOptions: RedisOptions = {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  };

  if (redisUrl.startsWith('rediss://')) {
    // Upstash or cloud provider with TLS
    sharedRedisClient = new Redis(redisUrl, {
      ...defaultOptions,
      tls: {
        rejectUnauthorized: false,
      },
    });
  } else {
    sharedRedisClient = new Redis(redisUrl, defaultOptions);
  }

  sharedRedisClient.on('error', (err) => {
    console.error('[Redis Error]', err.message);
  });

  return sharedRedisClient;
}

/**
 * Closes the Redis connection gracefully.
 */
export async function closeRedisConnection(): Promise<void> {
  if (sharedRedisClient) {
    await sharedRedisClient.quit();
    sharedRedisClient = null;
  }
}
