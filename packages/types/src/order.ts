import { z } from 'zod';

/**
 * Order schemas — Order lifecycle data shapes
 *
 * Key design decisions:
 * - Price snapshot at order time (never trust current catalog)
 * - Inventory reservation with TTL
 * - Payment verified via webhook only (never customer claim)
 * - Full audit trail on every status change
 */

export const OrderStatusSchema = z.enum([
  'PENDING_PAYMENT',   // order created, awaiting payment
  'PAYMENT_CONFIRMED', // Razorpay webhook confirmed payment
  'PROCESSING',        // shop owner acknowledged and is packing
  'SHIPPED',           // shipped with tracking
  'DELIVERED',         // delivered
  'CANCELLED',         // cancelled (by customer or shop)
  'REFUND_INITIATED',  // refund in progress
  'REFUNDED',          // refund completed
]);

export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentMethodSchema = z.enum([
  'RAZORPAY_ONLINE',   // online payment via Razorpay
  'PHONEPE_ONLINE',    // online payment via PhonePe
  'COD',               // cash on delivery
  'UPI_MANUAL',        // manual UPI transfer (verified by shop owner)
  'BANK_TRANSFER',     // manual bank transfer
]);

export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

// ─── Order line item — immutable after creation ───────────────────

export const OrderItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productCode: z.string(),
  productName: z.string(),                    // snapshot
  productImageUrl: z.string().optional(),     // snapshot
  quantity: z.number().int().min(1),
  priceAtOrder: z.number().nonnegative(),     // snapshot
  discountAtOrder: z.number().nonnegative().default(0),  // snapshot
  taxAtOrder: z.number().nonnegative().default(0),       // snapshot
  totalAtOrder: z.number().nonnegative(),     // computed and frozen
});

export type OrderItem = z.infer<typeof OrderItemSchema>;

// ─── Delivery address ─────────────────────────────────────────────

export const DeliveryAddressSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone: z.string().regex(/^\d{10,15}$/),
  addressLine1: z.string().min(5).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  country: z.string().default('India'),
  landmark: z.string().max(200).optional(),
});

export type DeliveryAddress = z.infer<typeof DeliveryAddressSchema>;

// ─── Full order schema ────────────────────────────────────────────

export const OrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerPhone: z.string(),
  customerName: z.string().optional(),
  orderNumber: z.string(),                    // human-readable, e.g., "ORD-20241017-001"
  items: z.array(OrderItemSchema),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  shippingCharge: z.number().nonnegative().default(0),
  total: z.number().nonnegative(),
  currency: z.string().length(3).default('INR'),
  status: OrderStatusSchema,
  paymentMethod: PaymentMethodSchema.optional(),
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  reservationId: z.string().uuid().optional(),  // linked inventory reservation
  deliveryAddress: DeliveryAddressSchema.optional(),
  trackingNumber: z.string().optional(),
  trackingUrl: z.string().url().optional(),
  notes: z.string().max(500).optional(),       // customer notes
  internalNotes: z.string().max(1000).optional(), // shop owner notes
  cancelReason: z.string().max(500).optional(),
  statusHistory: z.array(z.object({
    status: OrderStatusSchema,
    timestamp: z.date(),
    updatedBy: z.string(),               // "system", "owner", "customer"
    note: z.string().optional(),
  })).default([]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Order = z.infer<typeof OrderSchema>;
