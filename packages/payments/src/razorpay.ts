import { computeHmacSha256, verifyHmacSha256 } from '@wcos/crypto';
import { getAppBaseUrl } from './phonepe.js';
import type {
  RazorpayConfig,
  CreateRazorpayOrderOptions,
  RazorpayOrderResult,
  CreatePaymentLinkOptions,
  RazorpayPaymentLinkResult,
  VerifyPaymentSignatureOptions,
} from './types.js';

export class RazorpayService {
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;
  private baseUrl: string;
  public readonly isSandbox: boolean;

  constructor(config?: Partial<RazorpayConfig>) {
    this.keyId =
      config?.keyId ||
      process.env['RAZORPAY_KEY_ID'] ||
      'rzp_test_sample';

    this.keySecret =
      config?.keySecret ||
      process.env['RAZORPAY_KEY_SECRET'] ||
      'rzp_test_sample_secret';

    this.webhookSecret =
      config?.webhookSecret ||
      process.env['RAZORPAY_WEBHOOK_SECRET'] ||
      'wcos-razorpay-secret';

    this.baseUrl = config?.baseUrl || 'https://api.razorpay.com/v1';
    this.isSandbox = this.keyId.startsWith('rzp_test_');
  }

  /**
   * Helper to determine if we should make actual HTTP requests to Razorpay
   * or use the local deterministic sandbox checkout simulator.
   */
  private isPlaceholderKey(): boolean {
    return (
      !this.keyId ||
      this.keyId === 'rzp_test_sample' ||
      this.keySecret === 'rzp_test_sample_secret'
    );
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Creates a Razorpay Order (Paise conversion handled automatically).
   */
  async createOrder(options: CreateRazorpayOrderOptions): Promise<RazorpayOrderResult> {
    const amountInPaise = Math.round(options.amount * 100);

    if (this.isPlaceholderKey()) {
      const mockOrderId = `order_test_${Date.now().toString(36)}`;
      return {
        id: mockOrderId,
        entity: 'order',
        amount: amountInPaise,
        amount_paid: 0,
        amount_due: amountInPaise,
        currency: options.currency || 'INR',
        receipt: options.receipt,
        status: 'created',
        attempts: 0,
        notes: options.notes || {},
        created_at: Math.floor(Date.now() / 1000),
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.getAuthHeader(),
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: options.currency || 'INR',
          receipt: options.receipt,
          notes: options.notes || {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[RazorpayService] createOrder failed (${response.status}): ${errorText}`);
        throw new Error(`Razorpay API Error: ${response.statusText}`);
      }

      return (await response.json()) as RazorpayOrderResult;
    } catch (err: any) {
      if (this.isSandbox) {
        // Fallback to sandbox mock order so flow never breaks in dev
        console.log('[RazorpayService] Sandbox fallback: using simulated order result');
        return {
          id: `order_test_${Date.now().toString(36)}`,
          entity: 'order',
          amount: amountInPaise,
          amount_paid: 0,
          amount_due: amountInPaise,
          currency: options.currency || 'INR',
          receipt: options.receipt,
          status: 'created',
          attempts: 0,
          notes: options.notes || {},
          created_at: Math.floor(Date.now() / 1000),
        };
      }
      throw err;
    }
  }

  /**
   * Creates a Razorpay Payment Link (returns hosted payment short_url).
   */
  async createPaymentLink(options: CreatePaymentLinkOptions): Promise<RazorpayPaymentLinkResult> {
    const amountInPaise = Math.round(options.amount * 100);
    const expireMinutes = options.expireByMinutes || 15;
    const expireTimestamp = Math.floor(Date.now() / 1000) + expireMinutes * 60;

    // Format phone to standard e.g. +919876543210
    let cleanPhone = options.customerPhone.replace(/[^\d+]/g, '');
    if (!cleanPhone.startsWith('+')) {
      cleanPhone = `+91${cleanPhone}`;
    }

    const payload = {
      amount: amountInPaise,
      currency: options.currency || 'INR',
      accept_partial: false,
      reference_id: options.orderNumber,
      description: options.description || `Order #${options.orderNumber}`,
      customer: {
        name: options.customerName || 'Valued Customer',
        contact: cleanPhone,
        email: options.customerEmail || undefined,
      },
      notify: {
        sms: false,
        email: false,
      },
      reminder_enable: false,
      expire_by: expireTimestamp,
      notes: {
        tenantId: options.tenantId,
        orderId: options.orderId,
        orderNumber: options.orderNumber,
      },
      callback_url: options.callbackUrl,
      callback_method: 'get',
    };

    if (!this.isPlaceholderKey()) {
      try {
        const response = await fetch(`${this.baseUrl}/payment_links`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.getAuthHeader(),
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data: any = await response.json();
          return {
            id: data.id,
            short_url: data.short_url,
            order_id: data.order_id,
            amount: data.amount,
            amount_paid: data.amount_paid || 0,
            currency: data.currency,
            status: data.status,
            isSandboxMock: false,
          };
        } else {
          const errorBody = await response.text();
          console.warn(`[RazorpayService] createPaymentLink HTTP ${response.status}: ${errorBody}`);
        }
      } catch (networkErr: any) {
        console.warn(`[RazorpayService] createPaymentLink network error: ${networkErr.message}`);
      }
    }

    // Deterministic Sandbox Payment Simulator URL for local / test environments
    const mockLinkId = `plink_test_${Date.now().toString(36)}`;
    const mockOrderId = `order_test_${Date.now().toString(36)}`;
    const simulatorBaseUrl = getAppBaseUrl();
    const simulatorUrl = `${simulatorBaseUrl}/payments/checkout/${options.orderId}?amount=${options.amount}&ref=${options.orderNumber}&tenantId=${options.tenantId}`;

    return {
      id: mockLinkId,
      short_url: simulatorUrl,
      order_id: mockOrderId,
      amount: amountInPaise,
      amount_paid: 0,
      currency: options.currency || 'INR',
      status: 'created',
      isSandboxMock: true,
    };
  }

  /**
   * Verifies an incoming webhook signature using HMAC-SHA256.
   */
  verifyWebhookSignature(rawBody: string | Buffer, signatureHex: string): boolean {
    return verifyHmacSha256(rawBody, this.webhookSecret, signatureHex);
  }

  /**
   * Verifies payment signature returned by the client-side Razorpay Checkout modal.
   * Format: HMAC-SHA256(order_id + "|" + payment_id, secret)
   */
  verifyPaymentSignature(options: VerifyPaymentSignatureOptions): boolean {
    const expected = `${options.razorpayOrderId}|${options.razorpayPaymentId}`;
    return verifyHmacSha256(expected, this.keySecret, options.razorpaySignature);
  }

  /**
   * Generates a test webhook signature for local testing / simulation.
   */
  generateTestWebhookSignature(rawBody: string | Buffer): string {
    return computeHmacSha256(rawBody, this.webhookSecret);
  }

  /**
   * Tests connection against Razorpay Sandbox API.
   */
  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    if (this.isPlaceholderKey()) {
      return {
        success: true,
        message: 'Sandbox Simulated Mode Active (Ready for local test checkouts)',
        details: { mode: 'simulated_sandbox', keyId: this.keyId },
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders?count=1`, {
        method: 'GET',
        headers: {
          Authorization: this.getAuthHeader(),
        },
      });

      if (response.ok) {
        return {
          success: true,
          message: 'Successfully connected to Razorpay Sandbox API',
          details: { status: response.status, mode: this.isSandbox ? 'sandbox' : 'production' },
        };
      } else {
        const text = await response.text();
        return {
          success: false,
          message: `Razorpay API Authentication Failed (${response.status})`,
          details: { error: text },
        };
      }
    } catch (err: any) {
      return {
        success: false,
        message: `Network connection failed: ${err.message}`,
      };
    }
  }
}

// Global singleton instance for shared usage
export const razorpayService = new RazorpayService();
