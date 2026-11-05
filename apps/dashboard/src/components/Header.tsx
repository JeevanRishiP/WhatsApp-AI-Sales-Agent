'use client';

import { usePathname } from 'next/navigation';
import {
  Menu,
  Store,
  Bot,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Zap,
  Package,
  MessageSquare,
} from 'lucide-react';
import type { StaffRole } from './Sidebar';
import { AiAgentToggle } from './AiAgentToggle';

interface HeaderProps {
  tenantName: string;
  currentRole?: StaffRole;
  staffName?: string;
  aiAgentEnabled?: boolean;
  onMobileMenuToggle?: () => void;
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Executive Overview',
  '/orders': 'Orders & Fulfillment',
  '/customers': 'Customer 360',
  '/inventory': 'Inventory & Catalog',
  '/conversations': 'WhatsApp Live CRM',
  '/analytics': 'Analytics & Funnel',
  '/payments': 'Financials & Payouts',
  '/team': 'Staff & Team RBAC',
  '/audit': 'Audit Ledger & Security',
  '/settings': 'Store Settings & AI Bot',
};

const ROLE_COLORS: Record<StaffRole, { color: string; label: string }> = {
  OWNER: { color: '#F59E0B', label: 'Owner' },
  STORE_MANAGER: { color: '#A78BFA', label: 'Manager' },
  FULFILLMENT_LEAD: { color: '#34D399', label: 'Fulfillment' },
  SUPPORT_CONCIERGE: { color: '#38BDF8', label: 'Concierge' },
};

export function Header({
  tenantName,
  currentRole = 'OWNER',
  staffName = 'Owner',
  aiAgentEnabled = true,
  onMobileMenuToggle,
}: HeaderProps) {
  const pathname = usePathname();
  const currentSection = ROUTE_LABELS[pathname] || (pathname.startsWith('/customers/') ? 'Customer Profile' : 'Dashboard');
  const roleMeta = ROLE_COLORS[currentRole] || ROLE_COLORS.OWNER;

  return (
    <header className="dashboard-header">
      <div className="header-left">
        {onMobileMenuToggle && (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', marginRight: '4px' }}
            aria-label="Toggle menu"
          >
            <Menu size={18} />
          </button>
        )}

        <div className="header-breadcrumbs">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
            <Store size={14} />
            <span style={{ fontWeight: 500 }}>{tenantName}</span>
          </div>
          <ChevronRight size={12} className="crumb-separator" />
          <span className="crumb-active">{currentSection}</span>
        </div>
      </div>

      <div className="header-right">
        {/* WhatsApp AI Engine Quick Toggle Switch */}
        <AiAgentToggle initialEnabled={aiAgentEnabled} />

        {/* Staff Persona Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 10px 4px 6px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: `${roleMeta.color}22`,
              border: `1.5px solid ${roleMeta.color}`,
              color: roleMeta.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            {staffName.charAt(0).toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {staffName}
            </span>
            <span style={{ fontSize: '9px', fontWeight: 600, color: roleMeta.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {roleMeta.label}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

