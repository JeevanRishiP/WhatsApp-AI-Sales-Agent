import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { requireCustomerAuth } from '../../middleware/customer-auth.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function syncSavedAddressToMemory(
  tenantId: string,
  customerPhone: string,
  address: {
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    pincode: string;
  } | null
) {
  const customerMem = await prisma.customerMemory.findFirst({
    where: { tenantId, customerPhone },
  });
  if (!customerMem) return;

  const pref = { ...((customerMem.preferredAttributes as Record<string, any>) || {}) };
  if (address) {
    pref['savedAddress'] = {
      name: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 || '',
      landmark: address.landmark || '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    };
  } else {
    delete pref['savedAddress'];
  }

  await prisma.customerMemory.update({
    where: { id: customerMem.id },
    data: { preferredAttributes: pref },
  });
}

export const customerAddressesRoutes: FastifyPluginAsync = async (server) => {
  /**
   * GET /api/v1/customer/addresses
   * Lists all saved delivery addresses for the authenticated customer.
   */
  server.get(
    '/api/v1/customer/addresses',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;

      const addresses = await prisma.customerAddress.findMany({
        where: { customerId: session.customerId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      });

      return reply.send({ addresses });
    }
  );

  /**
   * POST /api/v1/customer/addresses
   * Creates a new delivery address for the customer.
   */
  server.post<{
    Body: {
      label?: string;
      recipientName: string;
      phone: string;
      line1: string;
      line2?: string;
      landmark?: string;
      city: string;
      state: string;
      pincode: string;
      isDefault?: boolean;
    };
  }>(
    '/api/v1/customer/addresses',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const data = request.body;

      if (!data.recipientName || !data.phone || !data.line1 || !data.city || !data.state || !data.pincode) {
        return reply.status(400).send({
          error: 'Missing required address fields (recipientName, phone, line1, city, state, pincode)',
        });
      }

      // Check existing addresses count
      const existingCount = await prisma.customerAddress.count({
        where: { customerId: session.customerId },
      });

      const shouldBeDefault = data.isDefault || existingCount === 0;

      // If this address should be default, reset existing defaults
      if (shouldBeDefault) {
        await prisma.customerAddress.updateMany({
          where: { customerId: session.customerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const address = await prisma.customerAddress.create({
        data: {
          customerId: session.customerId,
          label: data.label || (existingCount === 0 ? 'Home' : 'Address'),
          recipientName: data.recipientName.trim(),
          phone: data.phone.trim(),
          line1: data.line1.trim(),
          line2: data.line2 ? data.line2.trim() : null,
          landmark: data.landmark ? data.landmark.trim() : null,
          city: data.city.trim(),
          state: data.state.trim(),
          pincode: data.pincode.trim(),
          isDefault: shouldBeDefault,
        },
      });

      // Update customer default address reference if needed
      if (shouldBeDefault) {
        await prisma.customer.update({
          where: { id: session.customerId },
          data: { defaultAddressId: address.id },
        });
        await syncSavedAddressToMemory(session.tenantId, session.phone, address);
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorId: session.customerId,
          actorType: 'HUMAN',
          action: 'CUSTOMER_ADDED_SAVED_ADDRESS',
          resourceId: address.id,
          metadata: {
            label: address.label,
            city: address.city,
            pincode: address.pincode,
            isDefault: address.isDefault,
          },
        },
      });

      return reply.status(201).send({
        address,
        success: true,
        message: 'Delivery address saved successfully',
      });
    }
  );

  /**
   * PATCH /api/v1/customer/addresses/:id
   * Updates an existing delivery address or toggles default status.
   */
  server.patch<{
    Params: { id: string };
    Body: {
      label?: string;
      recipientName?: string;
      phone?: string;
      line1?: string;
      line2?: string;
      landmark?: string;
      city?: string;
      state?: string;
      pincode?: string;
      isDefault?: boolean;
    };
  }>(
    '/api/v1/customer/addresses/:id',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: 'Invalid address ID' });
      }
      const data = request.body;

      const existing = await prisma.customerAddress.findFirst({
        where: { id, customerId: session.customerId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Address not found' });
      }

      if (data.isDefault) {
        await prisma.customerAddress.updateMany({
          where: { customerId: session.customerId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const updated = await prisma.customerAddress.update({
        where: { id },
        data: {
          label: data.label !== undefined ? data.label : existing.label,
          recipientName: data.recipientName !== undefined ? data.recipientName.trim() : existing.recipientName,
          phone: data.phone !== undefined ? data.phone.trim() : existing.phone,
          line1: data.line1 !== undefined ? data.line1.trim() : existing.line1,
          line2: data.line2 !== undefined ? (data.line2 ? data.line2.trim() : null) : existing.line2,
          landmark: data.landmark !== undefined ? (data.landmark ? data.landmark.trim() : null) : existing.landmark,
          city: data.city !== undefined ? data.city.trim() : existing.city,
          state: data.state !== undefined ? data.state.trim() : existing.state,
          pincode: data.pincode !== undefined ? data.pincode.trim() : existing.pincode,
          isDefault: data.isDefault !== undefined ? data.isDefault : existing.isDefault,
        },
      });

      if (data.isDefault) {
        await prisma.customer.update({
          where: { id: session.customerId },
          data: { defaultAddressId: updated.id },
        });
      }
      if (updated.isDefault) {
        await syncSavedAddressToMemory(session.tenantId, session.phone, updated);
      }

      return reply.send({
        address: updated,
        success: true,
        message: 'Delivery address updated successfully',
      });
    }
  );

  /**
   * DELETE /api/v1/customer/addresses/:id
   * Removes a saved delivery address.
   */
  server.delete<{
    Params: { id: string };
  }>(
    '/api/v1/customer/addresses/:id',
    { preHandler: [requireCustomerAuth] },
    async (request, reply) => {
      const session = request.customerSession!;
      const { id } = request.params;
      if (!UUID_REGEX.test(id)) {
        return reply.status(400).send({ error: 'Invalid address ID' });
      }

      const existing = await prisma.customerAddress.findFirst({
        where: { id, customerId: session.customerId },
      });

      if (!existing) {
        return reply.status(404).send({ error: 'Address not found' });
      }

      await prisma.customerAddress.delete({
        where: { id },
      });

      // If deleted was default, promote newest address to default and keep CustomerMemory synced
      if (existing.isDefault) {
        const nextDefault = await prisma.customerAddress.findFirst({
          where: { customerId: session.customerId },
          orderBy: { createdAt: 'desc' },
        });

        if (nextDefault) {
          await prisma.customerAddress.update({
            where: { id: nextDefault.id },
            data: { isDefault: true },
          });
          await prisma.customer.update({
            where: { id: session.customerId },
            data: { defaultAddressId: nextDefault.id },
          });
          await syncSavedAddressToMemory(session.tenantId, session.phone, nextDefault);
        } else {
          await prisma.customer.update({
            where: { id: session.customerId },
            data: { defaultAddressId: null },
          });
          await syncSavedAddressToMemory(session.tenantId, session.phone, null);
        }
      }

      return reply.send({
        success: true,
        message: 'Delivery address removed successfully',
      });
    }
  );
};

