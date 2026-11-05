'use client';

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  ShieldCheck,
  Search,
  Filter,
  Clock,
  User,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  FileText,
  Code,
  ShieldAlert,
} from 'lucide-react';

interface AuditItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  staffId: string | null;
  staffName: string;
  staffRole: string;
  actorType: string;
  reason: string;
  beforeSnapshot: any;
  afterSnapshot: any;
  diffSummary: any;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
  staff?: {
    id: string;
    fullName: string;
    role: string;
    avatarUrl: string | null;
  } | null;
}

interface AuditClientProps {
  logs: AuditItem[];
  team: Array<{ id: string; fullName: string; role: string }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    entityType: string;
    action: string;
    staffId: string;
    search: string;
  };
}

const ACTION_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  STATUS_CHANGE: { label: 'Status Transition', color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.12)' },
  ADDRESS_UPDATE: { label: 'Address Modified', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)' },
  TRACKING_UPDATE: { label: 'Tracking Assigned', color: '#34D399', bg: 'rgba(52, 211, 153, 0.12)' },
  ORDER_CANCELLED: { label: 'Order Cancelled', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' },
  REFUND_INITIATED: { label: 'Refund Authorized', color: '#EC4899', bg: 'rgba(236, 72, 153, 0.12)' },
  CUSTOMER_UPDATE: { label: 'Customer Profile Edit', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.12)' },
  CUSTOMER_FLAGGED: { label: 'VIP / Risk Tagged', color: '#D4AF37', bg: 'rgba(212, 175, 55, 0.12)' },
  NOTE_ADDED: { label: 'Internal Note', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.12)' },
};

export function AuditClient({ logs, team, pagination, filters }: AuditClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const updateFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div>
      {/* Filter Toolbar */}
      <div
        className="card"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        {/* Search */}
        <div className="search-input-wrapper" style={{ flex: '1 1 240px', maxWidth: 'none' }}>
          <span className="search-icon">
            <Search size={15} />
          </span>
          <input
            type="text"
            placeholder="Search reasons, staff names..."
            defaultValue={filters.search}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateFilters('search', (e.target as HTMLInputElement).value);
              }
            }}
            className="search-input"
          />
        </div>

        {/* Staff Filter */}
        <div style={{ minWidth: '160px' }}>
          <select
            value={filters.staffId}
            onChange={(e) => updateFilters('staffId', e.target.value)}
            className="form-select"
          >
            <option value="">All Staff Members</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName} ({m.role})
              </option>
            ))}
          </select>
        </div>

        {/* Entity Filter */}
        <div style={{ minWidth: '140px' }}>
          <select
            value={filters.entityType}
            onChange={(e) => updateFilters('entityType', e.target.value)}
            className="form-select"
          >
            <option value="">All Entities</option>
            <option value="ORDER">Order</option>
            <option value="CUSTOMER">Customer</option>
            <option value="CUSTOMER_ADDRESS">Customer Address</option>
            <option value="PRODUCT">Product</option>
            <option value="POLICY">Policy</option>
          </select>
        </div>

        {/* Action Filter */}
        <div style={{ minWidth: '160px' }}>
          <select
            value={filters.action}
            onChange={(e) => updateFilters('action', e.target.value)}
            className="form-select"
          >
            <option value="">All Action Types</option>
            <option value="STATUS_CHANGE">Status Transition</option>
            <option value="ADDRESS_UPDATE">Address Modified</option>
            <option value="TRACKING_UPDATE">Tracking Assigned</option>
            <option value="ORDER_CANCELLED">Order Cancelled</option>
            <option value="REFUND_INITIATED">Refund Initiated</option>
            <option value="CUSTOMER_UPDATE">Customer Update</option>
            <option value="CUSTOMER_FLAGGED">Customer Flagged</option>
          </select>
        </div>

        {(filters.search || filters.staffId || filters.entityType || filters.action) && (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="btn btn-secondary btn-sm"
          >
            <RotateCcw size={12} />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Audit Stream List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {logs.length === 0 ? (
          <div className="card table-empty" style={{ padding: '56px 20px' }}>
            <ShieldCheck size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No audit events found</p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              All state transitions and order changes performed by staff appear here in real-time.
            </p>
          </div>
        ) : (
          logs.map((log) => {
            const actionStyle = ACTION_COLORS[log.action] || {
              label: log.action,
              color: 'var(--text-secondary)',
              bg: 'rgba(255, 255, 255, 0.05)',
            };
            const isExpanded = expandedId === log.id;
            const diffKeys = Object.keys(log.diffSummary || {});

            return (
              <div
                key={log.id}
                className="card"
                style={{
                  padding: '18px 22px',
                  borderLeft: `3px solid ${actionStyle.color}`,
                }}
              >
                {/* Header Row: Staff + Action + Timestamp */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '50%',
                        background: `${actionStyle.color}1A`,
                        border: `1.5px solid ${actionStyle.color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: actionStyle.color,
                        flexShrink: 0,
                      }}
                    >
                      {(log.staffName || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                          {log.staffName || 'Unknown Staff'}
                        </span>
                        <span
                          style={{
                            fontSize: '0.625rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {log.staffRole || 'STAFF'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Entity: <code style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{log.entityType}</code> ({(log.entityId || '').slice(0, 8)}...)
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        padding: '3px 9px',
                        borderRadius: 'var(--radius-full)',
                        background: actionStyle.bg,
                        color: actionStyle.color,
                        border: `1px solid ${actionStyle.color}33`,
                      }}
                    >
                      {actionStyle.label}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      <span suppressHydrationWarning>{new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </span>
                  </div>
                </div>

                {/* Stated Justification Reason */}
                <div
                  style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    fontSize: '0.8125rem',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: '#F59E0B', fontWeight: 600, fontSize: '0.75rem', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Staff Reason:
                  </span>
                  <span>{log.reason || 'No justification entered.'}</span>
                </div>

                {/* Diff Summary View */}
                {diffKeys.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Changes Detected ({diffKeys.length} field{diffKeys.length > 1 ? 's' : ''}):
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--accent)',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>{isExpanded ? 'Hide Raw Snapshot' : 'View Full JSON Snapshot'}</span>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {diffKeys.map((k) => {
                        const diffObj = log.diffSummary[k];
                        const fromVal = typeof diffObj === 'object' && diffObj !== null ? diffObj.from : undefined;
                        const toVal = typeof diffObj === 'object' && diffObj !== null ? diffObj.to : diffObj;

                        return (
                          <div
                            key={k}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-tertiary)',
                              fontSize: '0.75rem',
                              fontFamily: 'var(--font-mono)',
                              display: 'flex',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '8px',
                              border: '1px solid var(--border)',
                            }}
                          >
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{k}:</span>
                            {fromVal !== undefined && (
                              <span style={{ color: '#F87171', textDecoration: 'line-through' }}>
                                {JSON.stringify(fromVal)}
                              </span>
                            )}
                            <ArrowRight size={11} style={{ color: 'var(--text-muted)' }} />
                            <span style={{ color: '#34D399', fontWeight: 600 }}>
                              {JSON.stringify(toVal)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expanded Raw Snapshots */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '14px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: '12px',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.6875rem', color: '#F87171', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Before Snapshot
                      </div>
                      <pre
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-canvas)',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          color: 'var(--text-secondary)',
                          maxHeight: '180px',
                          overflow: 'auto',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                        }}
                      >
                        {JSON.stringify(log.beforeSnapshot, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.6875rem', color: '#34D399', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        After Snapshot
                      </div>
                      <pre
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-canvas)',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                          color: 'var(--text-secondary)',
                          maxHeight: '180px',
                          overflow: 'auto',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                        }}
                      >
                        {JSON.stringify(log.afterSnapshot, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => handlePageChange(pagination.page - 1)}
            className="pagination-btn"
          >
            Previous
          </button>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0 8px' }}>
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
          </span>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => handlePageChange(pagination.page + 1)}
            className="pagination-btn"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
