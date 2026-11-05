'use client';

import { useState } from 'react';
import { Sidebar, type StaffRole } from './Sidebar';
import { Header } from './Header';
import { HumanHandoffStickyBanner } from './HumanHandoffStickyBanner';

interface DashboardShellProps {
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
  aiAgentEnabled?: boolean;
  children: React.ReactNode;
}

export function DashboardShell({
  tenantName,
  currentRole = 'OWNER',
  staffName = 'Owner',
  staffId,
  staffList = [],
  lowStockCount = 0,
  handoffCount = 0,
  pendingPaymentsCount = 0,
  aiAgentEnabled = true,
  children,
}: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar
        tenantName={tenantName}
        currentRole={currentRole}
        staffName={staffName}
        staffId={staffId}
        staffList={staffList}
        lowStockCount={lowStockCount}
        handoffCount={handoffCount}
        pendingPaymentsCount={pendingPaymentsCount}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
      <div className="main-content">
        <Header
          tenantName={tenantName}
          currentRole={currentRole}
          staffName={staffName}
          aiAgentEnabled={aiAgentEnabled}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <HumanHandoffStickyBanner initialCount={handoffCount} />
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}

