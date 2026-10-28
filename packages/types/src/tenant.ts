import { z } from 'zod';

/**
 * Tenant schemas — Multi-tenancy data shapes
 *
 * Every shop owner is a "tenant". All data is isolated per tenant
 * using PostgreSQL Row Level Security (RLS).
 */

export const TenantStatusSchema = z.enum([
  'ONBOARDING',   // initial setup, not yet active
  'ACTIVE',       // fully operational
  'SUSPENDED',    // payment issue or policy violation
  'CHURNED',      // voluntarily left
]);

export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantPlanSchema = z.enum([
  'FREE',          // limited messages/month, basic features
  'STARTER',       // small shops, basic analytics
  'GROWTH',        // growing shops, full features
  'ENTERPRISE',    // custom limits, priority support
]);

export type TenantPlan = z.infer<typeof TenantPlanSchema>;

export const TenantPersonaSchema = z.object({
  botName: z.string().max(50).default('Shopping Assistant'),
  tone: z.enum(['friendly', 'professional', 'casual', 'luxurious']).default('friendly'),
  language: z.string().default('en'),
  greetingMessage: z.string().max(500).optional(),
  outOfStockMessage: z.string().max(500).optional(),
  orderConfirmationTemplate: z.string().max(1000).optional(),
  customRules: z.array(z.string().max(200)).max(20).default([]),
  businessHours: z.object({
    timezone: z.string().default('Asia/Kolkata'),
    start: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
    end: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'),
    offDays: z.array(z.number().min(0).max(6)).default([]),  // 0=Sunday
  }).optional(),
});

export type TenantPersona = z.infer<typeof TenantPersonaSchema>;

export const CreateTenantSchema = z.object({
  name: z.string().min(2).max(100),
  ownerName: z.string().min(2).max(100),
  ownerPhone: z.string().regex(/^\d{10,15}$/),
  ownerEmail: z.string().email(),
  businessCategory: z.string().max(50).optional(),
  whatsappPhoneNumber: z.string().max(20).optional(),
  whatsappInstanceName: z.string().min(1).max(50),  // Evolution API instance name
  plan: TenantPlanSchema.default('FREE'),
  persona: TenantPersonaSchema.optional(),
});

export type CreateTenant = z.infer<typeof CreateTenantSchema>;

export const UpdateTenantSchema = CreateTenantSchema.partial();
export type UpdateTenant = z.infer<typeof UpdateTenantSchema>;

export const TenantSchema = CreateTenantSchema.extend({
  id: z.string().uuid(),
  status: TenantStatusSchema,
  apiKey: z.string(),                    // tenant API key for dashboard
  evolutionInstanceId: z.string().optional(), // Evolution API instance ID
  razorpayAccountId: z.string().optional(),   // connected Razorpay account
  monthlyMessageCount: z.number().default(0),
  monthlyMessageLimit: z.number().default(1000),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Tenant = z.infer<typeof TenantSchema>;
