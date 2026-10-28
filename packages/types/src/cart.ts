import { z } from 'zod';

/**
 * Cart schemas — Shopping cart data shapes
 *
 * Cart state is stored in Redis for speed with Postgres as
 * source of truth. Redis TTL handles automatic cart expiry
 * for abandoned carts.
 */

export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  productCode: z.string(),
  productName: z.string(),
  quantity: z.number().int().min(1).max(50),
  priceAtAdd: z.number().nonnegative(),      // price when added (snapshot)
  imageUrl: z.string().url().optional(),
  addedAt: z.date(),
});

export type CartItem = z.infer<typeof CartItemSchema>;

export const CartSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerPhone: z.string(),
  items: z.array(CartItemSchema),
  subtotal: z.number().nonnegative(),
  currency: z.string().length(3).default('INR'),
  itemCount: z.number().int().nonnegative(),
  lastActivityAt: z.date(),
  expiresAt: z.date(),                       // TTL for abandoned cart cleanup
  createdAt: z.date(),
});

export type Cart = z.infer<typeof CartSchema>;

// ─── Cart operation types ─────────────────────────────────────────

export const AddToCartRequestSchema = z.object({
  tenantId: z.string().uuid(),
  customerPhone: z.string(),
  productCode: z.string(),
  quantity: z.number().int().min(1).max(50).default(1),
});

export type AddToCartRequest = z.infer<typeof AddToCartRequestSchema>;

export const CartUpdateResultSchema = z.object({
  cart: CartSchema,
  message: z.string(),
  stockWarning: z.string().optional(),
});

export type CartUpdateResult = z.infer<typeof CartUpdateResultSchema>;
