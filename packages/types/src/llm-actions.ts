import { z } from 'zod';

/**
 * LLM Action Schema — The ONLY actions the LLM is allowed to request.
 *
 * The LLM NEVER writes to the database directly. It returns a structured
 * action payload that the Tool Execution Engine validates, authorizes,
 * and executes in a safe, transactional context.
 *
 * This is the most critical safety boundary in the system.
 */

export const HandoffReasonSchema = z.enum([
  'CUSTOMER_REQUEST',
  'AGENT_CONFUSED',
  'COMPLAINT',
  'PAYMENT_ISSUE',
  'CUSTOM_ORDER',
  'BULK_ORDER',
]);

export type HandoffReason = z.infer<typeof HandoffReasonSchema>;

// ─── Individual action schemas ────────────────────────────────────

const NoneAction = z.object({
  action: z.literal('NONE'),
  reply: z.string().max(1000).default(''),
});

const AddToCartAction = z.object({
  action: z.literal('ADD_TO_CART'),
  reply: z.string().max(1000).default(''),
  productCode: z.string().min(1).max(50),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const RemoveFromCartAction = z.object({
  action: z.literal('REMOVE_FROM_CART'),
  reply: z.string().max(1000).default(''),
  productCode: z.string().min(1).max(50),
});

const UpdateCartQuantityAction = z.object({
  action: z.literal('UPDATE_CART_QUANTITY'),
  reply: z.string().max(1000).default(''),
  productCode: z.string().min(1).max(50),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const ViewCartAction = z.object({
  action: z.literal('VIEW_CART'),
  reply: z.string().max(1000).default(''),
});

const ClearCartAction = z.object({
  action: z.literal('CLEAR_CART'),
  reply: z.string().max(1000).default(''),
});

const RequestDeliveryAddressAction = z.object({
  action: z.literal('REQUEST_DELIVERY_ADDRESS'),
  reply: z.string().max(1000).default(''),
});

const ConfirmDeliveryAddressAction = z.object({
  action: z.literal('CONFIRM_DELIVERY_ADDRESS'),
  reply: z.string().max(1000).default(''),
  confirmed: z.boolean().default(true),
  deliveryAddress: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    pincode: z.string().optional(),
  }).optional(),
});

const InitiateCheckoutAction = z.object({
  action: z.literal('INITIATE_CHECKOUT'),
  reply: z.string().max(1000).default(''),
  deliveryAddress: z.object({
    name: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    pincode: z.string().optional(),
  }).optional(),
});

const RequestHumanHandoffAction = z.object({
  action: z.literal('REQUEST_HUMAN_HANDOFF'),
  reply: z.string().max(1000).default(''),
  reason: HandoffReasonSchema.default('CUSTOMER_REQUEST'),
});

const ShowProductAction = z.object({
  action: z.literal('SHOW_PRODUCT'),
  reply: z.string().max(1000).default(''),
  productCode: z.string().min(1).max(50),
});

const SearchProductsAction = z.object({
  action: z.literal('SEARCH_PRODUCTS'),
  reply: z.string().max(1000).default(''),
  query: z.string().max(200).default(''),
  filters: z.object({
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    category: z.string().optional(),
    attributes: z.record(z.string()).optional(),
  }).optional(),
});

const OrderStatusAction = z.object({
  action: z.literal('ORDER_STATUS'),
  reply: z.string().max(1000).default(''),
  orderId: z.string().optional(),
});

const CancelOrderAction = z.object({
  action: z.literal('CANCEL_ORDER'),
  reply: z.string().max(1000).default(''),
  orderId: z.string(),
  reason: z.string().max(500).optional(),
});

// ─── Union of all actions ─────────────────────────────────────────

export const LLMActionSchema = z.discriminatedUnion('action', [
  NoneAction,
  AddToCartAction,
  RemoveFromCartAction,
  UpdateCartQuantityAction,
  ViewCartAction,
  ClearCartAction,
  RequestDeliveryAddressAction,
  ConfirmDeliveryAddressAction,
  InitiateCheckoutAction,
  RequestHumanHandoffAction,
  ShowProductAction,
  SearchProductsAction,
  OrderStatusAction,
  CancelOrderAction,
]);

export type LLMAction = z.infer<typeof LLMActionSchema>;
export type LLMActionType = LLMAction['action'];

// ─── Action types for routing ─────────────────────────────────────

export const CART_ACTIONS = [
  'ADD_TO_CART',
  'REMOVE_FROM_CART',
  'UPDATE_CART_QUANTITY',
  'VIEW_CART',
  'CLEAR_CART',
] as const;

export const ORDER_ACTIONS = [
  'REQUEST_DELIVERY_ADDRESS',
  'CONFIRM_DELIVERY_ADDRESS',
  'INITIATE_CHECKOUT',
  'ORDER_STATUS',
  'CANCEL_ORDER',
] as const;

export const CATALOG_ACTIONS = [
  'SHOW_PRODUCT',
  'SEARCH_PRODUCTS',
] as const;

export function isCartAction(action: string): boolean {
  return (CART_ACTIONS as readonly string[]).includes(action);
}

export function isOrderAction(action: string): boolean {
  return (ORDER_ACTIONS as readonly string[]).includes(action);
}

export function isCatalogAction(action: string): boolean {
  return (CATALOG_ACTIONS as readonly string[]).includes(action);
}

// ─── LLM Response Envelope ───────────────────────────────────────

export const LLMResponseEnvelopeSchema = z.object({
  message: z.string().describe('The natural WhatsApp message string to send to the customer'),
  stage: z.string().default('BROWSING').describe('The updated conversation stage'),
  intent: z.string().default('general_query').describe('Primary customer intent identified'),
  action: LLMActionSchema.default({ action: 'NONE', reply: '' }).describe('Operational action for the tool engine'),
  customerMemoryUpdate: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional().describe('Attributes learned about the customer'),
});

export type LLMResponseEnvelope = z.infer<typeof LLMResponseEnvelopeSchema>;

