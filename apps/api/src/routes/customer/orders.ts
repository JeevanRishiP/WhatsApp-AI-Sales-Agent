import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { CartService } from '@wcos/queue';
import { getDelhiveryLiveTrackingStatus } from '@wcos/types';
import { requireCustomerAuth } from '../../middleware/customer-auth.js';
import { EvolutionService } from '../../services/evolution-service.js';
import { CustomerAuthService } from '../../services/customer-auth-service.js';

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
          isEditable: o.status === 'PAYMENT_CONFIRMED' || o.status === 'PROCESSING' || o.status === 'PENDING_PAYMENT',
          isCancellable: o.status === 'PAYMENT_CONFIRMED' || o.status === 'PROCESSING' || o.status === 'PENDING_PAYMENT',
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
          AND: [{ OR: [{ id: id.length === 36 ? id : undefined }, { orderNumber: id }] }],
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
          isEditable: order.status === 'PAYMENT_CONFIRMED' || order.status === 'PROCESSING' || order.status === 'PENDING_PAYMENT',
          isCancellable: order.status === 'PAYMENT_CONFIRMED' || order.status === 'PROCESSING' || order.status === 'PENDING_PAYMENT',
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
          AND: [{ OR: [{ id: id.length === 36 ? id : undefined }, { orderNumber: id }] }],
        },
        include: {
          tenant: true,
        },
      });

      if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      // Check if order has already been shipped or delivered
      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        return reply.status(400).send({
          error: 'Order has already been dispatched. Delivery details cannot be modified self-service.',
        });
      }

      if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        return reply.status(400).send({
          error: 'Order is cancelled and cannot be modified.',
        });
      }

      // Merge current address with updates
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

      // Write immutable audit log
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

      // Auto-upsert into CustomerAddress table for multiple addresses support
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

      // Dispatch automated confirmation to WhatsApp
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
   * Self-service order cancellation before fulfillment.
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
          AND: [{ OR: [{ id: id.length === 36 ? id : undefined }, { orderNumber: id }] }],
        },
        include: { tenant: true },
      });

      if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
      }

      if (order.status === 'SHIPPED' || order.status === 'DELIVERED') {
        return reply.status(400).send({
          error: 'Order has already been shipped. Cancellation is not allowed. Please contact concierge support.',
        });
      }

      if (order.status === 'CANCELLED') {
        return reply.status(400).send({ error: 'Order is already cancelled' });
      }

      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelReason: reason,
        },
      });

      // Send WhatsApp cancellation alert
      const waMessage = `Order *#${order.orderNumber}* at *${order.tenant.name}* has been cancelled.\n\n` +
        `Reason: _${reason}_\n\n` +
        `If payment was captured, our concierge will process your refund according to our boutique policy.`;

      await EvolutionService.sendTextMessage(order.tenant.whatsappInstanceName, session.phone, waMessage);

      return reply.send({
        order: updatedOrder,
        message: 'Order cancelled successfully',
      });
    }
  );

  /**
   * Web Checkout: Converts the active web cart into an Order.
   */
  server.post<{
    Body: {
      tenantSlug: string;
      channel?: 'web' | 'wa';
      deliveryAddress: {
        recipientName: string;
        phone: string;
        line1: string;
        line2?: string;
        landmark?: string;
        city: string;
        state: string;
        pincode: string;
        instructions?: string;
      };
      paymentMethod?: 'RAZORPAY_ONLINE' | 'PHONEPE_ONLINE' | 'COD';
    };
  }>(
    '/api/v1/customer/checkout',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const { channel = 'web', deliveryAddress, paymentMethod = 'RAZORPAY_ONLINE' } = request.body;

      const tenant = await prisma.tenant.findUnique({
        where: { id: session.tenantId },
      });

      if (!tenant) {
        return reply.status(404).send({ error: 'Store not found' });
      }

      const cart = await CartService.getCart(tenant.id, session.phone, channel);
      if (cart.items.length === 0) {
        return reply.status(400).send({ error: 'Cart is empty' });
      }

      // Generate order number
      const count = await prisma.order.count({ where: { tenantId: tenant.id } });
      const orderNumber = `WCOS-${(count + 1001).toString()}`;

      const order = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          customerId: session.customerId,
          customerPhone: session.phone,
          customerName: deliveryAddress.recipientName,
          orderNumber,
          subtotal: cart.subtotal,
          total: cart.subtotal,
          currency: cart.currency,
          status: paymentMethod === 'COD' ? 'PROCESSING' : 'PENDING_PAYMENT',
          paymentMethod,
          deliveryAddress,
          items: {
            create: cart.items.map((i) => ({
              productId: i.productId,
              productCode: i.productCode,
              productName: i.productName,
              productImageUrl: i.imageUrl,
              quantity: i.quantity,
              priceAtOrder: i.priceAtAdd,
              totalAtOrder: Number((i.priceAtAdd * i.quantity).toFixed(2)),
            })),
          },
        },
        include: { items: true },
      });

      // Clear the checked out cart
      await CartService.clearCart(tenant.id, session.phone, channel);

      // Auto-save address to CustomerAddress if new
      try {
        if (deliveryAddress && deliveryAddress.line1 && deliveryAddress.pincode) {
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
                recipientName: deliveryAddress.recipientName || order.customerName || 'Customer',
                phone: deliveryAddress.phone || order.customerPhone,
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

      // Send WhatsApp Order Created Receipt
      const waReceipt = `🛍️ *Order Confirmation: #${orderNumber}*\n\n` +
        `Thank you for ordering with *${tenant.name}*!\n\n` +
        `*Items:*\n` +
        order.items.map((i) => `• ${i.productName} × ${i.quantity} (₹${i.totalAtOrder})`).join('\n') +
        `\n\n*Total Amount:* ₹${order.total}\n` +
        `*Delivery To:* ${deliveryAddress.line1}, ${deliveryAddress.city}\n\n` +
        `You can review and modify your delivery details at any time on your private dashboard!`;

      await EvolutionService.sendTextMessage(tenant.whatsappInstanceName, session.phone, waReceipt);

      return reply.send({
        order: {
          ...order,
          subtotal: Number(order.subtotal),
          total: Number(order.total),
        },
        message: 'Order created successfully',
      });
    }
  );

  /**
   * Public tracking endpoint for parcel recipients / website users.
   * Can look up by AWB Tracking Number or Order Number without requiring login.
   */
  server.get<{
    Params: { query: string };
    Headers: { 'x-tenant-slug'?: string };
  }>('/api/v1/customer/track/:query', async (request, reply) => {
    const { query } = request.params;
    const tenantSlug = (request.headers['x-tenant-slug'] as string) || 'aura';

    let tenantId: string | undefined;
    try {
      const tenant = await CustomerAuthService.resolveTenant(tenantSlug);
      tenantId = tenant.id;
    } catch {
      // Fallback if tenant resolution fails
    }

    const trimmed = query.trim();

    const order = await prisma.order.findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
        OR: [
          { awbCode: trimmed },
          { trackingNumber: trimmed },
          { orderNumber: trimmed },
          { id: trimmed.length === 36 ? trimmed : undefined },
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

    const delhiveryStatus = getDelhiveryLiveTrackingStatus(order, order.tenant?.slug || 'aura');

    // Mask customer name for recipient privacy on public links
    const maskedName = order.customerName
      ? `${order.customerName.charAt(0)}***${order.customerName.slice(-1)}`
      : 'Customer';

    const deliveryAddress = (order.deliveryAddress as any) || {};
    const city = deliveryAddress.city || delhiveryStatus.destination.city || 'Bengaluru';
    const state = deliveryAddress.state || delhiveryStatus.destination.state || 'Karnataka';
    const pincode = deliveryAddress.pincode ? `******${deliveryAddress.pincode.slice(-3)}` : '560***';

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
          name: order.tenant?.name || 'Aura Luxe Boutique',
          slug: order.tenant?.slug || 'aura',
          whatsappNumber: order.tenant?.whatsappPhoneNumber,
        },
      },
    });
  });
};

