import { z } from 'zod';

// ─── Common reusable schemas ──────────────────────────────────────

export const IdSchema = z.string().uuid();

export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const TimestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const MoneySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().length(3).default('INR'),
});

export const SupportedLanguageSchema = z.enum([
  'en', 'hi', 'ta', 'te', 'gu', 'kn', 'mr', 'bn', 'ml', 'pa',
]);

export type SupportedLanguage = z.infer<typeof SupportedLanguageSchema>;

export const PhoneNumberSchema = z.string().regex(
  /^\d{10,15}$/,
  'Phone number must be 10-15 digits'
);

// ─── Result type for operations ───────────────────────────────────

export const OperationResultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    data: z.unknown(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.string().optional(),
  }),
]);

export type OperationResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };
