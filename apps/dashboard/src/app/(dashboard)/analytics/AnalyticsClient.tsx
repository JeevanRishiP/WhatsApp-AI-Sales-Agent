'use client';

import { useState } from 'react';

interface RevenuePoint {
  date: string;
  revenue: number;
  orderCount: number;
}

interface StatusCount {
  status: string;
  count: number;
}

interface TopProductItem {
  productId: string;
  productName: string;
  productCode: string;
  totalQuantity: number;
  totalRevenue: number;
}

interface AnalyticsClientProps {
  revenueHistory: RevenuePoint[];
  ordersByStatus: StatusCount[];
  topProducts: TopProductItem[];
  totalCustomers: number;
  prevRevenue?: number;
  prevOrders?: number;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const isUp = pct >= 0;
  return (
    <span
      style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        color: isUp ? 'var(--success)' : 'var(--danger)',
        marginLeft: '8px',
        background: isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
        padding: '2px 6px',
        borderRadius: '4px',
      }}
    >
      {isUp ? '▲' : '▼'} {Math.abs(pct)}% vs prev
    </span>
  );
}

export function AnalyticsClient({
  revenueHistory,
  ordersByStatus,
  topProducts,
  totalCustomers,
  prevRevenue = 0,
  prevOrders = 0,
}: AnalyticsClientProps) {
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);

  const totalPeriodRevenue = revenueHistory.reduce((acc, curr) => acc + curr.revenue, 0);
  const totalPeriodOrders = revenueHistory.reduce((acc, curr) => acc + curr.orderCount, 0);
  const aov = totalPeriodOrders > 0 ? Math.round(totalPeriodRevenue / totalPeriodOrders) : 0;

  const maxDailyRevenue = Math.max(1, ...revenueHistory.map((r) => r.revenue));
  const totalAllOrders = ordersByStatus.reduce((acc, curr) => acc + curr.count, 0);

  // Split last 30 days into weeks for sparkline
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const weekData = revenueHistory.slice(i * 7, (i + 1) * 7);
    return {
      label: `W${i + 1}`,
      revenue: weekData.reduce((s, d) => s + d.revenue, 0),
      orders: weekData.reduce((s, d) => s + d.orderCount, 0),
    };
  });

  const prevAov = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;
  const activeHoverPoint = revenueHistory.find((r) => r.date === hoveredBar);

  return (
    <div>
      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>30-Day Revenue</span>
            <Delta current={totalPeriodRevenue} previous={prevRevenue} />
          </div>
          <div className="kpi-value">₹{totalPeriodRevenue.toLocaleString('en-IN')}</div>
          <div className="kpi-subtext">
            Across {totalPeriodOrders} completed orders
            {prevOrders > 0 && <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>(vs {prevOrders} prev)</span>}
          </div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Avg. Order Value (AOV)</span>
            <Delta current={aov} previous={prevAov} />
          </div>
          <div className="kpi-value">₹{aov.toLocaleString('en-IN')}</div>
          <div className="kpi-subtext">Average spend per transaction</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Unique Shoppers</div>
          <div className="kpi-value">{totalCustomers}</div>
          <div className="kpi-subtext">Registered in AI memory profile</div>
        </div>

        <div className="card kpi-card">
          <div className="kpi-label">Top Selling Item</div>
          <div className="kpi-value" style={{ fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {topProducts[0]?.productName || 'None yet'}
          </div>
          <div className="kpi-subtext">
            {topProducts[0] ? `${topProducts[0].totalQuantity} units sold` : 'Awaiting sales'}
          </div>
        </div>
      </div>

      {/* 30-Day Revenue Trend Chart */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Daily Sales Trend (Last 30 Days)</h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Gross revenue generated from confirmed and delivered WhatsApp transactions
            </p>
          </div>
          {activeHoverPoint ? (
            <div
              style={{
                background: 'rgba(37,99,235,0.08)',
                border: '1px solid rgba(37,99,235,0.2)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--accent)',
              }}
            >
              📅 {activeHoverPoint.date}: ₹{activeHoverPoint.revenue.toLocaleString('en-IN')} ({activeHoverPoint.orderCount} order{activeHoverPoint.orderCount === 1 ? '' : 's'})
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Hover over a bar to inspect day</div>
          )}
        </div>

        {revenueHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            No sales recorded during this 30-day period.
          </div>
        ) : (
          <div>
            {/* Sleek SVG / flex bar chart visualization */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
                height: '200px',
                paddingTop: '20px',
                paddingBottom: '20px',
                borderBottom: '1px solid var(--border)',
                overflowX: 'auto',
              }}
            >
              {revenueHistory.map((point) => {
                const heightPercent = Math.max(4, Math.round((point.revenue / maxDailyRevenue) * 100));
                const isHovered = hoveredBar === point.date;
                return (
                  <div
                    key={point.date}
                    style={{
                      flex: '1 0 28px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                    onMouseEnter={() => setHoveredBar(point.date)}
                    onMouseLeave={() => setHoveredBar(null)}
                    title={`${point.date}: ₹${point.revenue.toLocaleString('en-IN')} (${point.orderCount} orders)`}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPercent}%`,
                        background: isHovered
                          ? 'var(--accent)'
                          : point.revenue > 0
                          ? 'rgba(37,99,235,0.75)'
                          : 'var(--border)',
                        borderRadius: '4px 4px 0 0',
                        transition: 'all 0.15s ease',
                        transform: isHovered ? 'scaleY(1.04)' : 'none',
                        cursor: 'pointer',
                        boxShadow: isHovered ? '0 0 8px rgba(37,99,235,0.4)' : 'none',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.65rem',
                        color: isHovered ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: isHovered ? 700 : 400,
                        marginTop: '6px',
                        transform: 'rotate(-45deg)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {point.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 4-Week Pacing Breakdown */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px',
                paddingTop: '16px',
              }}
            >
              {weeks.map((w) => (
                <div
                  key={w.label}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--surface-hover)',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {w.label} Pacing
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '2px' }}>
                    ₹{w.revenue.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {w.orders} order{w.orders === 1 ? '' : 's'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Two Columns: Orders Pipeline Breakdown & Top Products */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        {/* Top Selling Products */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Top Performing Products</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Best-sellers ranked by customer purchase volume
              </p>
            </div>
          </div>

          {topProducts.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No item sales data yet.
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Units Sold</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, idx) => (
                    <tr key={p.productId}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem' }}>
                            #{idx + 1}
                          </span>
                          <div>
                            <div style={{ fontWeight: 500 }}>{p.productName}</div>
                            <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {p.productCode}
                            </code>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{p.totalQuantity}</td>
                      <td style={{ fontWeight: 600 }}>
                        ₹{p.totalRevenue.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order Status Distribution */}
        <div className="card">
          <div className="card-header">
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Fulfillment Health</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Order status distribution across all lifetime orders
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
            {ordersByStatus.map((s) => {
              const pct = totalAllOrders > 0 ? Math.round((s.count / totalAllOrders) * 100) : 0;
              return (
                <div key={s.status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 500 }}>{s.status.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {s.count} orders ({pct}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: '8px',
                      background: 'var(--border)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        background:
                          s.status === 'DELIVERED' || s.status === 'PAYMENT_CONFIRMED'
                            ? 'var(--success)'
                            : s.status === 'SHIPPED'
                            ? 'var(--info)'
                            : s.status === 'CANCELLED' || s.status === 'REFUNDED'
                            ? 'var(--danger)'
                            : 'var(--warning)',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
