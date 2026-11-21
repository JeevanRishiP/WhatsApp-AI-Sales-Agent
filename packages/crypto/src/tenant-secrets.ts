import { deriveTenantKey, encryptJSON, decryptJSON } from './encryption.js';

const DEV_MASTER_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

export interface TenantPaymentSecrets {
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
  phonepeMerchantId?: string;
  phonepeSaltKey?: string;
  phonepeSaltIndex?: number;
  phonepeEnvironment?: 'sandbox' | 'production';
}

export interface TenantAiSecrets {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  googleApiKey?: string;
}

export interface TenantWhatsappSecrets {
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  evolutionWebhookSecret?: string;
  metaAccessToken?: string;
  metaAppSecret?: string;
  metaPhoneNumberId?: string;
  metaVerifyToken?: string;
}

export function resolveEncryptionMasterKey(): string {
  const key =
    process.env['ENCRYPTION_MASTER_KEY'] || process.env['MASTER_ENCRYPTION_KEY'];

  if (process.env['NODE_ENV'] === 'production') {
    if (!key || !/^[0-9a-fA-F]{64}$/.test(key) || key === DEV_MASTER_KEY) {
      throw new Error(
        'FATAL: ENCRYPTION_MASTER_KEY must be a non-default 64-character hex string in production'
      );
    }
    return key;
  }

  return key && /^[0-9a-fA-F]{64}$/.test(key) ? key : DEV_MASTER_KEY;
}

export function encryptTenantSecrets<T>(tenantId: string, payload: T): string {
  const key = deriveTenantKey(resolveEncryptionMasterKey(), tenantId);
  return encryptJSON(payload, key);
}

export function decryptTenantSecrets<T>(
  tenantId: string,
  encryptedPayload?: string | null
): T | null {
  if (!encryptedPayload) return null;
  const key = deriveTenantKey(resolveEncryptionMasterKey(), tenantId);
  return decryptJSON<T>(encryptedPayload, key);
}

export function maskSecret(secret?: string | null, visibleSuffix = 4): string {
  if (!secret) return '';
  if (secret.length <= visibleSuffix + 4) return '••••••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-visibleSuffix)}`;
}

