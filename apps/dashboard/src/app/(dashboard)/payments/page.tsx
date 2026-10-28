import { Suspense } from 'react';
import { getSession } from '../../../lib/auth';
import {
  listPayments,
  getPaymentSummary,
  getGatewayRevenueByDay,
  type PaymentGateway,
} from '../../../lib/dal/payments';
import { PaymentsClient } from './PaymentsClient';

export const metadata = {
  title: 'Payments | Commerce OS',
  description: 'Payment transactions and gateway analytics',
};

interface SearchParams {
  page?: string;
  gateway?: string;
  status?: string;
  search?: string;
}

async function PaymentsContent({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();

  const page = Math.max(1, parseInt(searchParams.page || '1', 10));

  const [paymentsResult, summary, revenueByDay] = await Promise.all([
    listPayments(session.tenantId, {
      page,
      limit: 25,
      gateway: searchParams.gateway as PaymentGateway | undefined,
      status: searchParams.status,
      search: searchParams.search,
    }),
    getPaymentSummary(session.tenantId),
    getGatewayRevenueByDay(session.tenantId),
  ]);

  // Serialize dates for client component
  const payments = paymentsResult.items.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <PaymentsClient
      payments={payments}
      summary={summary}
      revenueByDay={revenueByDay}
      total={paymentsResult.pagination.total}
      page={paymentsResult.pagination.page}
      totalPages={paymentsResult.pagination.totalPages}
    />
  );
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-subtitle">
            Multi-gateway payment analytics — Razorpay, PhonePe & Cash on Delivery
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href={`/api/payments/export${searchParams.gateway || searchParams.status ? `?gateway=${searchParams.gateway || ''}&status=${searchParams.status || ''}` : ''}`}
            download
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: 'var(--text-primary)',
              textDecoration: 'none',
            }}
          >
            ⬇ Export CSV
          </a>
        </div>
      </div>

      <Suspense
        fallback={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '40px', color: 'var(--text-muted)' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Loading payment data…
          </div>
        }
      >
        <PaymentsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
