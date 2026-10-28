import { z } from 'zod';

/**
 * Conversation schemas — Session and conversation tracking
 *
 * Each customer↔tenant pair has a conversation.
 * Sessions track the current interaction state.
 * Customer memory builds personalization over time.
 */

export const ConversationStageSchema = z.enum([
  'GREETING',          // initial contact
  'BROWSING',          // looking at products
  'CART_ACTIVE',       // items in cart
  'CHECKOUT_ADDRESS',  // collecting delivery address
  'CHECKOUT_CONFIRM',  // confirming order details
  'AWAITING_PAYMENT',  // payment link sent
  'POST_ORDER',        // order placed, follow-up
  'HUMAN_HANDOFF',     // transferred to human agent
  'IDLE',              // no recent activity
]);

export type ConversationStage = z.infer<typeof ConversationStageSchema>;

export const IntentSchema = z.enum([
  'GREETING',
  'CATALOG_QUERY',
  'PRODUCT_CODE_LOOKUP',
  'CART_ADD',
  'CART_REMOVE',
  'CART_VIEW',
  'CART_CLEAR',
  'CHECKOUT',
  'ORDER_STATUS',
  'ORDER_CANCEL',
  'COMPLAINT',
  'REFUND_REQUEST',
  'HUMAN_HANDOFF',
  'IMAGE_QUERY',
  'GENERAL_QUESTION',
  'OFF_TOPIC',
  'UNKNOWN',
]);

export type Intent = z.infer<typeof IntentSchema>;

// ─── Conversation session (stored in Redis + Postgres) ────────────

export const SessionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerPhone: z.string(),
  stage: ConversationStageSchema,
  language: z.string().default('en'),
  messageCount: z.number().int().default(0),
  lastMessageAt: z.date(),
  lastIntent: IntentSchema.optional(),
  cartId: z.string().uuid().optional(),
  pendingOrderId: z.string().uuid().optional(),
  handoffReason: z.string().optional(),
  handoffAssignedTo: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  startedAt: z.date(),
  expiresAt: z.date(),
});

export type Session = z.infer<typeof SessionSchema>;

// ─── Customer memory — builds over time ───────────────────────────

export const CustomerMemorySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerPhone: z.string(),
  customerName: z.string().optional(),

  // Learned preferences
  preferredCategories: z.array(z.string()).default([]),
  preferredAttributes: z.record(z.array(z.string())).default({}),
  budgetRange: z.object({
    typical: z.number().optional(),
    max: z.number().optional(),
  }).default({}),

  // Purchase history summary
  totalOrders: z.number().int().default(0),
  totalSpent: z.number().nonnegative().default(0),
  lastOrderDate: z.date().optional(),
  averageOrderValue: z.number().nonnegative().default(0),
  isRepeatCustomer: z.boolean().default(false),

  // Interaction patterns
  preferredLanguage: z.string().default('en'),
  totalMessages: z.number().int().default(0),
  firstContactAt: z.date(),
  lastContactAt: z.date(),

  updatedAt: z.date(),
});

export type CustomerMemory = z.infer<typeof CustomerMemorySchema>;

// ─── Conversation context passed to LLM ───────────────────────────

export const ConversationContextSchema = z.object({
  tenantId: z.string().uuid(),
  customerPhone: z.string(),
  session: SessionSchema,
  customerMemory: CustomerMemorySchema.optional(),
  recentMessages: z.array(z.object({
    role: z.enum(['customer', 'assistant']),
    content: z.string(),
    timestamp: z.date(),
  })).default([]),
  cartSummary: z.object({
    items: z.array(z.object({
      productCode: z.string(),
      productName: z.string(),
      quantity: z.number(),
      price: z.number(),
    })),
    subtotal: z.number(),
    itemCount: z.number(),
  }).optional(),
  tenantPersona: z.record(z.unknown()).optional(),
});

export type ConversationContext = z.infer<typeof ConversationContextSchema>;
