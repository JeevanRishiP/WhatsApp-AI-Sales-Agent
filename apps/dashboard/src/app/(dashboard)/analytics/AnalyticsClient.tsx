'use client';

import { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  Award,
  Activity,
  Package,
  BarChart3,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';

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
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: isUp ? '#34D399' : '#F87171',
        marginLeft: '8px',
        background: isUp ? 'var(--success-bg)' : 'var(--danger-bg)',
        border: `1px solid ${isUp ? 'var(--success-border)' : 'var(--danger-border)'}`,
        padding: '2px 7px',
        borderRadius: 'var(--radius-full)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
      }}
    >
      {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      <span>{Math.abs(pct)}%</span>
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

  // Split last 30 days into 4 weekly cohorts
  const weeks = Array.from({ length: 4 }, (_, i) => {
    const weekData = revenueHistory.slice(i * 7, (i + 1) * 7);
    return {
      label: `Week ${i + 1}`,
      revenue: weekData.reduce((s, d) => s + d.revenue, 0),
      orders: weekData.reduce((s, d) => s + d.orderCount, 0),
    };
  });

  const prevAov = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;
  const activeHoverPoint = revenueHistory.find((r) => r.date === hoveredBar);

  return (
    <div>
      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">30-Day Revenue</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818CF8', borderColor: 'rgba(99, 102, 241, 0.25)' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="kpi-value">₹{totalPeriodRevenue.toLocaleString('en-IN')}</span>
            <Delta current={totalPeriodRevenue} previous={prevRevenue} />
          </div>
          <div className="kpi-subtext">
            <span>{totalPeriodOrders} completed orders</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Average Order Value (AOV)</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#34D399', borderColor: 'rgba(16, 185, 129, 0.25)' }}>
              <Activity size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="kpi-value">₹{aov.toLocaleString('en-IN')}</span>
            <Delta current={aov} previous={prevAov} />
          </div>
          <div className="kpi-subtext">Avg cart ticket size</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Unique Shoppers</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8', borderColor: 'rgba(56, 189, 248, 0.25)' }}>
              <Users size={16} />
            </div>
          </div>
          <div className="kpi-value">{totalCustomers}</div>
          <div className="kpi-subtext">Catalog engaged contacts</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Top Selling Item</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#FBBF24', borderColor: 'rgba(245, 158, 11, 0.25)' }}>
              <Award size={16} />
            </div>
          </div>
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
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <BarChart3 size={18} style={{ color: 'var(--accent)' }} />
              <span>Daily Sales Trend (Last 30 Days)</span>
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Gross volume generated from WhatsApp AI conversational orders
            </p>
          </div>

          {activeHoverPoint ? (
            <div
              style={{
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 12px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#818CF8',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Calendar size={13} />
              <span>
                {activeHoverPoint.date}: ₹{activeHoverPoint.revenue.toLocaleString('en-IN')} ({activeHoverPoint.orderCount} order{activeHoverPoint.orderCount === 1 ? '' : 's'})
              </span>
            </div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Hover over a bar to inspect specific day
            </div>
          )}
        </div>

        {revenueHistory.length === 0 ? (
          <div className="table-empty">
            <BarChart3 size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No sales recorded during this 30-day window</p>
          </div>
        ) : (
          <div>
            {/* Interactive Bar Chart Visualization */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: '8px',
                height: '210px',
                paddingTop: '20px',
                paddingBottom: '20px',
                borderBottom: '1px solid var(--border)',
                overflowX: 'auto',
              }}
            >
              {revenueHistory.map((point) => {
                const heightPercent = Math.max(5, Math.round((point.revenue / maxDailyRevenue) * 100));
                const isHovered = hoveredBar === point.date;
                return (
                  <div
                    key={point.date}
                    style={{
                      flex: '1 0 26px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end',
                    }}
                    onMouseEnter={() => setHoveredBar(point.date)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPercent}%`,
                        background: isHovered
                          ? 'var(--accent)'
                          : point.revenue > 0
                          ? 'rgba(99, 102, 241, 0.7)'
                          : 'var(--bg-tertiary)',
                        borderRadius: '4px 4px 0 0',
                        transition: 'all 0.15s ease',
                        transform: isHovered ? 'scaleY(1.05)' : 'none',
                        cursor: 'pointer',
                        boxShadow: isHovered ? '0 0 12px var(--accent-glow)' : 'none',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.625rem',
                        color: isHovered ? 'var(--text-primary)' : 'var(--text-muted)',
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

            {/* 4-Week Cohort Breakdown */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                paddingTop: '18px',
              }}
            >
              {weeks.map((w) => (
                <div
                  key={w.label}
                  style={{
                    padding: '12px 14px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    {w.label}
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '3px', color: 'var(--text-primary)' }}>
                    ₹{w.revenue.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px' }}>
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
              <h2 className="card-title">
                <Award size={17} style={{ color: '#FBBF24' }} />
                <span>Top Performing Products</span>
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Ranked by units sold in WhatsApp conversations
              </p>
            </div>
          </div>

          {topProducts.length === 0 ? (
            <div className="table-empty">
              <Package size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No item sales data yet.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Units Sold</th>
                    <th style={{ textAlign: 'right' }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, idx) => (
                    <tr key={p.productId}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: idx === 0 ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-tertiary)',
                              color: idx === 0 ? '#FBBF24' : 'var(--text-muted)',
                              border: `1px solid ${idx === 0 ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)'}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.6875rem',
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.productName}</div>
                            <code style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                              {p.productCode}
                            </code>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{p.totalQuantity}</td>
                      <td style={{ fontWeight: 700, textAlign: 'right', color: 'var(--text-primary)' }}>
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
              <h2 className="card-title">
                <Activity size={17} style={{ color: 'var(--success)' }} />
                <span>Fulfillment Health</span>
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Order status distribution across lifetime orders
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
            {ordersByStatus.map((s) => {
              const pct = totalAllOrders > 0 ? Math.round((s.count / totalAllOrders) * 100) : 0;
              return (
                <div key={s.status}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.status.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {s.count} orders ({pct}%)
                    </span>
                  </div>
                  <div
                    style={{
                      height: '7px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden',
                      border: '1px solid var(--border)',
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
                        borderRadius: 'var(--radius-full)',
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
