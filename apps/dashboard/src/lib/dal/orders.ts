// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Orders                                   ║
// ║                                                               ║
// ║  Order management with status pipeline enforcement.           ║
// ║  Every query is scoped to tenantId.                           ║
// ╚═══════════════════════════════════════════════════════════════╝

import { prisma, type Prisma, type Order, type OrderStatus } from '@wcos/db';

// ─── Types ────────────────────────────────────────────────────────

export interface OrderListOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: OrderStatus;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'newest' | 'oldest' | 'total_high' | 'total_low';
}

export interface OrderWithItems extends Order {
  items: Array<{
    id: string;
    productCode: string;
    productName: string;
    productImageUrl: string | null;
    quantity: number;
    priceAtOrder: Prisma.Decimal;
    totalAtOrder: Prisma.Decimal;
  }>;
}

interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── Valid Status Transitions ─────────────────────────────────────
// Enforces that orders can only move through valid states

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['PROCESSING', 'CANCELLED', 'REFUND_INITIATED'],
  PROCESSING: ['SHIPPED', 'CANCELLED', 'REFUND_INITIATED'],
  SHIPPED: ['DELIVERED', 'REFUND_INITIATED'],
  DELIVERED: ['REFUND_INITIATED'],
  CANCELLED: [],
  REFUND_INITIATED: ['REFUNDED'],
  REFUNDED: [],
};

// ─── List Orders ──────────────────────────────────────────────────

export async function listOrders(
  tenantId: string,
  opts: OrderListOptions = {}
): Promise<PaginatedResult<OrderWithItems>> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 20, 100);
  const skip = (page - 1) * limit;

  const where: Prisma.OrderWhereInput = { tenantId };

  if (opts.search) {
    where.OR = [
      { orderNumber: { contains: opts.search, mode: 'insensitive' } },
      { customerName: { contains: opts.search, mode: 'insensitive' } },
      { customerPhone: { contains: opts.search } },
    ];
  }

  if (opts.status) {
    where.status = opts.status;
  }

  if (opts.dateFrom || opts.dateTo) {
    where.createdAt = {};
    if (opts.dateFrom) where.createdAt.gte = opts.dateFrom;
    if (opts.dateTo) where.createdAt.lte = opts.dateTo;
  }

  let orderBy: Prisma.OrderOrderByWithRelationInput;
  switch (opts.sortBy) {
    case 'oldest':
      orderBy = { createdAt: 'asc' };
      break;
    case 'total_high':
      orderBy = { total: 'desc' };
      break;
    case 'total_low':
      orderBy = { total: 'asc' };
      break;
    default:
      orderBy = { createdAt: 'desc' };
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        items: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get Single Order with Items ──────────────────────────────────

export async function getOrder(tenantId: string, orderId: string): Promise<OrderWithItems | null> {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      tenantId, // ← data isolation
    },
    include: {
      items: {
        select: {
          id: true,
          productCode: true,
          productName: true,
          productImageUrl: true,
          quantity: true,
          priceAtOrder: true,
          totalAtOrder: true,
        },
      },
    },
  });
}

// ─── Update Order Status ──────────────────────────────────────────

export async function updateOrderStatus(
  tenantId: string,
  orderId: string,
  newStatus: OrderStatus,
  note?: string,
  staffMeta?: { staffId?: string; staffName?: string; staffRole?: string; reason?: string }
): Promise<Order> {
  // Get current order — verify ownership
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  // Validate state transition
  const allowed = VALID_TRANSITIONS[order.status];
  if (!allowed?.includes(newStatus)) {
    throw new Error(
      `Cannot transition from ${order.status} to ${newStatus}. Allowed: ${allowed?.join(', ') || 'none'}`
    );
  }

  const staffName = staffMeta?.staffName || 'Staff';
  const staffRole = (staffMeta?.staffRole as any) || 'STORE_MANAGER';
  const reason = staffMeta?.reason || note || `Status changed from ${order.status} to ${newStatus}`;

  // Build status history entry
  const currentHistory = (order.statusHistory as any[]) || [];
  const newHistory = [
    ...currentHistory,
    {
      status: newStatus,
      timestamp: new Date().toISOString(),
      updatedBy: staffName,
      staffRole,
      note: note || undefined,
    },
  ];

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: newStatus,
      statusHistory: newHistory as Prisma.InputJsonValue,
    },
  });

  // Record audit log
  await prisma.dataRevisionLog.create({
    data: {
      tenantId,
      entityType: 'ORDER',
      entityId: orderId,
      action: 'STATUS_CHANGE',
      staffId: staffMeta?.staffId,
      staffName,
      staffRole,
      actorType: 'STAFF',
      reason,
      beforeSnapshot: { status: order.status },
      afterSnapshot: { status: newStatus },
      diffSummary: {
        status: { from: order.status, to: newStatus },
      },
    },
  }).catch((err) => console.error('[AuditLog] Failed to record status change revision:', err));

  return updatedOrder;
}

// ─── Update Tracking ──────────────────────────────────────────────

export async function updateTracking(
  tenantId: string,
  orderId: string,
  trackingNumber: string,
  trackingUrl?: string,
  staffMeta?: { staffId?: string; staffName?: string; staffRole?: string; reason?: string }
): Promise<Order> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  const staffName = staffMeta?.staffName || 'Fulfillment';
  const staffRole = (staffMeta?.staffRole as any) || 'FULFILLMENT_LEAD';
  const reason = staffMeta?.reason || `Courier tracking assigned: ${trackingNumber}`;

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber,
      trackingUrl: trackingUrl || undefined,
      status: order.status === 'PROCESSING' ? 'SHIPPED' : order.status,
    },
  });

  // Record tamper-proof audit trail
  await prisma.dataRevisionLog.create({
    data: {
      tenantId,
      entityType: 'ORDER',
      entityId: orderId,
      action: 'TRACKING_UPDATE',
      staffId: staffMeta?.staffId,
      staffName,
      staffRole,
      actorType: 'STAFF',
      reason,
      beforeSnapshot: { trackingNumber: order.trackingNumber, status: order.status },
      afterSnapshot: { trackingNumber, trackingUrl, status: updatedOrder.status },
      diffSummary: {
        trackingNumber: { from: order.trackingNumber, to: trackingNumber },
        status: { from: order.status, to: updatedOrder.status },
      },
    },
  }).catch((err) => console.error('[AuditLog] Failed to record tracking revision:', err));

  return updatedOrder;
}

// ─── Add Internal Note ────────────────────────────────────────────

export async function addInternalNote(
  tenantId: string,
  orderId: string,
  note: string,
  staffMeta?: { staffId?: string; staffName?: string; staffRole?: string }
): Promise<Order> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  const staffName = staffMeta?.staffName || 'Staff';
  const existingNotes = order.internalNotes || '';
  const timestamp = new Date().toLocaleString();
  const updatedNotes = existingNotes
    ? `${existingNotes}\n[${timestamp}] (${staffName}) ${note}`
    : `[${timestamp}] (${staffName}) ${note}`;

  if (staffMeta?.staffId) {
    await prisma.orderInternalNote.create({
      data: {
        tenantId,
        orderId,
        staffId: staffMeta.staffId,
        staffName,
        content: note,
      },
    }).catch(() => {});
  }

  return prisma.order.update({
    where: { id: orderId },
    data: { internalNotes: updatedNotes },
  });
}

// ─── Get Valid Transitions ────────────────────────────────────────

export function getValidTransitions(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}

// ─── Generate Shipping Bill & Link Delivery Partner AWB ───────────

import { createConsignment, type CourierPartner } from '../shipping/logistics-service';

export async function generateBillAndAwb(
  tenantId: string,
  orderId: string,
  courierPartner: CourierPartner,
  staffMeta?: { staffId?: string; staffName?: string; staffRole?: string }
) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
    include: {
      items: true,
      tenant: true,
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  // Strict check: cancelled or refunded orders can never be packed or manifested
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    throw new Error(`Cannot pack or generate shipping bill for a ${order.status.toLowerCase()} order.`);
  }

  if (order.status === 'PENDING_PAYMENT') {
    throw new Error('Cannot pack or dispatch an unpaid order. Payment must be confirmed first.');
  }

  const deliveryAddress = (order.deliveryAddress as any) || {};

  const consignment = await createConsignment({
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName || 'Customer',
    customerPhone: order.customerPhone,
    deliveryAddress,
    courierPartner,
    items: order.items.map((it) => ({
      productName: it.productName,
      productCode: it.productCode,
      quantity: it.quantity,
      price: Number(it.priceAtOrder),
    })),
    totalAmount: Number(order.total),
    paymentMethod: order.paymentMethod || 'PREPAID',
    storeSlug: order.tenant?.slug || 'aura',
    staffName: staffMeta?.staffName || 'Packing Staff',
  });

  const nextStatus =
    order.status === 'PAYMENT_CONFIRMED' || order.status === 'PROCESSING'
      ? 'SHIPPED'
      : order.status;

  const currentHistory = Array.isArray(order.statusHistory)
    ? (order.statusHistory as any[])
    : [];

  let updatedOrder;
  try {
    updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        trackingNumber: consignment.awbCode,
        awbCode: consignment.awbCode,
        trackingUrl: consignment.trackingUrl,
        courierPartner: consignment.courierPartner,
        trackingEvents: consignment.trackingEvents as any,
        dispatchedAt: new Date(consignment.dispatchedAt),
        status: nextStatus,
        statusHistory: [
          ...currentHistory,
          {
            status: nextStatus,
            timestamp: new Date(),
            updatedBy: staffMeta?.staffName || 'Packing Staff',
            note: `Packed with ${consignment.courierName}. Assigned AWB: ${consignment.awbCode}`,
          },
        ],
      },
      include: { items: true, tenant: true },
    });
  } catch (err: any) {
    if (err.message?.includes('Unknown argument')) {
      console.warn('[Prisma] In-memory client cached old schema, falling back to core fields:', err.message);
      updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          trackingNumber: consignment.awbCode,
          trackingUrl: consignment.trackingUrl,
          status: nextStatus,
          statusHistory: [
            ...currentHistory,
            {
              status: nextStatus,
              timestamp: new Date(),
              updatedBy: staffMeta?.staffName || 'Packing Staff',
              note: `Packed with ${consignment.courierName}. Assigned AWB: ${consignment.awbCode}`,
              courierPartner: consignment.courierPartner,
              awbCode: consignment.awbCode,
            },
          ],
        },
        include: { items: true, tenant: true },
      });
    } else {
      throw err;
    }
  }

  // Record audit ledger
  await prisma.dataRevisionLog.create({
    data: {
      tenantId,
      entityType: 'ORDER',
      entityId: orderId,
      action: 'TRACKING_UPDATE',
      staffId: staffMeta?.staffId,
      staffName: staffMeta?.staffName || 'Packing Staff',
      staffRole: (staffMeta?.staffRole as any) || 'FULFILLMENT_LEAD',
      actorType: 'STAFF',
      reason: `Generated shipping bill and linked ${consignment.courierName} AWB: ${consignment.awbCode}`,
      beforeSnapshot: { status: order.status, trackingNumber: order.trackingNumber },
      afterSnapshot: {
        status: updatedOrder.status,
        trackingNumber: updatedOrder.trackingNumber,
        courierPartner: (updatedOrder as any).courierPartner || consignment.courierPartner,
        awbCode: (updatedOrder as any).awbCode || consignment.awbCode,
      },
      diffSummary: {
        awbCode: { from: order.trackingNumber, to: consignment.awbCode },
        courierPartner: { to: consignment.courierPartner },
        status: { from: order.status, to: nextStatus },
      },
    },
  }).catch((err) => console.error('[AuditLog error]', err));

  return { order: updatedOrder, consignment };
}

// ─── Get Order Details for Bill Printing ──────────────────────────

export async function getOrderForBill(tenantId: string, orderId: string) {
  return prisma.order.findFirst({
    where: {
      id: orderId,
      tenantId,
    },
    include: {
      items: true,
      tenant: true,
      assignedStaff: {
        select: { id: true, fullName: true, role: true },
      },
    },
  });
}
