import Link from 'next/link';
import { getSession } from '../../lib/auth';
import {
  getDashboardStats,
  getRecentOrders,
  getLowStockProducts,
} from '../../lib/dal';

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
      return 'badge';
  }
}

export default async function DashboardPage() {
  const session = await getSession();

  const [stats, recentOrders, lowStockProducts] = await Promise.all([
    getDashboardStats(session.tenantId),
    getRecentOrders(session.tenantId, 8),
    getLowStockProducts(session.tenantId, 6),
  ]);

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Overview</h1>
          <p className="page-subtitle">
            Welcome back, {session.tenantName}. Real-time sales and inventory metrics.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/inventory" className="btn btn-secondary">
            📦 Manage Inventory
          </Link>
          <Link href="/conversations" className="btn btn-primary">
            💬 WhatsApp Inbox
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-label">Today's Revenue</div>
          <div className="kpi-value">{formatCurrency(stats.todayRevenue)}</div>
          <div className="kpi-subtext">
            {stats.todayOrders} order{stats.todayOrders === 1 ? '' : 's'} placed today
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value">{formatCurrency(stats.totalRevenue)}</div>
          <div className="kpi-subtext">
            Across {stats.totalOrders} total confirmed orders
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Pending Orders</div>
          <div className="kpi-value" style={{ color: stats.pendingOrders > 0 ? 'var(--warning)' : 'inherit' }}>
            {stats.pendingOrders}
          </div>
          <div className="kpi-subtext">
            {stats.pendingOrders > 0 ? 'Requires attention / fulfillment' : 'All clear'}
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Active Catalog</div>
          <div className="kpi-value">{stats.activeProducts}</div>
          <div className="kpi-subtext">
            {stats.lowStockProducts > 0 ? (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                ⚠️ {stats.lowStockProducts} item(s) low on stock
              </span>
            ) : (
              'Stock levels healthy'
            )}
          </div>
        </div>
      </div>

      {/* Low Stock Warning Banner (if any) */}
      {lowStockProducts.length > 0 && (
        <div
          className="card"
          style={{
            borderColor: 'var(--warning)',
            background: 'rgba(251, 188, 4, 0.04)',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem' }}>⚠️</span>
              <span style={{ fontWeight: 600, color: 'var(--warning)' }}>
                Low Stock Alert — Immediate Restock Recommended
              </span>
            </div>
            <Link href="/inventory" className="btn btn-secondary btn-sm">
              View All Inventory
            </Link>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU / Code</th>
                  <th>Category</th>
                  <th>Current Stock</th>
                  <th>Threshold</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.name}</td>
                    <td>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {p.code}
                      </code>
                    </td>
                    <td>{p.category || 'General'}</td>
                    <td>
                      <span className="badge badge-danger">
                        {p.stock} remaining
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      Min {p.lowStockThreshold}
                    </td>
                    <td>
                      <Link href={`/inventory?search=${encodeURIComponent(p.code)}`} className="btn btn-secondary btn-sm">
                        Adjust Stock
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
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Recent Customer Orders</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Latest transactions originating from WhatsApp automated sales agent
            </p>
          </div>
          <Link href="/orders" className="btn btn-secondary btn-sm">
            View All Orders →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '8px' }}>No orders yet</p>
            <p style={{ fontSize: '0.875rem' }}>
              When customers converse with your WhatsApp agent and purchase, orders appear here in real-time.
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
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {order.orderNumber}
                      </code>
                    </td>
                    <td>{order.customerName || 'Anonymous'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {order.customerPhone}
                    </td>
                    <td>{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</td>
                    <td style={{ fontWeight: 600 }}>
                      {formatCurrency(Number(order.total))}
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(order.status)}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <Link href={`/orders?search=${order.orderNumber}`} className="btn btn-secondary btn-sm">
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
