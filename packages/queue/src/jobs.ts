import { z } from 'zod';
import { NormalizedMessageSchema } from '@wcos/types';

// ─── Inbound Message Job Schema ──────────────────────────────────────

export const InboundMessageJobSchema = z.object({
  tenantId: z.string().uuid(),
  rawEventId: z.string().uuid(),
  message: NormalizedMessageSchema,
  receivedAt: z.string().datetime(),
});

export type InboundMessageJobData = z.infer<typeof InboundMessageJobSchema>;

// ─── Outbound Message Job Schema ─────────────────────────────────────

export const OutboundMessageJobSchema = z.object({
  tenantId: z.string().uuid(),
  toPhone: z.string().min(5),
  messageType: z.enum(['text', 'image', 'buttons', 'list', 'payment_link']),
  text: z.string(),
  mediaUrl: z.string().url().optional(),
  buttons: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(20),
      })
    )
    .max(3)
    .optional(),
  paymentUrl: z.string().url().optional(),
  correlationId: z.string().optional(),
});

export type OutboundMessageJobData = z.infer<typeof OutboundMessageJobSchema>;

// ─── Follow-up / Reminder Job Schema ─────────────────────────────────

export const FollowUpJobSchema = z.object({
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  cartId: z.string().uuid().optional(),
  followUpType: z.enum([
    'cart_abandonment_1h',
    'cart_abandonment_24h',
    'order_feedback_3d',
    'payment_reminder_15m',
  ]),
});

export type FollowUpJobData = z.infer<typeof FollowUpJobSchema>;
