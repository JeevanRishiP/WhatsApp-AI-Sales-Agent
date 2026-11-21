import { decryptTenantSecrets, type TenantPaymentSecrets } from '@wcos/crypto';
import { RazorpayService } from './razorpay.js';
import { PhonePeService } from './phonepe.js';

export interface TenantGatewayPair {
  razorpay: RazorpayService;
  phonepe: PhonePeService;
  secrets: TenantPaymentSecrets | null;
}

/**
 * Instantiates tenant-isolated payment gateway services from a Tenant's
 * HKDF AES-256-GCM encrypted credential vault (`Tenant.paymentConfigEncrypted`).
 */
export function createTenantPaymentServices(
  tenantId: string,
  encryptedPaymentConfig?: string | null
): TenantGatewayPair {
  const secrets = decryptTenantSecrets<TenantPaymentSecrets>(
    tenantId,
    encryptedPaymentConfig
  );

  const razorpay = new RazorpayService(
    secrets?.razorpayKeyId && secrets?.razorpayKeySecret
      ? {
          keyId: secrets.razorpayKeyId,
          keySecret: secrets.razorpayKeySecret,
          webhookSecret: secrets.razorpayWebhookSecret,
        }
      : secrets?.razorpayWebhookSecret
      ? { webhookSecret: secrets.razorpayWebhookSecret }
      : undefined
  );

  const phonepe = new PhonePeService(
    secrets?.phonepeMerchantId && secrets?.phonepeSaltKey
      ? {
          merchantId: secrets.phonepeMerchantId,
          saltKey: secrets.phonepeSaltKey,
          saltIndex: secrets.phonepeSaltIndex,
          environment: secrets.phonepeEnvironment,
        }
      : undefined
  );

  return { razorpay, phonepe, secrets };
}

