'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CreditCard,
  Smartphone,
  Banknote,
  Search,
  Filter,
  X,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Receipt,
  Layers,
} from 'lucide-react';
import { formatDateTime, formatDateShort } from '@/lib/format';

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
  return formatDateTime(d);
}

function getGatewayLabel(gateway: string) {
  switch (gateway) {
    case 'RAZORPAY': return 'Razorpay';
    case 'PHONEPE': return 'PhonePe';
    case 'COD': return 'Cash on Delivery';
    default: return 'Online';
  }
}

function getGatewayColor(gateway: string) {
  switch (gateway) {
    case 'RAZORPAY': return '#6366F1';
    case 'PHONEPE': return '#8B5CF6';
    case 'COD': return '#10B981';
    default: return '#64748B';
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
      return 'badge badge-neutral';
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
    default: return status.replace(/_/g, ' ');
  }
}

// ─── Stacked Bar Chart ────────────────────────────────────────

function StackedBarChart({ data }: { data: GatewayDailyRevenue[] }) {
  if (data.length === 0) {
    return (
      <div className="table-empty">
        <Receipt size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
        <p style={{ fontSize: '0.8125rem' }}>No payment volume recorded for the last 30 days</p>
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
        height: '170px',
        paddingBottom: '24px',
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
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: `${totalH}%` }}>
              {razH > 0 && <div style={{ height: `${razH}%`, background: '#6366F1', borderRadius: '2px 2px 0 0' }} />}
              {phH > 0 && <div style={{ height: `${phH}%`, background: '#8B5CF6' }} />}
              {codH > 0 && <div style={{ height: `${codH}%`, background: '#10B981', borderRadius: razH === 0 && phH === 0 ? '2px 2px 0 0' : '0' }} />}
            </div>
            <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '5px', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gateway Distribution ────────────────────────────────

function GatewayDistribution({ summary }: { summary: PaymentSummary }) {
  const total = summary.totalCollected;
  const segments = [
    { label: 'Razorpay', value: summary.razorpayVolume, color: '#6366F1', icon: CreditCard },
    { label: 'PhonePe', value: summary.phonepeVolume, color: '#8B5CF6', icon: Smartphone },
    { label: 'COD', value: summary.codVolume, color: '#10B981', icon: Banknote },
  ].filter((s) => s.value > 0);

  if (total === 0 || segments.length === 0) {
    return (
      <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
        No confirmed transactions yet
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
      {segments.map((seg) => {
        const pct = Math.round((seg.value / total) * 100);
        const gwData = summary.countByGateway.find((g) => g.gateway === seg.label.toUpperCase());
        const Icon = seg.icon;

        return (
          <div key={seg.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Icon size={14} style={{ color: seg.color }} />
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{seg.label}</span>
                {gwData && (
                  <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                    ({gwData.count} txns)
                  </span>
                )}
              </div>
              <div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{fmt(seg.value)}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px' }}>{pct}%</span>
              </div>
            </div>
            <div style={{ height: '7px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: seg.color, borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '460px',
          maxWidth: '100vw',
          borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          margin: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Payment Record
            </span>
            <div style={{ fontSize: '1.375rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
              {fmt(payment.amount)}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Order {payment.orderNumber}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm"
              style={{ padding: '6px' }}
            >
              <X size={18} />
            </button>
            <span className={getStatusBadge(payment.status)}>{getPaymentStatusLabel(payment.status)}</span>
          </div>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {/* Gateway Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: `${getGatewayColor(payment.gateway)}22`,
                border: `1px solid ${getGatewayColor(payment.gateway)}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: getGatewayColor(payment.gateway),
              }}
            >
              {payment.gateway === 'RAZORPAY' ? <CreditCard size={18} /> : payment.gateway === 'PHONEPE' ? <Smartphone size={18} /> : <Banknote size={18} />}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                {getGatewayLabel(payment.gateway)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {payment.paymentMethod?.replace(/_/g, ' ') || 'Online Payment'}
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Customer Details
            </div>
            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <InfoRow label="Name" value={payment.customerName || 'Anonymous'} />
              <InfoRow label="Phone" value={payment.customerPhone} />
            </div>
          </div>

          {/* Gateway Reference */}
          {(payment.gatewayOrderId || payment.gatewayPaymentId) && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px', textTransform: 'uppercase' }}>
                Gateway Identifiers
              </div>
              <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {payment.gatewayOrderId && (
                  <InfoRow label="Gateway Order ID" value={payment.gatewayOrderId} mono />
                )}
                {payment.gatewayPaymentId && (
                  <InfoRow label="Gateway Payment ID" value={payment.gatewayPaymentId} mono />
                )}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: '8px', textTransform: 'uppercase' }}>
              Timestamps
            </div>
            <div style={{ background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <InfoRow label="Authorized" value={fmtDate(payment.createdAt)} />
              <InfoRow label="Last Updated" value={fmtDate(payment.updatedAt)} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-footer" style={{ flexDirection: 'column', gap: '8px' }}>
          <a
            href={`/orders?search=${payment.orderNumber}`}
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <span>View Full Order Details</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', fontSize: '0.8125rem' }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', fontFamily: mono ? 'var(--font-mono)' : 'inherit', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
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
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Collected</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
              <CreditCard size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: 'var(--success)' }}>{fmt(summary.totalCollected)}</div>
          <div className="kpi-subtext">Settled & confirmed revenue</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Pending Payments</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#FBBF24', borderColor: 'rgba(245, 158, 11, 0.25)' }}>
              <Clock size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: summary.totalPending > 0 ? '#FBBF24' : 'var(--text-primary)' }}>
            {fmt(summary.totalPending)}
          </div>
          <div className="kpi-subtext">Awaiting buyer payment</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Refunded Volume</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#F87171', borderColor: 'rgba(239, 68, 68, 0.25)' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div className="kpi-value">{fmt(summary.totalRefunded)}</div>
          <div className="kpi-subtext">Initiated or settled refunds</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Success Rate</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818CF8', borderColor: 'rgba(99, 102, 241, 0.25)' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: summary.successRate >= 80 ? 'var(--success)' : 'var(--text-primary)' }}>
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
              <h2 className="card-title">
                <Layers size={17} style={{ color: 'var(--accent)' }} />
                <span>Daily Volume by Gateway</span>
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Last 30 days — <span style={{ color: '#6366F1', fontWeight: 600 }}>Razorpay</span> • <span style={{ color: '#8B5CF6', fontWeight: 600 }}>PhonePe</span> • <span style={{ color: '#10B981', fontWeight: 600 }}>COD</span>
              </p>
            </div>
          </div>
          <StackedBarChart data={revenueByDay} />
        </div>

        {/* Gateway Distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <CreditCard size={17} style={{ color: '#8B5CF6' }} />
                <span>Payment Channels</span>
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Gross volume distribution</p>
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
            <h2 className="card-title">
              <Receipt size={17} style={{ color: 'var(--accent)' }} />
              <span>All Payment Transactions</span>
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{total} total records</p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-input-wrapper" style={{ width: '220px' }}>
              <span className="search-icon">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search order or ID..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate({ search: searchValue || undefined });
                }}
                className="search-input"
              />
            </div>

            <select
              className="form-select"
              style={{ width: '150px' }}
              value={currentGateway}
              onChange={(e) => navigate({ gateway: e.target.value || undefined })}
            >
              <option value="">All Gateways</option>
              <option value="RAZORPAY">Razorpay</option>
              <option value="PHONEPE">PhonePe</option>
              <option value="COD">Cash on Delivery</option>
            </select>

            <select
              className="form-select"
              style={{ width: '150px' }}
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
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSearchValue('');
                  router.push('/payments');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="table-empty">
            <CreditCard size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No transactions found</p>
            <p style={{ fontSize: '0.75rem', marginTop: '2px' }}>Payments will appear here once buyers place orders.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Gateway</th>
                  <th>Payment ID</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
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
                      <code style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {p.orderNumber}
                      </code>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{p.customerName || 'Anonymous'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.customerPhone}</div>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: '0.9375rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{fmt(p.amount)}</td>
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
                        <code style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
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
                    <td
                      style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
                      suppressHydrationWarning
                    >
                      {formatDateShort(p.createdAt)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => { e.stopPropagation(); setSelectedPayment(p); }}
                      >
                        Inspect
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
          <div className="table-footer">
            <span>
              Page {page} of {totalPages} ({total} total transactions)
            </span>
            <div className="pagination">
              {page > 1 && (
                <button
                  className="pagination-btn"
                  onClick={() => {
                    const sp = new URLSearchParams(searchParams.toString());
                    sp.set('page', String(page - 1));
                    router.push(`/payments?${sp.toString()}`);
                  }}
                >
                  Previous
                </button>
              )}
              {page < totalPages && (
                <button
                  className="pagination-btn"
                  onClick={() => {
                    const sp = new URLSearchParams(searchParams.toString());
                    sp.set('page', String(page + 1));
                    router.push(`/payments?${sp.toString()}`);
                  }}
                >
                  Next
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
