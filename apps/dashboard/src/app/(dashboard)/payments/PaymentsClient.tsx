'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────

interface PaymentRecord {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  gateway: 'RAZORPAY' | 'PHONEPE' | 'COD' | 'UNKNOWN';
  gatewayOrderId: string | null;
  gatewayPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PaymentSummary {
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

interface GatewayDailyRevenue {
  date: string;
  razorpay: number;
  phonepe: number;
  cod: number;
  total: number;
}

interface PaymentsClientProps {
  payments: PaymentRecord[];
  summary: PaymentSummary;
  revenueByDay: GatewayDailyRevenue[];
  total: number;
  page: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getGatewayLabel(gateway: string) {
  switch (gateway) {
    case 'RAZORPAY': return 'Razorpay';
    case 'PHONEPE': return 'PhonePe';
    case 'COD': return 'Cash on Delivery';
    default: return 'Unknown';
  }
}

function getGatewayColor(gateway: string) {
  switch (gateway) {
    case 'RAZORPAY': return '#3B82F6';
    case 'PHONEPE': return '#8B5CF6';
    case 'COD': return '#10B981';
    default: return '#6B7280';
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'PAYMENT_CONFIRMED':
    case 'PROCESSING':
    case 'SHIPPED':
    case 'DELIVERED':
      return 'badge badge-success';
    case 'PENDING_PAYMENT':
      return 'badge badge-warning';
    case 'REFUND_INITIATED':
      return 'badge badge-info';
    case 'REFUNDED':
    case 'CANCELLED':
      return 'badge badge-danger';
    default:
      return 'badge';
  }
}

function getPaymentStatusLabel(status: string) {
  switch (status) {
    case 'PAYMENT_CONFIRMED': return 'Confirmed';
    case 'PROCESSING': return 'Processing';
    case 'SHIPPED': return 'Shipped';
    case 'DELIVERED': return 'Delivered';
    case 'PENDING_PAYMENT': return 'Pending';
    case 'REFUND_INITIATED': return 'Refund Initiated';
    case 'REFUNDED': return 'Refunded';
    case 'CANCELLED': return 'Cancelled';
    default: return status;
  }
}

// ─── Mini Stacked Bar Chart ────────────────────────────────────────

function StackedBarChart({ data }: { data: GatewayDailyRevenue[] }) {
  if (data.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        No payment data for the last 30 days
      </div>
    );
  }

  const maxTotal = Math.max(1, ...data.map((d) => d.total));

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '6px',
        height: '160px',
        paddingBottom: '28px',
        overflowX: 'auto',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {data.map((d) => {
        const totalH = Math.max(4, Math.round((d.total / maxTotal) * 100));
        const razH = d.total > 0 ? Math.round((d.razorpay / d.total) * totalH) : 0;
        const phH = d.total > 0 ? Math.round((d.phonepe / d.total) * totalH) : 0;
        const codH = Math.max(0, totalH - razH - phH);

        return (
          <div
            key={d.date}
            style={{ flex: '1 0 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}
            title={`${d.date}: Total ${fmt(d.total)} | Razorpay ${fmt(d.razorpay)} | PhonePe ${fmt(d.phonepe)} | COD ${fmt(d.cod)}`}
          >
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {razH > 0 && <div style={{ height: `${razH}px`, background: '#3B82F6', borderRadius: razH === totalH ? '3px 3px 0 0' : '0' }} />}
              {phH > 0 && <div style={{ height: `${phH}px`, background: '#8B5CF6' }} />}
              {codH > 0 && <div style={{ height: `${codH}px`, background: '#10B981', borderRadius: razH === 0 && phH === 0 ? '3px 3px 0 0' : '0' }} />}
            </div>
            <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '4px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gateway Pie-like Distribution ────────────────────────────────

function GatewayDistribution({ summary }: { summary: PaymentSummary }) {
  const total = summary.totalCollected;
  const segments = [
    { label: 'Razorpay', value: summary.razorpayVolume, color: '#3B82F6' },
    { label: 'PhonePe', value: summary.phonepeVolume, color: '#8B5CF6' },
    { label: 'COD', value: summary.codVolume, color: '#10B981' },
  ].filter((s) => s.value > 0);

  if (total === 0 || segments.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No transactions yet</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
      {segments.map((seg) => {
        const pct = Math.round((seg.value / total) * 100);
        const gwData = summary.countByGateway.find((g) => g.gateway === seg.label.toUpperCase());
        return (
          <div key={seg.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: seg.color }} />
                <span style={{ fontWeight: 500 }}>{seg.label}</span>
                {gwData && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {gwData.count} txns
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 600 }}>{fmt(seg.value)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px' }}>{pct}%</span>
              </div>
            </div>
            <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: seg.color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Selected Payment Detail Drawer ───────────────────────────────

function PaymentDrawer({
  payment,
  onClose,
}: {
  payment: PaymentRecord;
  onClose: () => void;
}) {
  const isRefundable = ['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(payment.status);

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40,
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: '480px', maxWidth: '95vw',
          background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          zIndex: 50, overflowY: 'auto', padding: '28px 24px',
          display: 'flex', flexDirection: 'column', gap: '24px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>PAYMENT DETAILS</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{fmt(payment.amount)}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{payment.orderNumber}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem' }}>✕</button>
            <span className={getStatusBadge(payment.status)}>{getPaymentStatusLabel(payment.status)}</span>
          </div>
        </div>

        {/* Gateway Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: getGatewayColor(payment.gateway), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
            {payment.gateway === 'RAZORPAY' ? '💳' : payment.gateway === 'PHONEPE' ? '📱' : '💵'}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{getGatewayLabel(payment.gateway)}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {payment.paymentMethod?.replace(/_/g, ' ') || 'Unknown Method'}
            </div>
          </div>
        </div>

        {/* Customer Info */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '10px', textTransform: 'uppercase' }}>Customer</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <InfoRow label="Name" value={payment.customerName || 'Anonymous'} />
            <InfoRow label="Phone" value={payment.customerPhone} />
          </div>
        </div>

        {/* Gateway IDs */}
        {(payment.gatewayOrderId || payment.gatewayPaymentId) && (
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '10px', textTransform: 'uppercase' }}>Gateway Reference</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {payment.gatewayOrderId && (
                <InfoRow label="Order ID" value={payment.gatewayOrderId} mono />
              )}
              {payment.gatewayPaymentId && (
                <InfoRow label="Payment ID" value={payment.gatewayPaymentId} mono />
              )}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '10px', textTransform: 'uppercase' }}>Timestamps</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <InfoRow label="Created" value={fmtDate(payment.createdAt)} />
            <InfoRow label="Last Updated" value={fmtDate(payment.updatedAt)} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <a
            href={`/orders?search=${payment.orderNumber}`}
            style={{ display: 'block', padding: '11px 16px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', textDecoration: 'none', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600 }}
          >
            View Full Order →
          </a>
          {isRefundable && (
            <button
              style={{ padding: '11px 16px', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '8px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => alert('Refund flow: open Razorpay/PhonePe dashboard to process refund, then mark order as REFUND_INITIATED from the Orders page.')}
            >
              Initiate Refund
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', fontSize: '0.875rem' }}>
      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', fontFamily: mono ? 'monospace' : undefined, fontSize: mono ? '0.8125rem' : undefined, wordBreak: 'break-all' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export function PaymentsClient({
  payments,
  summary,
  revenueByDay,
  total,
  page,
  totalPages,
}: PaymentsClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [searchValue, setSearchValue] = useState(searchParams.get('search') || '');

  function navigate(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete('page');
    router.push(`/payments?${sp.toString()}`);
  }

  const currentGateway = searchParams.get('gateway') || '';
  const currentStatus = searchParams.get('status') || '';

  return (
    <div>
      {/* Summary KPIs */}
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="card kpi-card">
          <div className="kpi-label">Total Collected</div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{fmt(summary.totalCollected)}</div>
          <div className="kpi-subtext">Confirmed + Processing + Delivered</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Pending Payments</div>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{fmt(summary.totalPending)}</div>
          <div className="kpi-subtext">Awaiting confirmation</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Refunded</div>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{fmt(summary.totalRefunded)}</div>
          <div className="kpi-subtext">Initiated or completed refunds</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">30-Day Success Rate</div>
          <div className="kpi-value" style={{ color: summary.successRate >= 80 ? 'var(--success)' : 'var(--warning)' }}>
            {summary.successRate}%
          </div>
          <div className="kpi-subtext">Avg txn: {fmt(summary.avgTransactionValue)}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {/* Stacked Bar Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Daily Revenue by Gateway</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Last 30 days — Razorpay <span style={{ color: '#3B82F6' }}>■</span> PhonePe <span style={{ color: '#8B5CF6' }}>■</span> COD <span style={{ color: '#10B981' }}>■</span>
              </p>
            </div>
          </div>
          <StackedBarChart data={revenueByDay} />
        </div>

        {/* Gateway Distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Gateway Distribution</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Revenue share by payment channel</p>
            </div>
          </div>
          <GatewayDistribution summary={summary} />
        </div>
      </div>

      {/* Transaction Table */}
      <div className="card">
        {/* Filters */}
        <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>All Transactions</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{total} payment records</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Order #, customer, gateway ID…"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate({ search: searchValue || undefined });
              }}
              className="input"
              style={{ width: '220px' }}
            />

            {/* Gateway filter */}
            <select
              className="select"
              value={currentGateway}
              onChange={(e) => navigate({ gateway: e.target.value || undefined })}
            >
              <option value="">All Gateways</option>
              <option value="RAZORPAY">Razorpay</option>
              <option value="PHONEPE">PhonePe</option>
              <option value="COD">Cash on Delivery</option>
            </select>

            {/* Status filter */}
            <select
              className="select"
              value={currentStatus}
              onChange={(e) => navigate({ status: e.target.value || undefined })}
            >
              <option value="">All Statuses</option>
              <option value="PAYMENT_CONFIRMED">Confirmed</option>
              <option value="PENDING_PAYMENT">Pending</option>
              <option value="DELIVERED">Delivered</option>
              <option value="REFUND_INITIATED">Refund Initiated</option>
              <option value="REFUNDED">Refunded</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            {(currentGateway || currentStatus || searchParams.get('search')) && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setSearchValue('');
                  router.push('/payments');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {payments.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>💳</div>
            <div style={{ fontWeight: 500 }}>No transactions found</div>
            <div style={{ fontSize: '0.875rem', marginTop: '4px' }}>Payments will appear here once customers start placing orders</div>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Gateway</th>
                  <th>Payment ID</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.orderId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPayment(p)}
                  >
                    <td>
                      <code style={{ fontSize: '0.8125rem', background: 'var(--bg)', padding: '2px 6px', borderRadius: '4px' }}>
                        {p.orderNumber}
                      </code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{p.customerName || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.customerPhone}</div>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{fmt(p.amount)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <div
                          style={{ width: '8px', height: '8px', borderRadius: '50%', background: getGatewayColor(p.gateway), flexShrink: 0 }}
                        />
                        <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{getGatewayLabel(p.gateway)}</span>
                      </div>
                    </td>
                    <td>
                      {p.gatewayPaymentId ? (
                        <code style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {p.gatewayPaymentId.length > 18
                            ? `${p.gatewayPaymentId.slice(0, 18)}…`
                            : p.gatewayPaymentId}
                        </code>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={getStatusBadge(p.status)}>{getPaymentStatusLabel(p.status)}</span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {new Date(p.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        onClick={(e) => { e.stopPropagation(); setSelectedPayment(p); }}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border)', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Page {page} of {totalPages} ({total} total)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              {page > 1 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const sp = new URLSearchParams(searchParams.toString());
                    sp.set('page', String(page - 1));
                    router.push(`/payments?${sp.toString()}`);
                  }}
                >
                  ← Prev
                </button>
              )}
              {page < totalPages && (
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    const sp = new URLSearchParams(searchParams.toString());
                    sp.set('page', String(page + 1));
                    router.push(`/payments?${sp.toString()}`);
                  }}
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedPayment && (
        <PaymentDrawer payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
      )}
    </div>
  );
}
