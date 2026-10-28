'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAction } from '../lib/actions/auth';

interface SidebarProps {
  tenantName: string;
  lowStockCount?: number;
  handoffCount?: number;
  pendingPaymentsCount?: number;
}

export function Sidebar({ tenantName, lowStockCount = 0, handoffCount = 0, pendingPaymentsCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Overview', icon: '📊', section: 'Main' },
    {
      href: '/inventory',
      label: 'Inventory',
      icon: '📦',
      badge: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
      section: 'Commerce',
    },
    {
      href: '/orders',
      label: 'Orders',
      icon: '🛍️',
      section: 'Commerce',
    },
    {
      href: '/payments',
      label: 'Payments',
      icon: '💳',
      badge: pendingPaymentsCount > 0 ? `${pendingPaymentsCount} pending` : undefined,
      section: 'Commerce',
    },
    {
      href: '/customers',
      label: 'Customers',
      icon: '👥',
      section: 'Commerce',
    },
    {
      href: '/analytics',
      label: 'Analytics',
      icon: '📈',
      section: 'Commerce',
    },
    {
      href: '/conversations',
      label: 'WhatsApp Inbox',
      icon: '💬',
      badge: handoffCount > 0 ? `${handoffCount}` : undefined,
      section: 'AI Agent',
    },
    {
      href: '/settings',
      label: 'Settings & Bot',
      icon: '⚙️',
      section: 'Management',
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">⚡ COMMERCE OS</div>
        <div className="sidebar-tenant" title={tenantName}>
          {tenantName}
        </div>
      </div>

      <nav className="sidebar-nav">
        {['Main', 'Commerce', 'AI Agent', 'Management'].map((section) => {
          const sectionLinks = links.filter((l) => l.section === section);
          if (sectionLinks.length === 0) return null;

          return (
            <div key={section} className="nav-section">
              <div className="nav-section-label">{section}</div>
              {sectionLinks.map((link) => {
                const isActive =
                  link.href === '/'
                    ? pathname === '/'
                    : pathname.startsWith(link.href);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`nav-link ${isActive ? 'active' : ''}`}
                  >
                    <span className="nav-icon">{link.icon}</span>
                    <span>{link.label}</span>
                    {link.badge && <span className="nav-badge">{link.badge}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <form action={logoutAction}>
          <button
            type="submit"
            className="nav-link"
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <span className="nav-icon">🚪</span>
            <span>Sign Out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
