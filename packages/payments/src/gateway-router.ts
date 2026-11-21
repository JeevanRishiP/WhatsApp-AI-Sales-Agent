import { type PhonePePaymentLinkResult } from './phonepe.js';
import { createTenantPaymentServices } from './tenant-gateways.js';
import type { CreatePaymentLinkOptions, RazorpayPaymentLinkResult } from './types.js';

/**
 * Platform hint — derived from User-Agent or explicit caller metadata.
 */
export type CustomerPlatform = 'android' | 'ios' | 'web' | 'desktop' | 'unknown';

export interface GatewayPaymentLinkResult {
  paymentUrl: string;
  gateway: 'phonepe' | 'razorpay';
  phonePeTransactionId?: string;
  razorpayOrderId?: string;
  paymentMethod: 'PHONEPE_ONLINE' | 'RAZORPAY_ONLINE';
  isSandboxMock?: boolean;
  phonepeResult?: PhonePePaymentLinkResult;
  razorpayResult?: RazorpayPaymentLinkResult;
}

export function detectPlatformFromUserAgent(userAgent: string): CustomerPlatform {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/mobile/.test(ua)) return 'android';
  return 'web';
}

export function shouldUsePrimaryPhonePe(platform: CustomerPlatform): boolean {
  return platform === 'android' || platform === 'ios' || platform === 'unknown';
}

/**
 * PaymentGatewayRouter — tenant-isolated payment link creation with failover.
 */
export class PaymentGatewayRouter {
  async createPaymentLink(
    options: CreatePaymentLinkOptions,
    platform: CustomerPlatform = 'unknown',
    tenantEncryptedPaymentConfig?: string | null
  ): Promise<GatewayPaymentLinkResult> {
    const { razorpay, phonepe } = createTenantPaymentServices(
      options.tenantId,
      tenantEncryptedPaymentConfig
    );
    const usePrimaryPhonePe = shouldUsePrimaryPhonePe(platform);

    if (usePrimaryPhonePe) {
      try {
        const result = await phonepe.createPaymentLink(options);
        return {
          paymentUrl: result.redirectUrl,
          gateway: 'phonepe',
          phonePeTransactionId: result.transactionId,
          paymentMethod: 'PHONEPE_ONLINE',
          isSandboxMock: result.isSandboxMock,
          phonepeResult: result,
        };
      } catch (err: any) {
        console.warn(
          `[GatewayRouter] PhonePe failed (platform=${platform}, tenant=${options.tenantId}), falling back to Razorpay: ${err.message}`
        );
      }
    }

    try {
      const result = await razorpay.createPaymentLink(options);
      return {
        paymentUrl: result.short_url,
        gateway: 'razorpay',
        razorpayOrderId: result.order_id || result.id,
        paymentMethod: 'RAZORPAY_ONLINE',
        isSandboxMock: result.isSandboxMock,
        razorpayResult: result,
      };
    } catch (err: any) {
      if (!usePrimaryPhonePe) {
        console.warn(
          `[GatewayRouter] Razorpay failed (platform=${platform}, tenant=${options.tenantId}), trying PhonePe fallback: ${err.message}`
        );
        const result = await phonepe.createPaymentLink(options);
        return {
          paymentUrl: result.redirectUrl,
          gateway: 'phonepe',
          phonePeTransactionId: result.transactionId,
          paymentMethod: 'PHONEPE_ONLINE',
          isSandboxMock: result.isSandboxMock,
          phonepeResult: result,
        };
      }
      throw err;
    }
  }
}

export const paymentGatewayRouter = new PaymentGatewayRouter();
