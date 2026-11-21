import { type FastifyPluginAsync } from 'fastify';
import { CartService } from '@wcos/queue';
import { prisma } from '@wcos/db';
import { z } from 'zod';
import { optionalCustomerAuth, requireCustomerAuth } from '../../middleware/customer-auth.js';
import { CustomerAuthService } from '../../services/customer-auth-service.js';

const AddCartItemSchema = z.object({
  tenantSlug: z.string().min(1).max(80).optional(),
  productCode: z.string().min(1).max(60),
  quantity: z.number().int().min(1).max(20).default(1),
  channel: z.enum(['wa', 'web']).default('web'),
});

const UpdateCartQtySchema = z.object({
  tenantSlug: z.string().min(1).max(80).optional(),
  productCode: z.string().min(1).max(60),
  quantity: z.number().int().min(0).max(20),
  channel: z.enum(['wa', 'web']).default('web'),
});

class CartContextError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export const customerCartRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Resolves tenant & caller identity cleanly:
   * - Authenticated callers CANNOT cross tenant boundaries via header/body
   * - Unauthenticated guests require a dedicated >=16 char x-guest-session-id and cannot access 'wa' carts
   */
  async function resolveCartContext(request: any, requestedChannel: 'wa' | 'web' = 'web') {
    const tenantSlug =
      (request.headers['x-tenant-slug'] as string) ||
      request.query?.tenantSlug ||
      request.body?.tenantSlug;
    if (!tenantSlug) {
      throw new CartContextError(400, 'x-tenant-slug header or tenantSlug parameter is required');
    }

    const tenant = await CustomerAuthService.resolveTenant(tenantSlug);

    if (request.customerSession?.phone) {
      if (tenant.id !== request.customerSession.tenantId) {
        throw new CartContextError(403, 'Cross-tenant cart access is forbidden');
      }
      return {
        tenantId: tenant.id,
        identifier: request.customerSession.phone,
        isAuthenticated: true,
      };
    }

    if (requestedChannel === 'wa') {
      throw new CartContextError(401, 'Sign in required to access WhatsApp concierge cart');
    }

    const guestId = ((request.headers['x-guest-session-id'] as string) || '').trim();
    if (!guestId || guestId.length < 16 || guestId.length > 128) {
      throw new CartContextError(
        400,
        'Valid x-guest-session-id header (>=16 chars) is required for guest cart operations'
      );
    }

    return {
      tenantId: tenant.id,
      identifier: `guest:${guestId}`,
      isAuthenticated: false,
    };
  }

  /**
   * Returns Dual Cart state for authenticated sessions, or Web cart only for isolated guests.
   */
  server.get(
    '/api/v1/customer/cart',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      try {
        const { tenantId, identifier, isAuthenticated } = await resolveCartContext(request, 'web');

        if (!isAuthenticated) {
          const webCart = await CartService.getCart(tenantId, identifier, 'web');
          return reply.send({
            waCart: {
              ...webCart,
              channel: 'wa',
              items: [],
              subtotal: 0,
              itemCount: 0,
            },
            webCart,
            totalItemCount: webCart.itemCount,
            combinedSubtotal: webCart.subtotal,
            isAuthenticated: false,
          });
        }

        const dualCart = await CartService.getDualCart(tenantId, identifier);
        return reply.send({
          ...dualCart,
          isAuthenticated: true,
        });
      } catch (err: any) {
        const status = err instanceof CartContextError ? err.statusCode : 400;
        return reply.status(status).send({ error: err.message });
      }
    }
  );

  /**
   * Adds an item to the cart with strict integer & available stock validation.
   */
  server.post(
    '/api/v1/customer/cart/item',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      const parsed = AddCartItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message || 'Invalid cart item payload',
        });
      }

      const { productCode, quantity, channel } = parsed.data;

      try {
        const { tenantId, identifier } = await resolveCartContext(request, channel);

        const product = await prisma.product.findUnique({
          where: {
            tenantId_code: {
              tenantId,
              code: productCode,
            },
          },
        });

        if (!product || product.status !== 'ACTIVE') {
          return reply.status(404).send({ error: 'Product not found or inactive' });
        }

        const existingCart = await CartService.getCart(tenantId, identifier, channel);
        const existingItem = existingCart.items.find(
          (i) => i.productCode.toLowerCase() === product.code.toLowerCase()
        );
        const desiredTotalQty = (existingItem?.quantity || 0) + quantity;
        const availableStock = Math.max(0, product.stock - product.reserved);

        if (availableStock < desiredTotalQty) {
          return reply.status(400).send({
            error: `Only ${availableStock} unit(s) available in stock`,
          });
        }

        const cart = await CartService.addItem(
          tenantId,
          identifier,
          {
            id: product.id,
            code: product.code,
            name: product.name,
            price: Number(product.salePrice ?? product.price),
            imageUrl: product.thumbnailUrl || product.imageUrls[0],
          },
          quantity,
          channel
        );

        return reply.send({ cart, message: 'Item added to your luxury bag' });
      } catch (err: any) {
        const status = err instanceof CartContextError ? err.statusCode : 400;
        return reply.status(status).send({ error: err.message });
      }
    }
  );

  /**
   * Updates item quantity in the cart with stock ceiling validation.
   */
  server.patch(
    '/api/v1/customer/cart/item',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      const parsed = UpdateCartQtySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message || 'Invalid quantity payload',
        });
      }

      const { productCode, quantity, channel } = parsed.data;

      try {
        const { tenantId, identifier } = await resolveCartContext(request, channel);

        if (quantity > 0) {
          const product = await prisma.product.findUnique({
            where: { tenantId_code: { tenantId, code: productCode } },
            select: { stock: true, reserved: true, status: true },
          });
          if (!product || product.status !== 'ACTIVE') {
            return reply.status(404).send({ error: 'Product not found or inactive' });
          }
          const availableStock = Math.max(0, product.stock - product.reserved);
          if (quantity > availableStock) {
            return reply.status(400).send({
              error: `Only ${availableStock} unit(s) available in stock`,
            });
          }
        }

        const cart = await CartService.updateQuantity(
          tenantId,
          identifier,
          productCode,
          quantity,
          channel
        );
        return reply.send({ cart });
      } catch (err: any) {
        const status = err instanceof CartContextError ? err.statusCode : 400;
        return reply.status(status).send({ error: err.message });
      }
    }
  );

  /**
   * Removes an item from the cart.
   */
  server.delete<{
    Params: { code: string };
    Querystring: { channel?: 'wa' | 'web'; tenantSlug?: string };
  }>(
    '/api/v1/customer/cart/item/:code',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      const { code } = request.params;
      const channel = request.query.channel === 'wa' ? 'wa' : 'web';

      try {
        const { tenantId, identifier } = await resolveCartContext(request, channel);
        const cart = await CartService.removeItem(tenantId, identifier, code, channel);
        return reply.send({ cart, message: 'Item removed from bag' });
      } catch (err: any) {
        const status = err instanceof CartContextError ? err.statusCode : 400;
        return reply.status(status).send({ error: err.message });
      }
    }
  );

  /**
   * Merges WhatsApp Concierge Cart into Web Boutique Cart (authenticated users only).
   */
  server.post<{
    Body: {
      tenantSlug?: string;
      sourceChannel?: 'wa' | 'web';
      targetChannel?: 'wa' | 'web';
    };
  }>(
    '/api/v1/customer/cart/merge',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const { sourceChannel = 'wa', targetChannel = 'web' } = request.body || {};

      try {
        const { tenantId, identifier } = await resolveCartContext(request, sourceChannel);
        const mergedCart = await CartService.mergeCarts(
          tenantId,
          identifier,
          sourceChannel,
          targetChannel
        );
        return reply.send({
          cart: mergedCart,
          message: 'Carts successfully unified for seamless checkout',
        });
      } catch (err: any) {
        const status = err instanceof CartContextError ? err.statusCode : 400;
        return reply.status(status).send({ error: err.message });
      }
    }
  );

  /**
   * Clears a specific cart channel.
   */
  server.delete<{
    Querystring: { channel?: 'wa' | 'web'; tenantSlug?: string };
  }>(
    '/api/v1/customer/cart',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      const channel = request.query.channel === 'wa' ? 'wa' : 'web';

      try {
        const { tenantId, identifier } = await resolveCartContext(request, channel);
        await CartService.clearCart(tenantId, identifier, channel);
        return reply.send({ success: true, message: 'Cart cleared' });
      } catch (err: any) {
        const status = err instanceof CartContextError ? err.statusCode : 400;
        return reply.status(status).send({ error: err.message });
      }
    }
  );
};
