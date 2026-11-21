import Link from 'next/link';
import { getSession } from '../../lib/auth';
import { formatDateTime } from '@/lib/format';
import {
  getDashboardStats,
  getRecentOrders,
  getLowStockProducts,
} from '../../lib/dal';
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  Package,
  MessageSquare,
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  PhoneCall,
  User,
} from 'lucide-react';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'DELIVERED':
    case 'PAYMENT_CONFIRMED':
      return 'badge badge-success';
    case 'SHIPPED':
      return 'badge badge-info';
    case 'PROCESSING':
    case 'PENDING_PAYMENT':
      return 'badge badge-warning';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'badge badge-danger';
    default:
      return 'badge badge-neutral';
  }
}

export default async function DashboardPage() {
  const session = await getSession();

  const [stats, recentOrders, lowStockProducts] = await Promise.all([
    getDashboardStats(session.tenantId),
    getRecentOrders(session.tenantId, 8),
    getLowStockProducts(session.tenantId, 6),
  ]);

  const currentDateFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              suppressHydrationWarning
            >
              {currentDateFormatted}
            </span>
          </div>
          <h1 className="page-title">Business Overview</h1>
          <p className="page-subtitle">
            Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{session.tenantName}</strong>. Real-time autonomous commerce analytics.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href="/inventory" className="btn btn-secondary">
            <Package size={15} />
            <span>Manage Inventory</span>
          </Link>
          <Link href="/conversations" className="btn btn-primary">
            <MessageSquare size={15} />
            <span>WhatsApp Inbox</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        {/* Today's Revenue */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Today's Revenue</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818CF8', borderColor: 'rgba(99, 102, 241, 0.25)' }}>
              <TrendingUp size={17} />
            </div>
          </div>
          <div className="kpi-value">{formatCurrency(stats.todayRevenue)}</div>
          <div className="kpi-subtext">
            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              {stats.todayOrders} order{stats.todayOrders === 1 ? '' : 's'} today
            </span>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Volume</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
              <ShoppingBag size={17} />
            </div>
          </div>
          <div className="kpi-value">{formatCurrency(stats.totalRevenue)}</div>
          <div className="kpi-subtext">
            <span>Across {stats.totalOrders} lifetime orders</span>
          </div>
        </div>

        {/* Pending Fulfillment */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Pending Orders</span>
            <div
              className="kpi-icon-wrapper"
              style={{
                background: stats.pendingOrders > 0 ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-surface)',
                color: stats.pendingOrders > 0 ? '#FBBF24' : 'var(--text-muted)',
                borderColor: stats.pendingOrders > 0 ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)',
              }}
            >
              <Clock size={17} />
            </div>
          </div>
          <div
            className="kpi-value"
            style={{ color: stats.pendingOrders > 0 ? '#FBBF24' : 'var(--text-primary)' }}
          >
            {stats.pendingOrders}
          </div>
          <div className="kpi-subtext">
            {stats.pendingOrders > 0 ? (
              <span style={{ color: '#FBBF24', fontWeight: 600 }}>Action required</span>
            ) : (
              <span style={{ color: 'var(--success)' }}>Fulfillment caught up</span>
            )}
          </div>
        </div>

        {/* Active Catalog */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Active Catalog</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8', borderColor: 'rgba(56, 189, 248, 0.25)' }}>
              <Package size={17} />
            </div>
          </div>
          <div className="kpi-value">{stats.activeProducts}</div>
          <div className="kpi-subtext">
            {stats.lowStockProducts > 0 ? (
              <span style={{ color: 'var(--danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={12} />
                <span>{stats.lowStockProducts} item(s) low on stock</span>
              </span>
            ) : (
              <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={12} />
                <span>Stock levels healthy</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock Warning Callout */}
      {lowStockProducts.length > 0 && (
        <div
          className="card"
          style={{
            borderColor: 'rgba(245, 158, 11, 0.3)',
            background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.06) 0%, rgba(15, 18, 28, 0.6) 100%)',
            marginBottom: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FBBF24',
                }}
              >
                <AlertTriangle size={16} />
              </div>
              <div>
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#FBBF24' }}>
                  Low Stock Alert — Immediate Restock Advised
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  WhatsApp AI will stop offering products once stock reaches zero.
                </p>
              </div>
            </div>

            <Link href="/inventory" className="btn btn-secondary btn-sm">
              <span>View All Inventory</span>
              <ChevronRight size={13} />
            </Link>
          </div>

          <div className="table-container" style={{ border: 'none', background: 'transparent' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU / Code</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</td>
                    <td>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '2px 6px', background: 'var(--bg-tertiary)', borderRadius: '4px', border: '1px solid var(--border)' }}>
                        {p.code}
                      </code>
                    </td>
                    <td>
                      <span className="badge badge-neutral">{p.category || 'General'}</span>
                    </td>
                    <td>
                      <span className="badge badge-danger">
                        {p.stock} remaining
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      Min {p.lowStockThreshold}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/inventory?search=${encodeURIComponent(p.code)}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Adjust
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Orders Section */}
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <ShoppingBag size={18} style={{ color: 'var(--accent)' }} />
              <span>Recent Customer Orders</span>
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
              Real-time orders processed by autonomous WhatsApp Sales Agent
            </p>
          </div>

          <Link href="/orders" className="btn btn-secondary btn-sm">
            <span>View All Orders</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="table-empty">
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                marginBottom: '12px',
              }}
            >
              <ShoppingBag size={22} />
            </div>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              No orders yet
            </p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
              When buyers converse with your WhatsApp AI number and confirm purchases, live orders will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Items</th>
                  <th>Total Amount</th>
                  <th>Fulfillment Status</th>
                  <th>Order Placed</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const initial = (order.customerName || 'Customer').charAt(0).toUpperCase();

                  return (
                    <tr key={order.id}>
                      <td>
                        <code
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {order.orderNumber}
                        </code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'var(--bg-tertiary)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {initial}
                          </div>
                          <span style={{ fontWeight: 500 }}>{order.customerName || 'Anonymous Customer'}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {order.customerPhone}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {order.itemCount} item{order.itemCount === 1 ? '' : 's'}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatCurrency(Number(order.total))}
                      </td>
                      <td>
                        <span className={getStatusBadgeClass(order.status)}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td
                        style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
                        suppressHydrationWarning
                      >
                        {formatDateTime(order.createdAt)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link
                          href={`/orders?search=${order.orderNumber}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
