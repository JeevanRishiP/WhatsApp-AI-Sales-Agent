import { createHash } from 'crypto';
import type { CreatePaymentLinkOptions } from './types.js';

export interface PhonePeConfig {
  merchantId: string;
  saltKey: string;
  saltIndex?: number;
  environment?: 'sandbox' | 'production';
  redirectBaseUrl?: string;
}

export interface PhonePePaymentLinkResult {
  /** Internal transaction reference (PHONEPE_TXN_xxxx) */
  transactionId: string;
  /** Hosted checkout URL to redirect / send to customer */
  redirectUrl: string;
  /** Amount in paise (for reference) */
  amount: number;
  currency: string;
  /** Whether this is a simulated sandbox mock (placeholder credentials) */
  isSandboxMock?: boolean;
}

export interface PhonePeWebhookVerificationResult {
  isValid: boolean;
  transactionId?: string;
  orderId?: string;
  amount?: number;
  status?: 'SUCCESS' | 'FAILED' | 'PENDING';
}

/**
 * Resolves the unified application base URL (public tunnel or local server)
 * for customer checkout links and gateway webhook callbacks.
 *
 * Precedence:
 *   1. APP_BASE_URL (unified public URL / tunnel, e.g. https://xyz.ngrok-free.app)
 *   2. HOST_URL (legacy environment variable)
 *   3. API_URL (fallback API host)
 *   4. http://localhost:${PORT || 3002}
 */
export function getAppBaseUrl(): string {
  const raw =
    process.env['APP_BASE_URL'] ||
    process.env['HOST_URL'] ||
    process.env['API_URL'] ||
    `http://localhost:${process.env['PORT'] || 3002}`;
  return raw.replace(/\/+$/, '');
}

/**
 * Normalizes any existing or saved payment URL to use the currently configured
 * application base URL (e.g. tunnel or port), replacing any stale localhost/tunnel origin.
 */
export function normalizePaymentUrl(
  rawUrl?: string | null,
  fallback?: { orderId: string; amount?: number; orderNumber?: string; tenantId: string }
): string {
  const base = getAppBaseUrl();
  if (!rawUrl) {
    if (fallback) {
      return `${base}/payments/checkout/phonepe/${fallback.orderId}?amount=${fallback.amount || 0}&ref=${fallback.orderNumber || ''}&tenantId=${fallback.tenantId}`;
    }
    return '';
  }

  try {
    const url = new URL(rawUrl);
    return `${base}${url.pathname}${url.search}`;
  } catch {
    if (rawUrl.startsWith('/')) {
      return `${base}${rawUrl}`;
    }
    return rawUrl;
  }
}

/**
 * PhonePe Payment Gateway Service
 *
 * Supports:
 * - PhonePe UAT / Sandbox API (merchants.phonepe.com/v3/test)
 * - Local deterministic sandbox simulator (when placeholder keys are used)
 * - SHA256 + salt checksum verification for webhooks
 */
export class PhonePeService {
  private merchantId: string;
  private saltKey: string;
  private saltIndex: number;
  private baseUrl: string;
  public readonly isSandbox: boolean;

  // PhonePe UAT sandbox base URL
  private static readonly SANDBOX_URL = 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  // PhonePe Production URL
  private static readonly PRODUCTION_URL = 'https://api.phonepe.com/apis/hermes';

  constructor(config?: Partial<PhonePeConfig>) {
    this.merchantId =
      config?.merchantId ||
      process.env['PHONEPE_MERCHANT_ID'] ||
      'PGTESTPAYUAT'; // PhonePe official UAT merchant ID

    this.saltKey =
      config?.saltKey ||
      process.env['PHONEPE_SALT_KEY'] ||
      '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399'; // Official PhonePe UAT salt key

    this.saltIndex = config?.saltIndex ?? parseInt(process.env['PHONEPE_SALT_INDEX'] || '1', 10);

    const env = config?.environment || (process.env['PHONEPE_ENVIRONMENT'] as 'sandbox' | 'production' | undefined) || 'sandbox';
    this.isSandbox = env !== 'production';
    this.baseUrl = this.isSandbox ? PhonePeService.SANDBOX_URL : PhonePeService.PRODUCTION_URL;
  }

  /**
   * Returns true when placeholder / official UAT keys are being used.
   * PhonePe's official test creds (PGTESTPAYUAT) do make real UAT calls —
   * we only skip network when the user hasn't configured any keys at all.
   */
  private isPlaceholderKey(): boolean {
    return (
      !this.merchantId ||
      (!process.env['PHONEPE_MERCHANT_ID'] &&
        !process.env['PHONEPE_SALT_KEY'] &&
        this.merchantId === 'PGTESTPAYUAT')
    );
  }

  /**
   * Computes the X-VERIFY checksum used by PhonePe:
   * SHA256(base64EncodedPayload + apiEndpoint + saltKey) + "###" + saltIndex
   */
  computeChecksum(base64Payload: string, endpoint: string): string {
    const raw = `${base64Payload}${endpoint}${this.saltKey}`;
    const sha256 = createHash('sha256').update(raw).digest('hex');
    return `${sha256}###${this.saltIndex}`;
  }

  /**
   * Verifies PhonePe webhook callback checksum.
   * Webhook payload: base64(json) — verify SHA256(base64Payload + saltKey) + "###" + saltIndex
   */
  verifyWebhookChecksum(base64Response: string, receivedChecksum: string): boolean {
    const raw = `${base64Response}${this.saltKey}`;
    const sha256 = createHash('sha256').update(raw).digest('hex');
    const expected = `${sha256}###${this.saltIndex}`;
    return expected === receivedChecksum;
  }

  /**
   * Creates a PhonePe-hosted redirect checkout URL.
   * Returns either a real UAT Pay Page URL or a local simulator URL.
   */
  async createPaymentLink(options: CreatePaymentLinkOptions & {
    successCallbackUrl?: string;
    failureCallbackUrl?: string;
  }): Promise<PhonePePaymentLinkResult> {
    const amountInPaise = Math.round(options.amount * 100);
    const transactionId = `PHONEPE_TXN_${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    let cleanPhone = options.customerPhone.replace(/[^\d]/g, '');
    if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.slice(2);
    }

    const appBaseUrl = getAppBaseUrl();

    const callbackBase = options.successCallbackUrl || `${appBaseUrl}/payments/phonepe/callback`;
    const redirectUrl = `${callbackBase}?transactionId=${transactionId}&orderId=${options.orderId}&tenantId=${options.tenantId}`;
    const webhookCallbackUrl = options.callbackUrl || `${appBaseUrl}/webhooks/phonepe/${options.tenantId}`;

    // If using placeholder keys, skip network and use local simulator
    if (this.isPlaceholderKey()) {
      const simulatorUrl = `${appBaseUrl}/payments/checkout/phonepe/${options.orderId}?amount=${options.amount}&ref=${options.orderNumber}&tenantId=${options.tenantId}&txn=${transactionId}`;
      return {
        transactionId,
        redirectUrl: simulatorUrl,
        amount: amountInPaise,
        currency: options.currency || 'INR',
        isSandboxMock: true,
      };
    }

    // Build PhonePe Pay Page API request
    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId: transactionId,
      merchantUserId: `MUID_${cleanPhone}`,
      amount: amountInPaise,
      redirectUrl,
      redirectMode: 'REDIRECT',
      callbackUrl: webhookCallbackUrl,
      mobileNumber: cleanPhone,
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const endpoint = '/pg/v1/pay';
    const checksum = this.computeChecksum(base64Payload, endpoint);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
        },
        body: JSON.stringify({ request: base64Payload }),
      });

      if (response.ok) {
        const data: any = await response.json();
        if (data.success && data.data?.instrumentResponse?.redirectInfo?.url) {
          return {
            transactionId,
            redirectUrl: data.data.instrumentResponse.redirectInfo.url,
            amount: amountInPaise,
            currency: options.currency || 'INR',
            isSandboxMock: false,
          };
        }
        console.warn(`[PhonePeService] API returned success=false: ${JSON.stringify(data)}`);
      } else {
        const errText = await response.text();
        console.warn(`[PhonePeService] createPaymentLink HTTP ${response.status}: ${errText}`);
      }
    } catch (networkErr: any) {
      console.warn(`[PhonePeService] createPaymentLink network error: ${networkErr.message}`);
    }

    // Fallback to local sandbox simulator when UAT API is unreachable
    console.log('[PhonePeService] Falling back to local sandbox simulator');
    const simulatorUrl = `${appBaseUrl}/payments/checkout/phonepe/${options.orderId}?amount=${options.amount}&ref=${options.orderNumber}&tenantId=${options.tenantId}&txn=${transactionId}`;
    return {
      transactionId,
      redirectUrl: simulatorUrl,
      amount: amountInPaise,
      currency: options.currency || 'INR',
      isSandboxMock: true,
    };
  }

  /**
   * Check transaction status via PhonePe status API.
   */
  async checkTransactionStatus(transactionId: string): Promise<{ success: boolean; message: string; status?: string }> {
    if (this.isPlaceholderKey()) {
      return { success: true, message: 'Sandbox simulated mode — transaction status check bypassed', status: 'PAYMENT_SUCCESS' };
    }

    const endpoint = `/pg/v1/status/${this.merchantId}/${transactionId}`;
    const raw = `${endpoint}${this.saltKey}`;
    const sha256 = createHash('sha256').update(raw).digest('hex');
    const checksum = `${sha256}###${this.saltIndex}`;

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': this.merchantId,
        },
      });

      if (response.ok) {
        const data: any = await response.json();
        return {
          success: data.success,
          message: data.message || 'Status fetched',
          status: data.data?.state,
        };
      }
      return { success: false, message: `Status API returned ${response.status}` };
    } catch (err: any) {
      return { success: false, message: `Network error: ${err.message}` };
    }
  }

  /**
   * Tests connectivity to the PhonePe UAT sandbox API.
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    if (this.isPlaceholderKey()) {
      return {
        success: true,
        message: 'PhonePe Sandbox Simulated Mode Active (local checkout simulator)',
        details: { mode: 'simulated_sandbox', merchantId: this.merchantId },
      };
    }

    try {
      // Lightweight status call to a known non-existent txn — will 404 but validates credentials
      const endpoint = `/pg/v1/status/${this.merchantId}/HEALTHCHECK_TEST`;
      const raw = `${endpoint}${this.saltKey}`;
      const sha256 = createHash('sha256').update(raw).digest('hex');
      const checksum = `${sha256}###${this.saltIndex}`;

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': this.merchantId,
        },
      });

      // 400/404 means auth passed, just bad txn ID — which is expected
      if (response.status === 400 || response.status === 404 || response.ok) {
        return {
          success: true,
          message: `Successfully reached PhonePe ${this.isSandbox ? 'UAT Sandbox' : 'Production'} API`,
          details: { status: response.status, merchantId: this.merchantId, mode: this.isSandbox ? 'sandbox' : 'production' },
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: `PhonePe API Authentication Failed (${response.status}) — check PHONEPE_MERCHANT_ID and PHONEPE_SALT_KEY`,
          details: { status: response.status },
        };
      }

      return {
        success: true,
        message: `PhonePe API reachable (HTTP ${response.status})`,
        details: { status: response.status },
      };
    } catch (err: any) {
      return { success: false, message: `Network error: ${err.message}` };
    }
  }
}

// Global singleton instance
export const phonePeService = new PhonePeService();
