import { getSession } from '../../lib/auth';
import { Sidebar } from '../../components/Sidebar';
import { prisma } from '@wcos/db';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Fetch badge indicators for sidebar (low stock count and human handoff count)
  let lowStockCount = 0;
  let handoffCount = 0;
  let pendingPaymentsCount = 0;

  try {
    const [lowStockResult, handoffResult, pendingPaymentsResult] = await Promise.all([
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Product"
        WHERE "tenantId" = ${session.tenantId}::uuid
          AND "status" = 'ACTIVE'
          AND "stock" <= "lowStockThreshold"
      `,
      prisma.conversation.count({
        where: {
          tenantId: session.tenantId,
          stage: 'HUMAN_HANDOFF',
        },
      }),
      prisma.order.count({
        where: {
          tenantId: session.tenantId,
          status: 'PENDING_PAYMENT',
        },
      }),
    ]);

    lowStockCount = Number(lowStockResult[0]?.count || 0);
    handoffCount = handoffResult;
    pendingPaymentsCount = pendingPaymentsResult;
  } catch (e) {
    // Graceful fallback if database query times out or fails
  }

  return (
    <div className="app-layout">
      <Sidebar
        tenantName={session.tenantName}
        lowStockCount={lowStockCount}
        handoffCount={handoffCount}
        pendingPaymentsCount={pendingPaymentsCount}
      />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
