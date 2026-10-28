import { razorpayService } from './razorpay.js';
import { phonePeService, type PhonePePaymentLinkResult } from './phonepe.js';
import type { CreatePaymentLinkOptions, RazorpayPaymentLinkResult } from './types.js';

/**
 * Platform hint — derived from User-Agent or explicit caller metadata.
 * - 'android' | 'ios' → use PhonePe first, fall back to Razorpay
 * - 'web' | 'desktop'  → use Razorpay (best for browser-based card/UPI)
 */
export type CustomerPlatform = 'android' | 'ios' | 'web' | 'desktop' | 'unknown';

export interface GatewayPaymentLinkResult {
  /** The payment URL to send to the customer */
  paymentUrl: string;
  /** Which gateway ultimately generated this link */
  gateway: 'phonepe' | 'razorpay';
  /** PhonePe-specific: transaction ID for webhook reconciliation */
  phonePeTransactionId?: string;
  /** Razorpay-specific: order/link ID for webhook reconciliation */
  razorpayOrderId?: string;
  /** Payment method to persist on the Order record */
  paymentMethod: 'PHONEPE_ONLINE' | 'RAZORPAY_ONLINE';
  /** Whether the result is a local sandbox simulation */
  isSandboxMock?: boolean;
  /** Raw PhonePe result (when PhonePe was used) */
  phonepeResult?: PhonePePaymentLinkResult;
  /** Raw Razorpay result (when Razorpay was used) */
  razorpayResult?: RazorpayPaymentLinkResult;
}

/**
 * Detects the customer platform from a User-Agent string.
 * Used when the customer opens the payment checkout URL in a browser.
 */
export function detectPlatformFromUserAgent(userAgent: string): CustomerPlatform {
  const ua = userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/mobile/.test(ua)) return 'android'; // Generic mobile → treat as Android
  return 'web';
}

/**
 * Determines whether PhonePe should be the primary gateway for this platform.
 * Rules (per requirements):
 *   - android | ios | unknown → PhonePe primary, Razorpay fallback
 *   - web | desktop            → Razorpay primary
 */
export function shouldUsePrimaryPhonePe(platform: CustomerPlatform): boolean {
  return platform === 'android' || platform === 'ios' || platform === 'unknown';
}

/**
 * PaymentGatewayRouter
 *
 * Single entry-point that:
 * 1. Checks the customer platform
 * 2. Routes to PhonePe (mobile) or Razorpay (web/desktop) as primary
 * 3. Automatically falls back to the other gateway on failure
 */
export class PaymentGatewayRouter {
  /**
   * Creates a payment link using the appropriate gateway for the platform.
   * Falls back transparently to the secondary gateway on any error.
   */
  async createPaymentLink(
    options: CreatePaymentLinkOptions,
    platform: CustomerPlatform = 'unknown'
  ): Promise<GatewayPaymentLinkResult> {
    const usePrimaryPhonePe = shouldUsePrimaryPhonePe(platform);

    if (usePrimaryPhonePe) {
      // Mobile customers → try PhonePe first
      try {
        const result = await phonePeService.createPaymentLink(options);
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
          `[GatewayRouter] PhonePe failed (platform=${platform}), falling back to Razorpay: ${err.message}`
        );
        // Fall through to Razorpay below
      }
    }

    // Web/desktop primary OR PhonePe fallback → use Razorpay
    try {
      const result = await razorpayService.createPaymentLink(options);
      return {
        paymentUrl: result.short_url,
        gateway: 'razorpay',
        razorpayOrderId: result.order_id || result.id,
        paymentMethod: 'RAZORPAY_ONLINE',
        isSandboxMock: result.isSandboxMock,
        razorpayResult: result,
      };
    } catch (err: any) {
      // If both fail and we were on mobile, try PhonePe as last resort
      if (!usePrimaryPhonePe) {
        console.warn(
          `[GatewayRouter] Razorpay failed (platform=${platform}), trying PhonePe as last resort: ${err.message}`
        );
        const result = await phonePeService.createPaymentLink(options);
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

// Global singleton
export const paymentGatewayRouter = new PaymentGatewayRouter();
