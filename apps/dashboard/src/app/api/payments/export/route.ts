import { NextRequest, NextResponse } from 'next/server';
import { verifySession, hasRole } from '@/lib/auth';
import { prisma } from '@wcos/db';

// ─── Payments CSV Export Endpoint (RBAC: OWNER / STORE_MANAGER) ───
// GET /api/payments/export

const FORMULA_PREFIX_REGEX = /^[=+\-@\t\r]/;

function sanitizeAndEscapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  let str = String(val);
  // Prevent Excel/Sheets CSV formula injection
  if (FORMULA_PREFIX_REGEX.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden: Only Owner or Store Manager can export payments' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const gateway = searchParams.get('gateway');
  const status = searchParams.get('status');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const where: Record<string, any> = { tenantId: session.tenantId };

  if (gateway === 'RAZORPAY') where.paymentMethod = 'RAZORPAY_ONLINE';
  else if (gateway === 'PHONEPE') where.paymentMethod = 'PHONEPE_ONLINE';
  else if (gateway === 'COD') where.paymentMethod = 'COD';

  if (status) {
    where.status = status;
  } else {
    where.status = {
      in: ['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'PENDING_PAYMENT', 'REFUND_INITIATED', 'REFUNDED', 'CANCELLED'],
    };
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      if (Number.isNaN(fromDate.getTime())) {
        return NextResponse.json({ error: 'Invalid dateFrom parameter' }, { status: 400 });
      }
      where.createdAt.gte = fromDate;
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      if (Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ error: 'Invalid dateTo parameter' }, { status: 400 });
      }
      where.createdAt.lte = toDate;
    }
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
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
      .map(sanitizeAndEscapeCsv)
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\r\n');
  const filename = `payments_${session.tenantId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
