import { getRedisConnection } from '@wcos/queue';
import crypto from 'node:crypto';

const RELEASE_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_LOCK_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface ConversationLockHandle {
  key: string;
  token: string;
  release: () => Promise<boolean>;
}

export class ConversationLock {
  private static TTL_MS = 30000; // 30 seconds max hold time
  private static RETRY_INTERVAL_MS = 250;
  private static MAX_WAIT_MS = 15000; // 15 seconds max wait

  /**
   * Acquires an exclusive lock for a customer's conversation.
   * If another message is actively processing, retries until timeout.
   */
  static async acquire(
    tenantId: string,
    customerPhone: string,
    ttlMs: number = ConversationLock.TTL_MS
  ): Promise<ConversationLockHandle | null> {
    const redis = getRedisConnection();
    const key = `lock:conv:${tenantId}:${customerPhone}`;
    const token = crypto.randomUUID();
    const startTime = Date.now();

    while (Date.now() - startTime < ConversationLock.MAX_WAIT_MS) {
      // SET key token PX ttl NX
      const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');

      if (acquired === 'OK') {
        // Start background heartbeat to renew lock while job is actively running
        const heartbeatInterval = Math.max(1000, Math.floor(ttlMs / 3));
        const heartbeatTimer = setInterval(async () => {
          try {
            await redis.eval(EXTEND_LOCK_LUA, 1, key, token, ttlMs.toString());
          } catch {
            // Heartbeat failed or connection reset
          }
        }, heartbeatInterval);

        // Prevent heartbeat timer from keeping Node process alive
        if (heartbeatTimer.unref) {
          heartbeatTimer.unref();
        }

        const release = async (): Promise<boolean> => {
          clearInterval(heartbeatTimer);
          try {
            const result = await redis.eval(RELEASE_LOCK_LUA, 1, key, token);
            return result === 1;
          } catch (err) {
            console.error(`[ConversationLock] Failed to release lock ${key}:`, err);
            return false;
          }
        };

        return { key, token, release };
      }

      // Wait before retrying (add slight jitter to avoid thundering herd)
      const jitter = Math.floor(Math.random() * 50);
      await new Promise((resolve) =>
        setTimeout(resolve, ConversationLock.RETRY_INTERVAL_MS + jitter)
      );
    }

    return null;
  }
}
