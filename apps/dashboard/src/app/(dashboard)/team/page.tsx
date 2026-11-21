import { getSession } from '../../../lib/auth';
import { listTeamMembers } from '../../../lib/dal/team';
import { TeamClient } from './TeamClient';
import { redirect } from 'next/navigation';

export default async function TeamPage() {
  const session = await getSession();

  // Only Owner can manage team
  if (session.role !== 'OWNER') {
    redirect('/');
  }

  const team = await listTeamMembers(session.tenantId);
  const canSimulateRoles =
    process.env.NODE_ENV === 'development' && process.env.ENABLE_DEMO_LOGIN === 'true';

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👥</span> Staff &amp; Team Management (RBAC)
          </h1>
          <p className="page-subtitle">
            Manage your boutique team, assign role permissions, monitor activity, and prevent unauthorized actions.
          </p>
        </div>
      </div>

      <TeamClient
        team={team.map((member) => ({
          id: member.id,
          fullName: member.fullName,
          email: member.email,
          phone: member.phone,
          role: member.role,
          status: member.status,
          avatarUrl: member.avatarUrl,
          _count: member._count,
          createdAt: member.createdAt.toISOString(),
          lastLoginAt: member.lastLoginAt ? member.lastLoginAt.toISOString() : null,
          lastActiveAt: member.lastActiveAt ? member.lastActiveAt.toISOString() : null,
        }))}
        currentStaffId={session.staffId}
        canSimulateRoles={canSimulateRoles}
      />
    </div>
  );
}

