import { type FastifyPluginAsync } from 'fastify';
import { CartService } from '@wcos/queue';
import { prisma } from '@wcos/db';
import { optionalCustomerAuth } from '../../middleware/customer-auth.js';
import { CustomerAuthService } from '../../services/customer-auth-service.js';

export const customerCartRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Helper to resolve tenant and customer phone / guest session ID.
   */
  async function resolveCartContext(request: any) {
    const tenantSlug = (request.headers['x-tenant-slug'] as string) || request.query?.tenantSlug || request.body?.tenantSlug;
    if (!tenantSlug) {
      throw new Error('x-tenant-slug header or tenantSlug parameter is required');
    }

    const tenant = await CustomerAuthService.resolveTenant(tenantSlug);

    // If authenticated customer session exists, use their real WhatsApp phone
    if (request.customerSession?.phone) {
      return {
        tenantId: tenant.id,
        identifier: request.customerSession.phone,
        isAuthenticated: true,
      };
    }

    // Otherwise use guest session id (cookie or header)
    const guestId = (request.headers['x-guest-session-id'] as string) || 'guest_default';
    return {
      tenantId: tenant.id,
      identifier: `guest_${guestId}`,
      isAuthenticated: false,
    };
  }

  /**
   * Returns Dual Cart state: both WhatsApp Concierge Cart and Web Boutique Cart.
   */
  server.get(
    '/api/v1/customer/cart',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      try {
        const { tenantId, identifier, isAuthenticated } = await resolveCartContext(request);

        if (!isAuthenticated) {
          // Unauthenticated guest only has a web cart
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
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  /**
   * Adds an item to the cart (defaults to 'web' channel).
   */
  server.post<{
    Body: {
      tenantSlug?: string;
      productCode: string;
      quantity?: number;
      channel?: 'wa' | 'web';
    };
  }>(
    '/api/v1/customer/cart/item',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      const { productCode, quantity = 1, channel = 'web' } = request.body;

      try {
        const { tenantId, identifier } = await resolveCartContext(request);

        // Fetch product info & stock from DB
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

        const availableStock = product.stock - product.reserved;
        if (availableStock <= 0) {
          return reply.status(400).send({ error: 'This item is currently out of stock' });
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
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  /**
   * Updates item quantity in the cart.
   */
  server.patch<{
    Body: {
      tenantSlug?: string;
      productCode: string;
      quantity: number;
      channel?: 'wa' | 'web';
    };
  }>(
    '/api/v1/customer/cart/item',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      const { productCode, quantity, channel = 'web' } = request.body;

      try {
        const { tenantId, identifier } = await resolveCartContext(request);
        const cart = await CartService.updateQuantity(tenantId, identifier, productCode, quantity, channel);
        return reply.send({ cart });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
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
      const { channel = 'web' } = request.query;

      try {
        const { tenantId, identifier } = await resolveCartContext(request);
        const cart = await CartService.removeItem(tenantId, identifier, code, channel);
        return reply.send({ cart, message: 'Item removed from bag' });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  /**
   * Merges WhatsApp Concierge Cart into Web Boutique Cart for single checkout.
   */
  server.post<{
    Body: {
      tenantSlug?: string;
      sourceChannel?: 'wa' | 'web';
      targetChannel?: 'wa' | 'web';
    };
  }>(
    '/api/v1/customer/cart/merge',
    { preHandler: [optionalCustomerAuth] },
    async (request, reply) => {
      const { sourceChannel = 'wa', targetChannel = 'web' } = request.body || {};

      try {
        const { tenantId, identifier } = await resolveCartContext(request);
        const mergedCart = await CartService.mergeCarts(tenantId, identifier, sourceChannel, targetChannel);
        return reply.send({
          cart: mergedCart,
          message: 'Carts successfully unified for seamless checkout',
        });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
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
      const { channel = 'web' } = request.query;

      try {
        const { tenantId, identifier } = await resolveCartContext(request);
        await CartService.clearCart(tenantId, identifier, channel);
        return reply.send({ success: true, message: 'Cart cleared' });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );
};

