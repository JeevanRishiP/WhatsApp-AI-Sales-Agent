'use client';

import { useState, useTransition } from 'react';
import {
  inviteTeamMemberAction,
  updateStaffRoleAction,
  updateStaffStatusAction,
  switchActiveStaffAction,
  type TeamActionState,
} from '@/lib/actions/team';
import type { StaffRole, StaffStatus } from '@wcos/db';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Eye,
  CheckCircle2,
  AlertTriangle,
  X,
  Lock,
  Mail,
  Phone,
  User,
  Shield,
  Activity,
} from 'lucide-react';

interface StaffUserItem {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  status: StaffStatus;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  _count?: {
    revisions: number;
    notes: number;
    assignedOrders: number;
  };
}

interface TeamClientProps {
  team: StaffUserItem[];
  currentStaffId?: string;
  canSimulateRoles?: boolean;
}

const ROLE_BADGES: Record<StaffRole, { label: string; color: string; bg: string; border: string; desc: string }> = {
  OWNER: {
    label: 'Owner / Super Admin',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    desc: 'Full store oversight, financials, team roster & audit explorer.',
  },
  STORE_MANAGER: {
    label: 'Store Manager',
    color: '#A78BFA',
    bg: 'rgba(167, 139, 250, 0.12)',
    border: 'rgba(167, 139, 250, 0.3)',
    desc: 'Order lifecycle management, refunds, cancellations, and customer risk.',
  },
  FULFILLMENT_LEAD: {
    label: 'Fulfillment Lead',
    color: '#34D399',
    bg: 'rgba(52, 211, 153, 0.12)',
    border: 'rgba(52, 211, 153, 0.3)',
    desc: 'Courier assignments, AWB tracking entry, pick/pack/ship dispatch.',
  },
  SUPPORT_CONCIERGE: {
    label: 'Support Concierge',
    color: '#38BDF8',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.3)',
    desc: 'Customer 360 lookup, WhatsApp inquiries, address adjustments.',
  },
};

export function TeamClient({ team, currentStaffId, canSimulateRoles = false }: TeamClientProps) {
  const [isPending, startTransition] = useTransition();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('SUPPORT_CONCIERGE');

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    const formData = new FormData();
    formData.append('fullName', fullName);
    formData.append('email', email);
    if (phone) formData.append('phone', phone);
    formData.append('role', role);

    startTransition(async () => {
      const res: TeamActionState = await inviteTeamMemberAction({}, formData);
      if (res.error) {
        setInviteError(res.error);
      } else {
        setInviteSuccess(
          res.temporaryPassword
            ? `${res.message} Temporary password: ${res.temporaryPassword}`
            : res.message || 'Staff member invited successfully'
        );
        setFullName('');
        setEmail('');
        setPhone('');
        if (!res.temporaryPassword) {
          setTimeout(() => {
            setShowInviteModal(false);
            setInviteSuccess(null);
          }, 1200);
        }
      }
    });
  };

  const handleRoleChange = (staffId: string, newRole: StaffRole) => {
    startTransition(async () => {
      await updateStaffRoleAction(staffId, newRole);
    });
  };

  const handleStatusToggle = (staffId: string, currentStatus: StaffStatus) => {
    const newStatus: StaffStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    startTransition(async () => {
      await updateStaffStatusAction(staffId, newStatus);
    });
  };

  const handleSimulate = (staffId: string) => {
    startTransition(async () => {
      await switchActiveStaffAction(staffId);
    });
  };

  return (
    <div>
      {/* Metrics Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Total Roster</span>
            <div className="kpi-icon-wrapper">
              <Users size={16} />
            </div>
          </div>
          <div className="kpi-value">{team.length}</div>
          <div className="kpi-subtext">Active accounts across roles</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Store Managers</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(167, 139, 250, 0.1)', color: '#A78BFA', borderColor: 'rgba(167, 139, 250, 0.25)' }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#A78BFA' }}>
            {team.filter((m) => m.role === 'STORE_MANAGER').length}
          </div>
          <div className="kpi-subtext">Authorized for order overrides</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Fulfillment Leads</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34D399', borderColor: 'rgba(52, 211, 153, 0.25)' }}>
              <Activity size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#34D399' }}>
            {team.filter((m) => m.role === 'FULFILLMENT_LEAD').length}
          </div>
          <div className="kpi-subtext">Dispatch & courier operations</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Support Concierges</span>
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8', borderColor: 'rgba(56, 189, 248, 0.25)' }}>
              <User size={16} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#38BDF8' }}>
            {team.filter((m) => m.role === 'SUPPORT_CONCIERGE').length}
          </div>
          <div className="kpi-subtext">Customer assistance on WhatsApp</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-header" style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
          <div>
            <h2 className="card-title">
              <Shield size={18} style={{ color: 'var(--accent)' }} />
              <span>Team Roster & Role Permissions</span>
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              All staff actions are recorded in the tamper-evident audit ledger with diff snapshots.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowInviteModal(true)}
          >
            <UserPlus size={15} />
            <span>Invite Staff Member</span>
          </button>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role & Permission</th>
                <th>Audit Activity</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {team.map((member) => {
                const roleBadge = ROLE_BADGES[member.role] || ROLE_BADGES.SUPPORT_CONCIERGE;
                const isSelf = member.id === currentStaffId;

                return (
                  <tr
                    key={member.id}
                    style={{
                      background: isSelf ? 'rgba(99, 102, 241, 0.05)' : undefined,
                    }}
                  >
                    {/* Member Info */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: `${roleBadge.color}1A`,
                            border: `1.5px solid ${roleBadge.color}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: roleBadge.color,
                            flexShrink: 0,
                          }}
                        >
                          {member.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {member.fullName}
                            {isSelf && (
                              <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '4px', background: 'var(--accent-subtle)', color: 'var(--accent)', fontWeight: 700 }}>
                                YOU
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {member.email} {member.phone ? `• ${member.phone}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role Dropdown */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select
                          value={member.role}
                          disabled={isPending || member.role === 'OWNER'}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as StaffRole)}
                          className="form-select"
                          style={{
                            padding: '4px 28px 4px 10px',
                            background: roleBadge.bg,
                            color: roleBadge.color,
                            borderColor: roleBadge.border,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: member.role === 'OWNER' ? 'not-allowed' : 'pointer',
                            width: 'auto',
                            display: 'inline-block',
                          }}
                        >
                          <option value="OWNER">Owner / Super Admin</option>
                          <option value="STORE_MANAGER">Store Manager</option>
                          <option value="FULFILLMENT_LEAD">Fulfillment Lead</option>
                          <option value="SUPPORT_CONCIERGE">Support Concierge</option>
                        </select>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          {roleBadge.desc}
                        </span>
                      </div>
                    </td>

                    {/* Activity Counts */}
                    <td>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
                        <strong>{member._count?.revisions || 0}</strong> events
                      </div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {member._count?.notes || 0} notes • {member._count?.assignedOrders || 0} orders
                      </div>
                    </td>

                    {/* Status Toggle */}
                    <td>
                      <button
                        type="button"
                        disabled={isPending || member.role === 'OWNER'}
                        onClick={() => handleStatusToggle(member.id, member.status)}
                        className={`badge ${member.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}
                        style={{
                          cursor: member.role === 'OWNER' ? 'not-allowed' : 'pointer',
                          border: 'none',
                        }}
                      >
                        ● {member.status}
                      </button>
                    </td>

                    {/* Actions / Simulator (dev opt-in only) */}
                    <td style={{ textAlign: 'right' }}>
                      {canSimulateRoles ? (
                        <button
                          type="button"
                          disabled={isPending || isSelf}
                          onClick={() => handleSimulate(member.id)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Eye size={12} />
                          <span>{isSelf ? 'Current View' : 'Simulate View'}</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {isSelf ? 'Current Session' : 'RBAC Enforced'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Invite New Team Member</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setShowInviteModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit}>
              <div className="modal-body">
                {inviteError && (
                  <div className="alert alert-error">
                    <AlertTriangle size={15} />
                    <span>{inviteError}</span>
                  </div>
                )}

                {inviteSuccess && (
                  <div className="alert alert-success">
                    <CheckCircle2 size={15} />
                    <span>{inviteSuccess}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="priya@store.com"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone Number (Optional)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Role Assignment *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as StaffRole)}
                    className="form-select"
                  >
                    <option value="STORE_MANAGER">Store Manager (Fulfillment & Overrides)</option>
                    <option value="FULFILLMENT_LEAD">Fulfillment Lead (Courier Dispatch & AWB)</option>
                    <option value="SUPPORT_CONCIERGE">Support Concierge (Inquiries & Customer 360)</option>
                  </select>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowInviteModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Sending Invite...' : 'Send Access Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
