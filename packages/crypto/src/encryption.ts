import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Derives a 32-byte tenant-specific encryption key using HKDF.
 * Prevents key reuse across tenants even with a single master key.
 */
export function deriveTenantKey(masterKeyHex: string, tenantId: string): Buffer {
  const masterKey = Buffer.from(masterKeyHex, 'hex');
  if (masterKey.length !== 32) {
    throw new Error('Master key must be exactly 32 bytes (64 hex characters).');
  }
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      masterKey,
      Buffer.from('wcos-tenant-salt-v1', 'utf8'),
      Buffer.from(tenantId, 'utf8'),
      32
    )
  );
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  const ivHex = iv.toString('hex');

  return `${ivHex}:${authTag}:${encrypted}`;
}

/**
 * Decrypts ciphertext formatted as `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
export function decrypt(encryptedPayload: string, key: Buffer): string {
  const parts = encryptedPayload.split(':');
  const [ivHex, authTagHex, ciphertextHex] = parts;
  if (!ivHex || !authTagHex || !ciphertextHex || parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected iv:authTag:ciphertext');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length. Expected ${IV_LENGTH} bytes.`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid Auth Tag length. Expected ${AUTH_TAG_LENGTH} bytes.`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted: string = decipher.update(ciphertextHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypts a JSON serializable object.
 */
export function encryptJSON<T>(obj: T, key: Buffer): string {
  return encrypt(JSON.stringify(obj), key);
}

/**
 * Decrypts an encrypted JSON payload into a typed object.
 */
export function decryptJSON<T>(encryptedPayload: string, key: Buffer): T {
  const jsonStr = decrypt(encryptedPayload, key);
  return JSON.parse(jsonStr) as T;
}
