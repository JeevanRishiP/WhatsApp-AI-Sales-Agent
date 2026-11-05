import { z } from 'zod';

/**
 * Customer schemas — Omnichannel customer and storefront data shapes
 */

export const CustomerAddressSchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid(),
  label: z.string().max(50).nullable().optional(),
  recipientName: z.string().min(1).max(100),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number'),
  line1: z.string().min(3).max(255),
  line2: z.string().max(255).nullable().optional(),
  landmark: z.string().max(100).nullable().optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().min(3).max(10),
  isDefault: z.boolean().default(false),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type CustomerAddress = z.infer<typeof CustomerAddressSchema>;

export const CreateCustomerAddressSchema = CustomerAddressSchema.omit({
  id: true,
  customerId: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateCustomerAddress = z.infer<typeof CreateCustomerAddressSchema>;

export const CustomerProfileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  phone: z.string(),
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  defaultAddressId: z.string().uuid().nullable().optional(),
  addresses: z.array(CustomerAddressSchema).default([]),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type CustomerProfile = z.infer<typeof CustomerProfileSchema>;

// ─── Customer Authentication Schemas ──────────────────────────

export const SendOtpRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Enter a valid international phone number with country code'),
});

export type SendOtpRequest = z.infer<typeof SendOtpRequestSchema>;

export const VerifyOtpRequestSchema = z.object({
  tenantSlug: z.string().min(1),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

export type VerifyOtpRequest = z.infer<typeof VerifyOtpRequestSchema>;

export const CustomerAuthResponseSchema = z.object({
  customer: CustomerProfileSchema,
  token: z.string(),
  expiresIn: z.number(),
});

export type CustomerAuthResponse = z.infer<typeof CustomerAuthResponseSchema>;

// ─── Self-Service Order Modification ──────────────────────────

export const UpdateDeliveryDetailsSchema = z.object({
  recipientName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  line1: z.string().min(3).max(255).optional(),
  line2: z.string().max(255).optional(),
  landmark: z.string().max(100).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  pincode: z.string().min(3).max(10).optional(),
  instructions: z.string().max(300).optional(),
  preferredDeliverySlot: z.string().max(50).optional(),
});

export type UpdateDeliveryDetails = z.infer<typeof UpdateDeliveryDetailsSchema>;

export const CancelOrderCustomerSchema = z.object({
  reason: z.string().min(3).max(500),
});

export type CancelOrderCustomer = z.infer<typeof CancelOrderCustomerSchema>;

// ─── Public Storefront Data Shapes ────────────────────────────

export const StorefrontThemeSchema = z.object({
  primaryColor: z.string().default('#0C0C0C'),
  accentColor: z.string().default('#C5A880'),
  fontStyle: z.enum(['serif', 'sans']).default('serif'),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
});

export type StorefrontTheme = z.infer<typeof StorefrontThemeSchema>;

export const StorefrontInfoSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  businessCategory: z.string().nullable().optional(),
  whatsappPhoneNumber: z.string().nullable().optional(),
  storefrontTheme: StorefrontThemeSchema,
  storePolicies: z.record(z.any()).default({}),
});

export type StorefrontInfo = z.infer<typeof StorefrontInfoSchema>;

