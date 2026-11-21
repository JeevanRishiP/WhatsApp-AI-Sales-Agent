import { getRedisCacheConnection } from '@wcos/queue';
import { sha256 } from '@wcos/crypto';

/**
 * Checks if a webhook message has already been processed using Redis SETNX with a 24-hour TTL.
 * Fails closed when providerMessageId is missing unless an explicit payload digest is passed.
 *
 * @returns true if the message is NEW (lock acquired)
 * @returns false if the message is a DUPLICATE or lacks any verifiable ID
 */
export async function isNewWebhookMessage(
  providerMessageId: string,
  ttlSeconds = 86400,
  fallbackPayload?: unknown
): Promise<boolean> {
  const dedupeKey = providerMessageId?.trim()
    ? providerMessageId.trim()
    : fallbackPayload
    ? `hash:${sha256(JSON.stringify(fallbackPayload))}`
    : '';

  if (!dedupeKey) {
    return false;
  }

  const redis = getRedisCacheConnection();
  const key = `dedupe:webhook:${dedupeKey}`;

  const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}
