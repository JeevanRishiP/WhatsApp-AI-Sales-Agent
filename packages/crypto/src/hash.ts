import crypto from 'node:crypto';

/**
 * Computes a standard SHA-256 hash in hex format.
 */
export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Creates a deterministic blind index for exact-match searches on encrypted data
 * (e.g. phone number lookup, customer email lookup) using HMAC-SHA256.
 */
export function createBlindIndex(value: string, blindIndexSecret: string): string {
  const normalized = value.trim().toLowerCase();
  return crypto.createHmac('sha256', blindIndexSecret).update(normalized).digest('hex');
}

/**
 * Generates an idempotency key from composite elements.
 */
export function generateCompositeKey(...parts: string[]): string {
  return sha256(parts.join(':'));
}
