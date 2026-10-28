import { getRedisConnection } from '@wcos/queue';

/**
 * Checks if a webhook message has already been processed using Redis SETNX with a 24-hour TTL.
 *
 * @returns true if the message is NEW (lock acquired)
 * @returns false if the message is a DUPLICATE (key already exists)
 */
export async function isNewWebhookMessage(
  providerMessageId: string,
  ttlSeconds = 86400
): Promise<boolean> {
  if (!providerMessageId) {
    return true; // No message ID to deduplicate against, let it pass
  }

  const redis = getRedisConnection();
  const key = `dedupe:webhook:${providerMessageId}`;

  // 'NX' ensures the key is only set if it does not already exist
  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}
