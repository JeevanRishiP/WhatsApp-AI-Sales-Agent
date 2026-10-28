import { getSession } from '../../../lib/auth';
import {
  getRevenueByDay,
  getOrdersByStatus,
  getTopProducts,
  getDashboardStats,
  getPriorPeriodStats,
} from '../../../lib/dal';
import { AnalyticsClient } from './AnalyticsClient';

export default async function AnalyticsPage() {
  const session = await getSession();

  const [revenueHistory, ordersByStatus, topProducts, stats, priorPeriod] = await Promise.all([
    getRevenueByDay(session.tenantId, 30),
    getOrdersByStatus(session.tenantId),
    getTopProducts(session.tenantId, 5),
    getDashboardStats(session.tenantId),
    getPriorPeriodStats(session.tenantId, 30),
  ]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales Analytics & Insights</h1>
          <p className="page-subtitle">
            Track business growth, daily revenue velocity, fulfillment health, and best-performing catalog items.
          </p>
        </div>
      </div>

      <AnalyticsClient
        revenueHistory={revenueHistory}
        ordersByStatus={ordersByStatus}
        topProducts={topProducts}
        totalCustomers={stats.totalCustomers}
        prevRevenue={priorPeriod.revenue}
        prevOrders={priorPeriod.orders}
      />
    </div>
  );
}
