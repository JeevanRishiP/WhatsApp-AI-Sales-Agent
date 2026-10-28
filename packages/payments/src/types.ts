
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  baseUrl?: string;
  isSandbox?: boolean;
}

export interface CreateRazorpayOrderOptions {
  amount: number; // in INR (will be converted to paise automatically)
  currency?: string;
  receipt: string; // e.g. orderNumber
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string; // "order_xxxxx"
  entity: string;
  amount: number; // in paise
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  attempts: number;
  notes: Record<string, string>;
  created_at: number;
}

export interface CreatePaymentLinkOptions {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  amount: number; // in INR
  currency?: string;
  customerName?: string;
  customerPhone: string;
  customerEmail?: string;
  description?: string;
  callbackUrl?: string;
  expireByMinutes?: number; // default 15 mins for inventory reservation
}

export interface RazorpayPaymentLinkResult {
  id: string; // "plink_xxxx"
  short_url: string; // "https://rzp.io/i/xxxx" or sandbox simulator url
  order_id?: string;
  amount: number; // in paise
  amount_paid: number;
  currency: string;
  status: 'created' | 'partially_paid' | 'paid' | 'cancelled' | 'expired';
  isSandboxMock?: boolean;
}

export interface VerifyPaymentSignatureOptions {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface RazorpayWebhookPaymentEntity {
  id: string;
  entity: 'payment';
  amount: number; // in paise
  currency: string;
  status: 'captured' | 'failed' | 'authorized' | 'refunded';
  order_id?: string;
  invoice_id?: string;
  method?: string; // 'upi', 'card', 'netbanking', etc.
  amount_refunded?: number;
  refund_status?: string | null;
  captured?: boolean;
  description?: string;
  card_id?: string | null;
  bank?: string | null;
  wallet?: string | null;
  vpa?: string | null; // e.g. "customer@okaxis"
  email?: string;
  contact?: string;
  notes?: Record<string, string>;
  fee?: number;
  tax?: number;
  error_code?: string | null;
  error_description?: string | null;
  created_at: number;
}

export interface RazorpayWebhookOrderEntity {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'paid' | 'attempted' | 'created';
  attempts: number;
  notes?: Record<string, string>;
  created_at: number;
}

export interface RazorpayWebhookPayload {
  entity: 'event';
  account_id: string;
  event:
    | 'payment.authorized'
    | 'payment.captured'
    | 'payment.failed'
    | 'order.paid'
    | 'payment_link.paid'
    | 'payment_link.cancelled'
    | 'payment_link.expired';
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayWebhookPaymentEntity;
    };
    order?: {
      entity: RazorpayWebhookOrderEntity;
    };
    payment_link?: {
      entity: {
        id: string;
        order_id?: string;
        short_url?: string;
        status: string;
        amount: number;
        amount_paid: number;
        notes?: Record<string, string>;
      };
    };
  };
  created_at: number;
}
