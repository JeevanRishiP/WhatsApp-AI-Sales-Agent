import { getSession } from '../../lib/auth';
import { DashboardShell } from '../../components/DashboardShell';
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
  let staffList: any[] = [];
  let aiAgentEnabled = true;

  try {
    const [lowStockResult, handoffResult, pendingPaymentsResult, staffUsers, tenant] = await Promise.all([
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
      prisma.staffUser.findMany({
        where: { tenantId: session.tenantId, status: 'ACTIVE' },
        select: {
          id: true,
          fullName: true,
          role: true,
          avatarUrl: true,
          email: true,
        },
        orderBy: { role: 'asc' },
      }),
      prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { aiConfig: true },
      }),
    ]);

    lowStockCount = Number(lowStockResult[0]?.count || 0);
    handoffCount = handoffResult;
    pendingPaymentsCount = pendingPaymentsResult;
    staffList = staffUsers;
    aiAgentEnabled = ((tenant?.aiConfig as any)?.aiAgentEnabled) !== false;
  } catch (e) {
    // Graceful fallback if database query times out or fails
  }

  return (
    <DashboardShell
      tenantName={session.tenantName}
      currentRole={session.role}
      staffName={session.staffName || 'Owner'}
      staffId={session.staffId}
      staffList={staffList}
      lowStockCount={lowStockCount}
      handoffCount={handoffCount}
      pendingPaymentsCount={pendingPaymentsCount}
      aiAgentEnabled={aiAgentEnabled}
    >
      {children}
    </DashboardShell>
  );
}
