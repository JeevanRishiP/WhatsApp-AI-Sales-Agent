import crypto from 'node:crypto';

/**
 * Computes an HMAC SHA-256 signature for a payload.
 */
export function computeHmacSha256(payload: string | Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Timing-safe HMAC verification to protect against timing attacks.
 */
export function verifyHmacSha256(
  payload: string | Buffer,
  secret: string,
  expectedSignatureHex: string
): boolean {
  try {
    const computedSignature = computeHmacSha256(payload, secret);
    const computedBuffer = Buffer.from(computedSignature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignatureHex, 'hex');

    if (computedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(computedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Timing-safe string equality comparison (e.g. for API keys).
 */
export function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
