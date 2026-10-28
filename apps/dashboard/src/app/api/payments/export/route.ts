import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@wcos/db';

// ─── Payments CSV Export Endpoint ────────────────────────────────
// GET /api/payments/export
// Returns a CSV of all payment transactions for this tenant.
// Supports query params: gateway, status, dateFrom, dateTo

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const gateway = searchParams.get('gateway');
  const status = searchParams.get('status');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  // Build where clause
  type WhereInput = {
    tenantId: string;
    paymentMethod?: { startsWith: string } | string;
    status?: string | { in: string[] };
    createdAt?: { gte?: Date; lte?: Date };
  };

  const where: WhereInput = { tenantId: session.tenantId };

  if (gateway === 'RAZORPAY') where.paymentMethod = { startsWith: 'RAZORPAY' };
  else if (gateway === 'PHONEPE') where.paymentMethod = { startsWith: 'PHONEPE' };
  else if (gateway === 'COD') where.paymentMethod = 'CASH_ON_DELIVERY';

  if (status) {
    where.status = status;
  } else {
    where.status = {
      in: ['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'PENDING_PAYMENT', 'REFUND_INITIATED', 'REFUNDED', 'CANCELLED'],
    };
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const orders = await prisma.order.findMany({
    where: where as any,
    orderBy: { createdAt: 'desc' },
    take: 5000, // Safety cap
    select: {
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
  });

  // Build CSV
  const headers = [
    'Order Number',
    'Customer Name',
    'Customer Phone',
    'Amount (INR)',
    'Currency',
    'Status',
    'Payment Method',
    'Gateway Order ID',
    'Gateway Payment ID',
    'Created At',
    'Updated At',
  ];

  function escapeCsv(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  const rows = orders.map((o) =>
    [
      o.orderNumber,
      o.customerName,
      o.customerPhone,
      Number(o.total).toFixed(2),
      o.currency,
      o.status,
      o.paymentMethod,
      o.razorpayOrderId,
      o.razorpayPaymentId,
      o.createdAt.toISOString(),
      o.updatedAt.toISOString(),
    ]
      .map(escapeCsv)
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\r\n');
  const filename = `payments_${session.tenantId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
