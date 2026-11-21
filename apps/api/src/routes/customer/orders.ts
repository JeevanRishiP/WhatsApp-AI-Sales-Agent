import crypto from 'node:crypto';
import { type FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '@wcos/db';
import { CartService } from '@wcos/queue';
import { paymentGatewayRouter, detectPlatformFromUserAgent } from '@wcos/payments';
import { getDelhiveryLiveTrackingStatus } from '@wcos/types';
import { requireCustomerAuth } from '../../middleware/customer-auth.js';
import { EvolutionService } from '../../services/evolution-service.js';
import { CustomerAuthService } from '../../services/customer-auth-service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WebCheckoutSchema = z.object({
  tenantSlug: z.string().min(1).max(80).optional(),
  channel: z.enum(['web', 'wa']).default('web'),
  paymentMethod: z.enum(['RAZORPAY_ONLINE', 'PHONEPE_ONLINE', 'COD']).default('RAZORPAY_ONLINE'),
  deliveryAddress: z.object({
    recipientName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(8).max(20),
    line1: z.string().trim().min(3).max(255),
    line2: z.string().trim().max(255).optional(),
    landmark: z.string().trim().max(100).optional(),
    city: z.string().trim().min(2).max(100),
    state: z.string().trim().min(2).max(100),
    pincode: z.string().trim().min(4).max(12),
    instructions: z.string().trim().max(500).optional(),
  }),
});

function getPhoneVariants(phone: string): string[] {
  const clean = phone.replace(/[^0-9]/g, '');
  return [
    phone,
    `+${clean}`,
    clean,
    clean.replace(/^91/, ''),
    `+91${clean.replace(/^91/, '')}`,
    `91${clean.replace(/^91/, '')}`,
  ];
}

function generateCollisionSafeOrderNumber(prefix: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${datePart}-${randPart}`;
}

export const customerOrdersRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Retrieves all orders for the authenticated customer.
   */
  server.get(
    '/api/v1/customer/orders',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const phoneVariants = getPhoneVariants(session.phone);

      const orders = await prisma.order.findMany({
        where: {
          tenantId: session.tenantId,
          OR: [
            { customerId: session.customerId },
            { customerPhone: { in: phoneVariants } },
          ],
        },
        include: {
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        orders: orders.map((o) => ({
          ...o,
          subtotal: Number(o.subtotal),
          discount: Number(o.discount),
          tax: Number(o.tax),
          shippingCharge: Number(o.shippingCharge),
          total: Number(o.total),
          isEditable:
            o.status === 'PAYMENT_CONFIRMED' ||
            o.status === 'PROCESSING' ||
            o.status === 'PENDING_PAYMENT',
          isCancellable:
            o.status === 'PAYMENT_CONFIRMED' ||
            o.status === 'PROCESSING' ||
            o.status === 'PENDING_PAYMENT',
        })),
      });
    }
  );

  /**
   * Retrieves details for a specific order by ID or orderNumber.
   */
  server.get<{
    Params: { id: string };
  }>(
    '/api/v1/customer/orders/:id',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const { id } = request.params;
      const phoneVariants = getPhoneVariants(session.phone);

      const order = await prisma.order.findFirst({
        where: {
          tenantId: session.tenantId,
          OR: [
            { customerId: session.customerId },
            { customerPhone: { in: phoneVariants } },
          ],
          AND: [
            {
              OR: [
                ...(UUID_REGEX.test(id) ? [{ id }] : []),
                { orderNumber: id },
              ],
            },
          ],
        },
        include: {
          items: true,
          tenant: {
            select: {
              name: true,
              whatsappPhoneNumber: true,
              whatsappInstanceName: true,
              storefrontTheme: true,
            },
          },
        },
      });

      if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      return reply.send({
        order: {
          ...order,
          subtotal: Number(order.subtotal),
          discount: Number(order.discount),
          tax: Number(order.tax),
          shippingCharge: Number(order.shippingCharge),
          total: Number(order.total),
          isEditable:
            order.status === 'PAYMENT_CONFIRMED' ||
            order.status === 'PROCESSING' ||
            order.status === 'PENDING_PAYMENT',
          isCancellable:
            order.status === 'PAYMENT_CONFIRMED' ||
            order.status === 'PROCESSING' ||
            order.status === 'PENDING_PAYMENT',
        },
      });
    }
  );

  /**
   * Self-service delivery address & instructions modification.
   */
  server.patch<{
    Params: { id: string };
    Body: {
      recipientName?: string;
      phone?: string;
      line1?: string;
      line2?: string;
      landmark?: string;
      city?: string;
      state?: string;
      pincode?: string;
      instructions?: string;
      preferredDeliverySlot?: string;
    };
  }>(
    '/api/v1/customer/orders/:id/delivery',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const { id } = request.params;
      const updateData = request.body;
      const phoneVariants = getPhoneVariants(session.phone);

      const order = await prisma.order.findFirst({
        where: {
          tenantId: session.tenantId,
          OR: [
            { customerId: session.customerId },
            { customerPhone: { in: phoneVariants } },
          ],
          AND: [
            {
              OR: [
                ...(UUID_REGEX.test(id) ? [{ id }] : []),
                { orderNumber: id },
              ],
            },
          ],
        },
        include: {
          tenant: true,
        },
      });

      if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        return reply.status(400).send({
          error: 'Order has already been dispatched. Delivery details cannot be modified self-service.',
        });
      }

      if (order.status === 'CANCELLED' || order.status === 'REFUNDED' || order.status === 'REFUND_INITIATED') {
        return reply.status(400).send({
          error: 'Order is cancelled/refunded and cannot be modified.',
        });
      }

      const currentAddress = (order.deliveryAddress as any) || {};
      const newAddress = {
        recipientName: updateData.recipientName || currentAddress.recipientName || order.customerName,
        phone: updateData.phone || currentAddress.phone || order.customerPhone,
        line1: updateData.line1 || currentAddress.line1 || '',
        line2: updateData.line2 ?? currentAddress.line2,
        landmark: updateData.landmark ?? currentAddress.landmark,
        city: updateData.city || currentAddress.city || '',
        state: updateData.state || currentAddress.state || '',
        pincode: updateData.pincode || currentAddress.pincode || '',
        instructions: updateData.instructions ?? currentAddress.instructions,
        preferredDeliverySlot: updateData.preferredDeliverySlot ?? currentAddress.preferredDeliverySlot,
        updatedAt: new Date().toISOString(),
      };

      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          deliveryAddress: newAddress,
          updatedAt: new Date(),
        },
        include: { items: true },
      });

      await prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorId: session.customerId,
          actorType: 'HUMAN',
          action: 'CUSTOMER_UPDATED_DELIVERY_DETAILS',
          resourceId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            previousAddress: currentAddress,
            newAddress,
          },
        },
      });

      try {
        const existingCustAddr = await prisma.customerAddress.findFirst({
          where: {
            customerId: session.customerId,
            line1: newAddress.line1,
            pincode: newAddress.pincode,
          },
        });

        if (!existingCustAddr) {
          const hasAnyDefault = await prisma.customerAddress.findFirst({
            where: { customerId: session.customerId, isDefault: true },
          });

          const createdCustAddr = await prisma.customerAddress.create({
            data: {
              customerId: session.customerId,
              label: 'Delivery Destination',
              recipientName: newAddress.recipientName,
              phone: newAddress.phone,
              line1: newAddress.line1,
              line2: newAddress.line2 || null,
              landmark: newAddress.landmark || null,
              city: newAddress.city,
              state: newAddress.state,
              pincode: newAddress.pincode,
              isDefault: !hasAnyDefault,
            },
          });

          if (!hasAnyDefault) {
            await prisma.customer.update({
              where: { id: session.customerId },
              data: { defaultAddressId: createdCustAddr.id },
            });
          }
        }
      } catch (custAddrErr: any) {
        console.warn('[Orders] Could not auto-upsert CustomerAddress:', custAddrErr.message);
      }

      const waMessage = `✨ *Delivery Address Updated*\n\n` +
        `Your delivery details for Order *#${order.orderNumber}* at *${order.tenant.name}* have been updated:\n\n` +
        `📍 *Destination:*\n` +
        `${newAddress.recipientName} (${newAddress.phone})\n` +
        `${newAddress.line1}${newAddress.line2 ? ', ' + newAddress.line2 : ''}\n` +
        `${newAddress.city}, ${newAddress.state} - ${newAddress.pincode}\n` +
        (newAddress.instructions ? `📝 *Note:* _"${newAddress.instructions}"_\n` : '') +
        (newAddress.preferredDeliverySlot ? `⏰ *Slot:* ${newAddress.preferredDeliverySlot}\n` : '') +
        `\nOur concierge has noted this change for fulfillment.`;

      await EvolutionService.sendTextMessage(order.tenant.whatsappInstanceName, session.phone, waMessage);

      return reply.send({
        order: {
          ...updatedOrder,
          subtotal: Number(updatedOrder.subtotal),
          discount: Number(updatedOrder.discount),
          tax: Number(updatedOrder.tax),
          shippingCharge: Number(updatedOrder.shippingCharge),
          total: Number(updatedOrder.total),
        },
        message: 'Delivery details successfully updated and confirmed on WhatsApp',
      });
    }
  );

  /**
   * Self-service order cancellation before fulfillment (atomically restores inventory).
   */
  server.post<{
    Params: { id: string };
    Body: { reason?: string };
  }>(
    '/api/v1/customer/orders/:id/cancel',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const { id } = request.params;
      const { reason = 'Cancelled by customer via web dashboard' } = request.body || {};
      const phoneVariants = getPhoneVariants(session.phone);

      const order = await prisma.order.findFirst({
        where: {
          tenantId: session.tenantId,
          OR: [
            { customerId: session.customerId },
            { customerPhone: { in: phoneVariants } },
          ],
          AND: [
            {
              OR: [
                ...(UUID_REGEX.test(id) ? [{ id }] : []),
                { orderNumber: id },
              ],
            },
          ],
        },
        include: { tenant: true, items: true, reservation: true },
      });

      if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        return reply.status(400).send({
          error: 'Order has already been shipped. Cancellation is not allowed. Please contact concierge support.',
        });
      }

      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        return reply.status(400).send({ error: 'Order is already cancelled or refunded' });
      }

      const updatedOrder = await prisma.$transaction(async (tx) => {
        const cas = await tx.order.updateMany({
          where: {
            id: order.id,
            tenantId: session.tenantId,
            status: { in: ['PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'PROCESSING'] },
          },
          data: {
            status: 'CANCELLED',
            cancelReason: reason,
          },
        });
        if (cas.count !== 1) {
          throw new Error('ORDER_STATE_CONFLICT');
        }

        // Release ACTIVE reservation OR restore committed stock
        if (order.reservationId && order.reservation) {
          const resReleased = await tx.inventoryReservation.updateMany({
            where: { id: order.reservationId, status: 'ACTIVE' },
            data: { status: 'RELEASED' },
          });

          const resItems = Array.isArray(order.reservation.items)
            ? (order.reservation.items as Array<{ productId: string; quantity: number }>)
            : [];

          if (resReleased.count === 1) {
            for (const it of resItems) {
              if (it.productId && it.quantity > 0) {
                await tx.$executeRaw`
                  UPDATE "Product"
                  SET reserved = GREATEST(0, reserved - ${it.quantity}), "updatedAt" = NOW()
                  WHERE id = ${it.productId}::uuid AND "tenantId" = ${session.tenantId}::uuid
                `;
              }
            }
          } else if (
            order.reservation.status === 'COMMITTED' ||
            order.status === 'PAYMENT_CONFIRMED' ||
            order.status === 'PROCESSING'
          ) {
            for (const it of order.items) {
              await tx.$executeRaw`
                UPDATE "Product"
                SET stock = stock + ${it.quantity},
                    status = CASE WHEN status = 'OUT_OF_STOCK' THEN 'ACTIVE'::"ProductStatus" ELSE status END,
                    "updatedAt" = NOW()
                WHERE id = ${it.productId}::uuid AND "tenantId" = ${session.tenantId}::uuid
              `;
            }
          }
        } else if (order.status === 'PAYMENT_CONFIRMED' || order.status === 'PROCESSING') {
          for (const it of order.items) {
            await tx.$executeRaw`
              UPDATE "Product"
              SET stock = stock + ${it.quantity},
                  status = CASE WHEN status = 'OUT_OF_STOCK' THEN 'ACTIVE'::"ProductStatus" ELSE status END,
                  "updatedAt" = NOW()
              WHERE id = ${it.productId}::uuid AND "tenantId" = ${session.tenantId}::uuid
            `;
          }
        }

        return tx.order.findUniqueOrThrow({ where: { id: order.id } });
      });

      const waMessage = `Order *#${order.orderNumber}* at *${order.tenant.name}* has been cancelled.\n\n` +
        `Reason: _${reason}_\n\n` +
        `If payment was captured, our concierge will process your refund according to our store policy.`;

      await EvolutionService.sendTextMessage(order.tenant.whatsappInstanceName, session.phone, waMessage);

      return reply.send({
        order: updatedOrder,
        message: 'Order cancelled and inventory restored successfully',
      });
    }
  );

  /**
   * Web Checkout: Re-prices items from live Postgres catalog, atomically reserves/deducts stock,
   * creates InventoryReservation linked via Order.reservationId, and generates online payment links.
   */
  server.post(
    '/api/v1/customer/checkout',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const parsed = WebCheckoutSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors[0]?.message || 'Invalid checkout payload',
        });
      }

      const { channel, deliveryAddress, paymentMethod } = parsed.data;

      const tenant = await prisma.tenant.findFirst({
        where: { id: session.tenantId, status: 'ACTIVE' },
      });
      if (!tenant) {
        return reply.status(404).send({ error: 'Active store not found' });
      }

      const cart = await CartService.getCart(tenant.id, session.phone, channel);
      if (cart.items.length === 0) {
        return reply.status(400).send({ error: 'Cart is empty' });
      }

      const storePolicies = (tenant.storePolicies as Record<string, any>) || {};
      const freeShippingThreshold = Number(storePolicies['freeShippingThreshold'] ?? 1999);
      const standardShippingFee = Number(storePolicies['standardShippingFee'] ?? 99);

      const orderNumber = generateCollisionSafeOrderNumber('WCOS');

      let createdOrder: any;
      try {
        createdOrder = await prisma.$transaction(async (tx) => {
          const liveItems: Array<{
            productId: string;
            productCode: string;
            productName: string;
            productImageUrl: string | null;
            quantity: number;
            unitPrice: number;
            mrpPrice: number;
            totalAtOrder: number;
          }> = [];

          let itemSubtotal = 0;
          let totalMrp = 0;

          for (const cartItem of cart.items) {
            const product = await tx.product.findFirst({
              where: {
                id: cartItem.productId,
                tenantId: tenant.id,
                status: 'ACTIVE',
              },
            });
            if (!product) {
              throw new Error(`PRODUCT_UNAVAILABLE:${cartItem.productName}`);
            }

            // Conditional atomic reservation / stock check
            if (paymentMethod === 'COD') {
              const affected = await tx.$executeRaw`
                UPDATE "Product"
                SET stock = stock - ${cartItem.quantity},
                    status = CASE WHEN stock - ${cartItem.quantity} = 0 THEN 'OUT_OF_STOCK'::"ProductStatus" ELSE status END,
                    "updatedAt" = NOW()
                WHERE id = ${product.id}::uuid
                  AND "tenantId" = ${tenant.id}::uuid
                  AND (stock - reserved) >= ${cartItem.quantity}
              `;
              if (affected !== 1) {
                throw new Error(`OUT_OF_STOCK:${product.name}`);
              }
            } else {
              const affected = await tx.$executeRaw`
                UPDATE "Product"
                SET reserved = reserved + ${cartItem.quantity},
                    "updatedAt" = NOW()
                WHERE id = ${product.id}::uuid
                  AND "tenantId" = ${tenant.id}::uuid
                  AND (stock - reserved) >= ${cartItem.quantity}
              `;
              if (affected !== 1) {
                throw new Error(`OUT_OF_STOCK:${product.name}`);
              }
            }

            const mrp = Number(product.price);
            const effectiveUnitPrice = Number(product.salePrice ?? product.price);
            const lineTotal = Number((effectiveUnitPrice * cartItem.quantity).toFixed(2));
            itemSubtotal += lineTotal;
            totalMrp += mrp * cartItem.quantity;

            liveItems.push({
              productId: product.id,
              productCode: product.code,
              productName: product.name,
              productImageUrl: product.thumbnailUrl || product.imageUrls[0] || null,
              quantity: cartItem.quantity,
              unitPrice: effectiveUnitPrice,
              mrpPrice: mrp,
              totalAtOrder: lineTotal,
            });
          }

          const totalDiscount = Number(Math.max(0, totalMrp - itemSubtotal).toFixed(2));
          const shippingCharge =
            itemSubtotal >= freeShippingThreshold ? 0 : standardShippingFee;
          const total = Number((itemSubtotal + shippingCharge).toFixed(2));

          const reservation = await tx.inventoryReservation.create({
            data: {
              tenantId: tenant.id,
              items: liveItems.map((it) => ({
                productId: it.productId,
                quantity: it.quantity,
              })),
              expiresAt: new Date(Date.now() + 15 * 60 * 1000),
              status: paymentMethod === 'COD' ? 'COMMITTED' : 'ACTIVE',
            },
          });

          return tx.order.create({
            data: {
              tenantId: tenant.id,
              customerId: session.customerId,
              customerPhone: session.phone,
              customerName: deliveryAddress.recipientName,
              orderNumber,
              subtotal: itemSubtotal,
              discount: totalDiscount,
              shippingCharge,
              total,
              currency: 'INR',
              status: paymentMethod === 'COD' ? 'PROCESSING' : 'PENDING_PAYMENT',
              paymentMethod,
              reservationId: reservation.id,
              deliveryAddress,
              items: {
                create: liveItems.map((i) => ({
                  productId: i.productId,
                  productCode: i.productCode,
                  productName: i.productName,
                  productImageUrl: i.productImageUrl,
                  quantity: i.quantity,
                  priceAtOrder: i.unitPrice,
                  totalAtOrder: i.totalAtOrder,
                })),
              },
            },
            include: { items: true },
          });
        });
      } catch (err: any) {
        if (typeof err.message === 'string' && err.message.startsWith('OUT_OF_STOCK:')) {
          return reply.status(409).send({
            error: `Insufficient stock for ${err.message.slice('OUT_OF_STOCK:'.length)}`,
          });
        }
        if (typeof err.message === 'string' && err.message.startsWith('PRODUCT_UNAVAILABLE:')) {
          return reply.status(400).send({
            error: `${err.message.slice('PRODUCT_UNAVAILABLE:'.length)} is no longer active`,
          });
        }
        throw err;
      }

      let paymentUrl: string | undefined;
      if (paymentMethod !== 'COD') {
        const ua = String(request.headers['user-agent'] || '');
        const platform =
          paymentMethod === 'PHONEPE_ONLINE' ? 'android' : detectPlatformFromUserAgent(ua);
        try {
          const routerResult = await paymentGatewayRouter.createPaymentLink(
            {
              tenantId: tenant.id,
              orderId: createdOrder.id,
              orderNumber: createdOrder.orderNumber,
              amount: Number(createdOrder.total),
              currency: createdOrder.currency || 'INR',
              customerName: deliveryAddress.recipientName,
              customerPhone: session.phone,
              description: `Order #${createdOrder.orderNumber} - ${tenant.name}`,
            },
            platform,
            tenant.paymentConfigEncrypted
          );
          paymentUrl = routerResult.paymentUrl;

          createdOrder = await prisma.order.update({
            where: { id: createdOrder.id },
            data: {
              paymentMethod: routerResult.paymentMethod,
              razorpayOrderId: routerResult.phonePeTransactionId
                ? `PHONEPE:${routerResult.phonePeTransactionId}`
                : routerResult.razorpayOrderId || undefined,
              trackingUrl: paymentUrl,
            },
            include: { items: true },
          });
        } catch (gwErr: any) {
          // Payment gateway failed: release reservation & cancel pending order atomically
          await prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: createdOrder.id },
              data: { status: 'CANCELLED', cancelReason: 'Payment gateway initialization failed' },
            });
            if (createdOrder.reservationId) {
              await tx.inventoryReservation.updateMany({
                where: { id: createdOrder.reservationId, status: 'ACTIVE' },
                data: { status: 'RELEASED' },
              });
              for (const it of createdOrder.items) {
                await tx.$executeRaw`
                  UPDATE "Product"
                  SET reserved = GREATEST(0, reserved - ${it.quantity}), "updatedAt" = NOW()
                  WHERE id = ${it.productId}::uuid AND "tenantId" = ${tenant.id}::uuid
                `;
              }
            }
          });
          return reply.status(502).send({
            error: `Payment gateway unavailable: ${gwErr.message}`,
          });
        }
      }

      // Clear checked out cart ONLY after order & payment link initialization succeed
      await CartService.clearCart(tenant.id, session.phone, channel);

      try {
        if (deliveryAddress.line1 && deliveryAddress.pincode) {
          const existingAddr = await prisma.customerAddress.findFirst({
            where: {
              customerId: session.customerId,
              line1: deliveryAddress.line1,
              pincode: deliveryAddress.pincode,
            },
          });
          if (!existingAddr) {
            const hasAnyDefault = await prisma.customerAddress.findFirst({
              where: { customerId: session.customerId, isDefault: true },
            });
            const created = await prisma.customerAddress.create({
              data: {
                customerId: session.customerId,
                label: hasAnyDefault ? 'Delivery Address' : 'Home',
                recipientName: deliveryAddress.recipientName,
                phone: deliveryAddress.phone,
                line1: deliveryAddress.line1,
                line2: deliveryAddress.line2 || null,
                landmark: deliveryAddress.landmark || null,
                city: deliveryAddress.city,
                state: deliveryAddress.state,
                pincode: deliveryAddress.pincode,
                isDefault: !hasAnyDefault,
              },
            });
            if (!hasAnyDefault) {
              await prisma.customer.update({
                where: { id: session.customerId },
                data: { defaultAddressId: created.id },
              });
            }
          }
        }
      } catch (err: any) {
        console.warn('[Checkout] Failed to auto-save address:', err.message);
      }

      const waReceipt = `🛍️ *Order Confirmation: #${orderNumber}*\n\n` +
        `Thank you for ordering with *${tenant.name}*!\n\n` +
        `*Items:*\n` +
        createdOrder.items.map((i: any) => `• ${i.productName} × ${i.quantity} (₹${i.totalAtOrder})`).join('\n') +
        `\n\n*Total Amount:* ₹${createdOrder.total}\n` +
        `*Delivery To:* ${deliveryAddress.line1}, ${deliveryAddress.city}\n` +
        (paymentUrl ? `\n💳 *Complete Payment:* ${paymentUrl}\n` : '\n');

      await EvolutionService.sendTextMessage(tenant.whatsappInstanceName, session.phone, waReceipt);

      return reply.send({
        order: {
          ...createdOrder,
          subtotal: Number(createdOrder.subtotal),
          discount: Number(createdOrder.discount),
          shippingCharge: Number(createdOrder.shippingCharge),
          total: Number(createdOrder.total),
        },
        paymentUrl,
        message: 'Order created successfully',
      });
    }
  );

  /**
   * Public tracking endpoint — strictly requires an active tenant slug!
   */
  server.get<{
    Params: { query: string };
    Headers: { 'x-tenant-slug'?: string };
    Querystring: { tenantSlug?: string };
  }>('/api/v1/customer/track/:query', async (request, reply) => {
    const { query } = request.params;
    const tenantSlug =
      (request.headers['x-tenant-slug'] as string) ||
      request.query?.tenantSlug;

    if (!tenantSlug) {
      return reply.status(400).send({
        error: 'BadRequest',
        message: 'x-tenant-slug header or tenantSlug query parameter is required.',
      });
    }

    let tenant;
    try {
      tenant = await CustomerAuthService.resolveTenant(tenantSlug);
    } catch {
      return reply.status(404).send({
        error: 'StoreNotFound',
        message: 'Store not found or inactive.',
      });
    }

    const trimmed = query.trim();

    const order = await prisma.order.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [
          { awbCode: trimmed },
          { trackingNumber: trimmed },
          { orderNumber: trimmed },
          ...(UUID_REGEX.test(trimmed) ? [{ id: trimmed }] : []),
        ],
      },
      include: {
        items: true,
        tenant: {
          select: {
            name: true,
            slug: true,
            whatsappPhoneNumber: true,
          },
        },
      },
    });

    if (!order) {
      return reply.status(404).send({
        error: 'ShipmentNotFound',
        message: `No consignment records found matching "${trimmed}". Please check the AWB or Order Number.`,
      });
    }

    const delhiveryStatus = getDelhiveryLiveTrackingStatus(order, order.tenant?.slug || tenant.slug || '');

    const maskedName = order.customerName
      ? `${order.customerName.charAt(0)}***${order.customerName.slice(-1)}`
      : 'Customer';

    const deliveryAddress = (order.deliveryAddress as any) || {};
    const city = deliveryAddress.city || delhiveryStatus.destination.city || '';
    const state = deliveryAddress.state || delhiveryStatus.destination.state || '';
    const pincode = deliveryAddress.pincode ? `******${deliveryAddress.pincode.slice(-3)}` : '***';

    return reply.send({
      shipment: {
        orderNumber: delhiveryStatus.orderNumber,
        status: delhiveryStatus.orderStatus,
        courierPartner: 'DELHIVERY',
        courierName: 'Delhivery Express',
        awbCode: delhiveryStatus.awbCode,
        trackingUrl: delhiveryStatus.trackingUrl,
        courierPortalUrl: delhiveryStatus.courierPortalUrl,
        dispatchedAt: order.dispatchedAt || order.createdAt,
        estimatedDelivery: delhiveryStatus.expectedDeliveryDate,
        currentLocation: delhiveryStatus.currentLocation,
        currentStatusLabel: delhiveryStatus.currentStatusLabel,
        destination: {
          recipientMasked: maskedName,
          city,
          state,
          pincode,
        },
        itemsSummary: delhiveryStatus.items.map((it) => ({
          productName: it.name,
          productCode: it.productCode || '',
          quantity: it.quantity,
        })),
        itemCount: delhiveryStatus.items.length,
        trackingEvents: delhiveryStatus.milestones,
        store: {
          name: order.tenant?.name || tenant.name,
          slug: order.tenant?.slug || tenant.slug || '',
          whatsappNumber: order.tenant?.whatsappPhoneNumber,
        },
      },
    });
  });
};
