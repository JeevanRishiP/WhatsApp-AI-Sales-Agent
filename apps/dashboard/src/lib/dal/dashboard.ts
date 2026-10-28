// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Dashboard Statistics                     ║
// ║                                                               ║
// ║  Aggregation queries for the dashboard home page.             ║
// ║  Every query is scoped to tenantId.                           ║
// ╚═══════════════════════════════════════════════════════════════╝

import { prisma, Prisma } from '@wcos/db';

export interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  pendingOrders: number;
  todayOrders: number;
  todayRevenue: number;
  monthRevenue: number;
  monthOrders: number;
}

export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalRevenue,
    totalOrders,
    totalCustomers,
    totalProducts,
    activeProducts,
    lowStockProducts,
    pendingOrders,
    todayOrders,
    todayRevenue,
    monthOrders,
    monthRevenue,
  ] = await Promise.all([
    // Total revenue (delivered + shipped + processing orders)
    prisma.order.aggregate({
      where: {
        tenantId,
        status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'PAYMENT_CONFIRMED'] },
      },
      _sum: { total: true },
    }),

    // Total orders
    prisma.order.count({ where: { tenantId } }),

    // Total unique customers
    prisma.customerMemory.count({ where: { tenantId } }),

    // Total products
    prisma.product.count({ where: { tenantId } }),

    // Active products
    prisma.product.count({ where: { tenantId, status: 'ACTIVE' } }),

    // Low stock products (stock <= lowStockThreshold AND active)
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM "Product"
      WHERE "tenantId" = ${tenantId}::uuid
        AND "status" = 'ACTIVE'
        AND "stock" <= "lowStockThreshold"
    `,

    // Pending orders
    prisma.order.count({
      where: { tenantId, status: { in: ['PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'PROCESSING'] } },
    }),

    // Today's orders
    prisma.order.count({
      where: { tenantId, createdAt: { gte: todayStart } },
    }),

    // Today's revenue
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: todayStart },
        status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'PAYMENT_CONFIRMED'] },
      },
      _sum: { total: true },
    }),

    // Month's orders
    prisma.order.count({
      where: { tenantId, createdAt: { gte: monthStart } },
    }),

    // Month's revenue
    prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: monthStart },
        status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'PAYMENT_CONFIRMED'] },
      },
      _sum: { total: true },
    }),
  ]);

  return {
    totalRevenue: Number(totalRevenue._sum.total || 0),
    totalOrders,
    totalCustomers,
    totalProducts,
    activeProducts,
    lowStockProducts: Number(lowStockProducts[0]?.count || 0),
    pendingOrders,
    todayOrders,
    todayRevenue: Number(todayRevenue._sum.total || 0),
    monthRevenue: Number(monthRevenue._sum.total || 0),
    monthOrders,
  };
}

export interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  total: Prisma.Decimal;
  status: string;
  createdAt: Date;
  itemCount: number;
}

export async function getRecentOrders(tenantId: string, limit = 10): Promise<RecentOrder[]> {
  const orders = await prisma.order.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      _count: { select: { items: true } },
    },
  });

  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    total: o.total,
    status: o.status,
    createdAt: o.createdAt,
    itemCount: o._count.items,
  }));
}

export interface LowStockProduct {
  id: string;
  code: string;
  name: string;
  stock: number;
  lowStockThreshold: number;
  category: string | null;
}

export async function getLowStockProducts(tenantId: string, limit = 10): Promise<LowStockProduct[]> {
  const products = await prisma.$queryRaw<LowStockProduct[]>`
    SELECT "id", "code", "name", "stock", "lowStockThreshold", "category"
    FROM "Product"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "status" = 'ACTIVE'
      AND "stock" <= "lowStockThreshold"
    ORDER BY "stock" ASC
    LIMIT ${limit}
  `;
  return products;
}

export interface RevenueByDay {
  date: string;
  revenue: number;
  orderCount: number;
}

export async function getRevenueByDay(tenantId: string, days = 30): Promise<RevenueByDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const result = await prisma.$queryRaw<RevenueByDay[]>`
    SELECT
      TO_CHAR("createdAt", 'YYYY-MM-DD') as date,
      COALESCE(SUM("total"), 0)::float as revenue,
      COUNT(*)::int as "orderCount"
    FROM "Order"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "createdAt" >= ${since}
      AND "status" IN ('DELIVERED', 'SHIPPED', 'PROCESSING', 'PAYMENT_CONFIRMED')
    GROUP BY TO_CHAR("createdAt", 'YYYY-MM-DD')
    ORDER BY date ASC
  `;

  return result;
}

export interface OrdersByStatus {
  status: string;
  count: number;
}

export async function getOrdersByStatus(tenantId: string): Promise<OrdersByStatus[]> {
  const result = await prisma.order.groupBy({
    by: ['status'],
    where: { tenantId },
    _count: { id: true },
  });

  return result.map((r) => ({
    status: r.status,
    count: r._count.id,
  }));
}

export interface TopProduct {
  productId: string;
  productName: string;
  productCode: string;
  totalQuantity: number;
  totalRevenue: number;
}

export async function getTopProducts(tenantId: string, limit = 5): Promise<TopProduct[]> {
  const result = await prisma.$queryRaw<TopProduct[]>`
    SELECT
      oi."productId",
      oi."productName",
      oi."productCode",
      SUM(oi."quantity")::int as "totalQuantity",
      SUM(oi."totalAtOrder")::float as "totalRevenue"
    FROM "OrderItem" oi
    INNER JOIN "Order" o ON o."id" = oi."orderId"
    WHERE o."tenantId" = ${tenantId}::uuid
      AND o."status" IN ('DELIVERED', 'SHIPPED', 'PROCESSING', 'PAYMENT_CONFIRMED')
    GROUP BY oi."productId", oi."productName", oi."productCode"
    ORDER BY "totalQuantity" DESC
    LIMIT ${limit}
  `;
  return result;
}

export interface PriorPeriodStats {
  revenue: number;
  orders: number;
}

export async function getPriorPeriodStats(tenantId: string, days = 30): Promise<PriorPeriodStats> {
  const now = new Date();
  const currentPeriodStart = new Date(now);
  currentPeriodStart.setDate(currentPeriodStart.getDate() - days);

  const priorPeriodStart = new Date(currentPeriodStart);
  priorPeriodStart.setDate(priorPeriodStart.getDate() - days);

  const result = await prisma.order.aggregate({
    where: {
      tenantId,
      createdAt: {
        gte: priorPeriodStart,
        lt: currentPeriodStart,
      },
      status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING', 'PAYMENT_CONFIRMED'] },
    },
    _sum: { total: true },
    _count: { id: true },
  });

  return {
    revenue: Number(result._sum.total || 0),
    orders: result._count.id,
  };
}

