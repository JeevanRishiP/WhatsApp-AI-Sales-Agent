import { Suspense } from 'react';
import { getSession } from '../../../lib/auth';
import { listAuditLogs } from '../../../lib/dal/audit';
import { listTeamMembers } from '../../../lib/dal/team';
import { AuditClient } from './AuditClient';
import { redirect } from 'next/navigation';

interface AuditPageProps {
  searchParams: {
    page?: string;
    entityType?: any;
    action?: any;
    staffId?: string;
    search?: string;
  };
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const session = await getSession();

  // Accessible to Owner and Store Manager
  if (session.role !== 'OWNER' && session.role !== 'STORE_MANAGER') {
    redirect('/');
  }

  const page = Math.max(1, parseInt(searchParams.page || '1', 10));
  const entityType = searchParams.entityType;
  const action = searchParams.action;
  const staffId = searchParams.staffId;
  const search = searchParams.search;

  const [logsResult, team] = await Promise.all([
    listAuditLogs(session.tenantId, {
      page,
      limit: 25,
      entityType,
      action,
      staffId,
      search,
    }),
    listTeamMembers(session.tenantId),
  ]);

  return (
    <div className="page-container">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛡️</span> Tamper-Proof Audit Ledger
          </h1>
          <p className="page-subtitle">
            Immutable append-only revision history of all staff modifications. Tracks before/after state diffs, staff identity, and mandatory justifications.
          </p>
        </div>
      </div>

      <Suspense fallback={<div className="card" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading audit records...</div>}>
        <AuditClient
          logs={logsResult.items.map((log) => ({
            ...log,
            timestamp: log.timestamp.toISOString(),
          }))}
          team={team.map((m) => ({ id: m.id, fullName: m.fullName, role: m.role }))}
          pagination={logsResult.pagination}
          filters={{
            entityType: entityType || '',
            action: action || '',
            staffId: staffId || '',
            search: search || '',
          }}
        />
      </Suspense>
    </div>
  );
}

