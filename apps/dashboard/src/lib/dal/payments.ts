// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Payments                                 ║
// ║                                                               ║
// ║  Aggregated payment transaction view across all gateways.     ║
// ║  Every query is scoped to tenantId.                           ║
// ╚═══════════════════════════════════════════════════════════════╝

import { prisma, type Prisma } from '@wcos/db';

// ─── Types ────────────────────────────────────────────────────────

export type PaymentGateway = 'RAZORPAY' | 'PHONEPE' | 'COD' | 'UNKNOWN';

export interface PaymentRecord {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  gateway: PaymentGateway;
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentSummary {
  totalCollected: number;
  totalPending: number;
  totalRefunded: number;
  razorpayVolume: number;
  phonepeVolume: number;
  codVolume: number;
  successRate: number;
  avgTransactionValue: number;
  countByGateway: { gateway: string; count: number; volume: number }[];
  recentFailures: number;
}

export interface PaymentListOptions {
  page?: number;
  limit?: number;
  gateway?: PaymentGateway;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function resolveGateway(paymentMethod: string | null): PaymentGateway {
  if (!paymentMethod) return 'UNKNOWN';
  if (paymentMethod.startsWith('RAZORPAY')) return 'RAZORPAY';
  if (paymentMethod.startsWith('PHONEPE')) return 'PHONEPE';
  if (paymentMethod === 'COD' || paymentMethod === 'CASH_ON_DELIVERY') return 'COD';
  return 'UNKNOWN';
}

// ─── List Payments ────────────────────────────────────────────────

interface PaginatedPayments {
  items: PaymentRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function listPayments(
  tenantId: string,
  opts: PaymentListOptions = {}
): Promise<PaginatedPayments> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 25, 100);
  const skip = (page - 1) * limit;

  const where: Prisma.OrderWhereInput = { tenantId };

  // Only show orders that have a payment status (not purely PENDING_PAYMENT with no action)
  where.status = {
    in: [
      'PAYMENT_CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'REFUND_INITIATED',
      'REFUNDED',
      'CANCELLED',
      'PENDING_PAYMENT',
    ],
  };

  if (opts.gateway && opts.gateway !== 'UNKNOWN') {
    if (opts.gateway === 'RAZORPAY') {
      where.paymentMethod = 'RAZORPAY_ONLINE';
    } else if (opts.gateway === 'PHONEPE') {
      where.paymentMethod = 'PHONEPE_ONLINE';
    } else if (opts.gateway === 'COD') {
      where.paymentMethod = 'COD';
    }
  }

  if (opts.status) {
    where.status = opts.status as any;
  }

  if (opts.dateFrom || opts.dateTo) {
    where.createdAt = {};
    if (opts.dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = opts.dateFrom;
    if (opts.dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = opts.dateTo;
  }

  if (opts.search) {
    where.OR = [
      { orderNumber: { contains: opts.search, mode: 'insensitive' } },
      { customerName: { contains: opts.search, mode: 'insensitive' } },
      { customerPhone: { contains: opts.search } },
      { razorpayPaymentId: { contains: opts.search, mode: 'insensitive' } },
      { razorpayOrderId: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerPhone: true,
        total: true,
        currency: true,
        status: true,
        paymentMethod: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  const items: PaymentRecord[] = orders.map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    amount: Number(o.total),
    currency: o.currency,
    status: o.status,
    paymentMethod: o.paymentMethod,
    gateway: resolveGateway(o.paymentMethod),
    gatewayOrderId: o.razorpayOrderId,
    gatewayPaymentId: o.razorpayPaymentId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Payment Summary Statistics ───────────────────────────────────

export async function getPaymentSummary(tenantId: string): Promise<PaymentSummary> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [collected, pending, refunded, byGateway] = await Promise.all([
    // Collected (confirmed + processing + shipped + delivered)
    prisma.order.aggregate({
      where: {
        tenantId,
        status: { in: ['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
      },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    }),

    // Pending
    prisma.order.aggregate({
      where: { tenantId, status: 'PENDING_PAYMENT' },
      _sum: { total: true },
    }),

    // Refunded
    prisma.order.aggregate({
      where: { tenantId, status: { in: ['REFUND_INITIATED', 'REFUNDED'] } },
      _sum: { total: true },
    }),

    // By gateway (raw query for breakdown)
    prisma.$queryRaw<{ method: string | null; count: bigint; volume: number }[]>`
      SELECT
        "paymentMethod" as method,
        COUNT(*) as count,
        COALESCE(SUM("total"), 0)::float as volume
      FROM "Order"
      WHERE "tenantId" = ${tenantId}::uuid
        AND "status" IN ('PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
      GROUP BY "paymentMethod"
    `,
  ]);

  const totalCollected = Number(collected._sum.total || 0);
  const totalPaid = collected._count.id;
  const avgTxn = Number(collected._avg.total || 0);

  // Aggregate gateway breakdown
  let razorpayVolume = 0;
  let phonepeVolume = 0;
  let codVolume = 0;
  const countByGateway: { gateway: string; count: number; volume: number }[] = [];

  for (const row of byGateway) {
    const gw = resolveGateway(row.method);
    const volume = Number(row.volume);
    const count = Number(row.count);

    if (gw === 'RAZORPAY') razorpayVolume += volume;
    else if (gw === 'PHONEPE') phonepeVolume += volume;
    else if (gw === 'COD') codVolume += volume;

    const existing = countByGateway.find((g) => g.gateway === gw);
    if (existing) {
      existing.count += count;
      existing.volume += volume;
    } else {
      countByGateway.push({ gateway: gw, count, volume });
    }
  }

  // Count failures in last 30 days (cancelled orders)
  const recentFailures = await prisma.order.count({
    where: {
      tenantId,
      status: 'CANCELLED',
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Success rate = confirmed / (confirmed + cancelled) in last 30 days
  const [recentSuccess, recentTotal] = await Promise.all([
    prisma.order.count({
      where: {
        tenantId,
        status: { in: ['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'] },
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.order.count({
      where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const successRate = recentTotal > 0 ? Math.round((recentSuccess / recentTotal) * 100) : 0;

  return {
    totalCollected,
    totalPending: Number(pending._sum.total || 0),
    totalRefunded: Number(refunded._sum.total || 0),
    razorpayVolume,
    phonepeVolume,
    codVolume,
    successRate,
    avgTransactionValue: Math.round(avgTxn),
    countByGateway,
    recentFailures,
  };
}

// ─── Daily Revenue by Gateway (Last 30 days) ──────────────────────

export interface GatewayDailyRevenue {
  date: string;
  razorpay: number;
  phonepe: number;
  cod: number;
  total: number;
}

export async function getGatewayRevenueByDay(tenantId: string): Promise<GatewayDailyRevenue[]> {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const rows = await prisma.$queryRaw<
    { date: string; method: string | null; revenue: number }[]
  >`
    SELECT
      TO_CHAR("createdAt", 'YYYY-MM-DD') as date,
      "paymentMethod" as method,
      COALESCE(SUM("total"), 0)::float as revenue
    FROM "Order"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "createdAt" >= ${since}
      AND "status" IN ('PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED')
    GROUP BY TO_CHAR("createdAt", 'YYYY-MM-DD'), "paymentMethod"
    ORDER BY date ASC
  `;

  // Merge into per-day buckets
  const byDate = new Map<string, GatewayDailyRevenue>();
  for (const row of rows) {
    if (!byDate.has(row.date)) {
      byDate.set(row.date, { date: row.date, razorpay: 0, phonepe: 0, cod: 0, total: 0 });
    }
    const entry = byDate.get(row.date)!;
    const gw = resolveGateway(row.method);
    const rev = Number(row.revenue);
    if (gw === 'RAZORPAY') entry.razorpay += rev;
    else if (gw === 'PHONEPE') entry.phonepe += rev;
    else if (gw === 'COD') entry.cod += rev;
    entry.total += rev;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
