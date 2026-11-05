'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '../lib/actions/auth';
import { switchActiveStaffAction } from '../lib/actions/team';
import { useState, useTransition } from 'react';
import {
  LayoutDashboard,
  TrendingUp,
  CreditCard,
  Users,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
  Package,
  MessageSquare,
  Settings,
  LogOut,
  ChevronDown,
  Sparkles,
  Check,
  Zap,
} from 'lucide-react';

export type StaffRole = 'OWNER' | 'STORE_MANAGER' | 'FULFILLMENT_LEAD' | 'SUPPORT_CONCIERGE';

interface SidebarProps {
  tenantName: string;
  currentRole?: StaffRole;
  staffName?: string;
  staffId?: string;
  staffList?: Array<{
    id: string;
    fullName: string;
    role: StaffRole;
    avatarUrl: string | null;
    email: string;
  }>;
  lowStockCount?: number;
  handoffCount?: number;
  pendingPaymentsCount?: number;
  isOpen?: boolean;
  onClose?: () => void;
}

const ROLE_CONFIG: Record<StaffRole, { label: string; badgeClass: string; color: string; shortRole: string }> = {
  OWNER: { label: 'Owner / Super Admin', badgeClass: 'badge-owner', color: '#F59E0B', shortRole: 'Owner' },
  STORE_MANAGER: { label: 'Store Manager', badgeClass: 'badge-manager', color: '#A78BFA', shortRole: 'Manager' },
  FULFILLMENT_LEAD: { label: 'Fulfillment Lead', badgeClass: 'badge-fulfillment', color: '#34D399', shortRole: 'Fulfillment' },
  SUPPORT_CONCIERGE: { label: 'Support Concierge', badgeClass: 'badge-support', color: '#38BDF8', shortRole: 'Support' },
};

export function Sidebar({
  tenantName,
  currentRole = 'OWNER',
  staffName = 'Owner',
  staffId,
  staffList = [],
  lowStockCount = 0,
  handoffCount = 0,
  pendingPaymentsCount = 0,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showRoleMenu, setShowRoleMenu] = useState(false);

  const roleInfo = ROLE_CONFIG[currentRole] || ROLE_CONFIG.OWNER;
  const isOwner = currentRole === 'OWNER';
  const isManagerOrOwner = currentRole === 'OWNER' || currentRole === 'STORE_MANAGER';

  // Navigation items with Lucide icons
  const links = [
    // Executive Section
    { href: '/', label: 'Overview', icon: LayoutDashboard, section: 'Executive', allowed: true },
    {
      href: '/analytics',
      label: 'Analytics & Funnel',
      icon: TrendingUp,
      section: 'Executive',
      allowed: isManagerOrOwner,
    },
    {
      href: '/payments',
      label: 'Financials & Payouts',
      icon: CreditCard,
      badge: pendingPaymentsCount > 0 ? `${pendingPaymentsCount} pending` : undefined,
      section: 'Executive',
      allowed: isManagerOrOwner,
    },

    // Governance & Security
    {
      href: '/team',
      label: 'Staff & Team RBAC',
      icon: Users,
      section: 'Governance',
      allowed: isOwner,
    },
    {
      href: '/audit',
      label: 'Audit Ledger',
      icon: ShieldCheck,
      section: 'Governance',
      allowed: isManagerOrOwner,
    },

    // Operations Hub
    {
      href: '/orders',
      label: 'Orders & Fulfillment',
      icon: ShoppingBag,
      section: 'Operations',
      allowed: true,
    },
    {
      href: '/customers',
      label: 'Customer 360',
      icon: UserCheck,
      section: 'Operations',
      allowed: true,
    },
    {
      href: '/inventory',
      label: 'Inventory & Catalog',
      icon: Package,
      badge: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
      section: 'Operations',
      allowed: true,
    },
    {
      href: '/conversations',
      label: 'WhatsApp Live CRM',
      icon: MessageSquare,
      badge: handoffCount > 0 ? `${handoffCount}` : undefined,
      section: 'Operations',
      allowed: true,
    },

    // Configuration
    {
      href: '/settings',
      label: 'Store & AI Settings',
      icon: Settings,
      section: 'Configuration',
      allowed: isOwner,
    },
  ];

  const handleRoleSwitch = (targetStaffId: string) => {
    startTransition(async () => {
      await switchActiveStaffAction(targetStaffId);
      setShowRoleMenu(false);
    });
  };

  const sections = ['Executive', 'Operations', 'Governance', 'Configuration'];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 99,
          }}
        />
      )}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand & Store Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand-wrapper">
            <div className="sidebar-brand">
              <div className="brand-icon-box">
                <Zap size={16} fill="white" />
              </div>
              <span style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>COMMERCE OS</span>
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: roleInfo.color,
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${roleInfo.color}33`,
              }}
            >
              {roleInfo.shortRole}
            </span>
          </div>

          <div className="sidebar-tenant" title={tenantName}>
            {tenantName}
          </div>
        </div>

        {/* Staff Persona & Role Switcher */}
        <div
          style={{
            margin: '10px 12px 14px',
            padding: '10px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: `${roleInfo.color}1A`,
                  border: `1.5px solid ${roleInfo.color}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: roleInfo.color,
                  flexShrink: 0,
                }}
              >
                {staffName.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {staffName}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {roleInfo.label}
                </div>
              </div>
            </div>

            {staffList.length > 0 && (
              <button
                type="button"
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                title="Switch role view simulator"
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-secondary)',
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>Role</span>
                <ChevronDown size={11} />
              </button>
            )}
          </div>

          {/* Dropdown Role Simulator Menu */}
          {showRoleMenu && staffList.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                zIndex: 110,
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '6px',
                boxShadow: 'var(--shadow-elevated)',
              }}
            >
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', padding: '4px 8px 6px' }}>
                Simulate Persona
              </div>
              {staffList.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  disabled={isPending || st.id === staffId}
                  onClick={() => handleRoleSwitch(st.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: st.id === staffId ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: st.id === staffId ? 'default' : 'pointer',
                    color: st.id === staffId ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '11px',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (st.id !== staffId) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (st.id !== staffId) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{st.fullName}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{st.role}</div>
                  </div>
                  {st.id === staffId && <Check size={13} style={{ color: 'var(--success)' }} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nav Link Groups */}
        <nav className="sidebar-nav">
          {sections.map((section) => {
            const sectionLinks = links.filter((l) => l.section === section && l.allowed);
            if (sectionLinks.length === 0) return null;

            return (
              <div key={section} className="nav-section">
                <div className="nav-section-label">{section}</div>
                {sectionLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive =
                    link.href === '/'
                      ? pathname === '/'
                      : pathname === link.href || pathname.startsWith(`${link.href}/`);

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={onClose}
                      className={`nav-link ${isActive ? 'active' : ''}`}
                    >
                      <span className="nav-icon">
                        <Icon size={17} />
                      </span>
                      <span style={{ flex: 1, letterSpacing: '-0.01em' }}>{link.label}</span>
                      {link.badge && <span className="nav-badge">{link.badge}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer Sign Out */}
        <div className="sidebar-footer">
          <form action={logoutAction}>
            <button
              type="submit"
              className="nav-link"
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span className="nav-icon">
                <LogOut size={16} />
              </span>
              <span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
