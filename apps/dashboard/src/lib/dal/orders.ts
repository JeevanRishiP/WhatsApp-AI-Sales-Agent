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
  note?: string
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

  // Build status history entry
  const currentHistory = (order.statusHistory as any[]) || [];
  const newHistory = [
    ...currentHistory,
    {
      status: newStatus,
      timestamp: new Date().toISOString(),
      updatedBy: 'owner',
      note: note || undefined,
    },
  ];

  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: newStatus,
      statusHistory: newHistory as Prisma.InputJsonValue,
    },
  });
}

// ─── Update Tracking ──────────────────────────────────────────────

export async function updateTracking(
  tenantId: string,
  orderId: string,
  trackingNumber: string,
  trackingUrl?: string
): Promise<Order> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  return prisma.order.update({
    where: { id: orderId },
    data: {
      trackingNumber,
      trackingUrl: trackingUrl || undefined,
    },
  });
}

// ─── Add Internal Note ────────────────────────────────────────────

export async function addInternalNote(
  tenantId: string,
  orderId: string,
  note: string
): Promise<Order> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  const existingNotes = order.internalNotes || '';
  const timestamp = new Date().toLocaleString();
  const updatedNotes = existingNotes
    ? `${existingNotes}\n[${timestamp}] ${note}`
    : `[${timestamp}] ${note}`;

  return prisma.order.update({
    where: { id: orderId },
    data: { internalNotes: updatedNotes },
  });
}

// ─── Get Valid Transitions ────────────────────────────────────────

export function getValidTransitions(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[currentStatus] || [];
}
