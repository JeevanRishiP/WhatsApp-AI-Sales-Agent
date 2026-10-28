import { getSession } from '../../../lib/auth';
import { getTenantProfile } from '../../../lib/dal';
import { SettingsClient } from './SettingsClient';
import { notFound } from 'next/navigation';

export default async function SettingsPage() {
  const session = await getSession();
  const tenant = await getTenantProfile(session.tenantId);

  if (!tenant) {
    notFound();
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings &amp; Bot Configuration</h1>
          <p className="page-subtitle">
            Configure your merchant profile, WhatsApp AI agent persona, API credentials, and security.
          </p>
        </div>
      </div>

      <SettingsClient
        tenant={{
          id: tenant.id,
          name: tenant.name,
          ownerName: tenant.ownerName,
          ownerPhone: tenant.ownerPhone,
          ownerEmail: tenant.ownerEmail,
          businessCategory: tenant.businessCategory,
          status: tenant.status,
          plan: tenant.plan,
          apiKey: tenant.apiKey,
          whatsappInstanceName: tenant.whatsappInstanceName,
          whatsappPhoneNumber: (tenant as any).whatsappPhoneNumber || '',
          persona: tenant.persona as any,
          aiConfig: (tenant as any).aiConfig || {},
          monthlyMessageCount: tenant.monthlyMessageCount,
          monthlyMessageLimit: tenant.monthlyMessageLimit,
        }}
      />
    </div>
  );
}
