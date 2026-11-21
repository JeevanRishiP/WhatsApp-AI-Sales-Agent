import { getSession } from '../../../lib/auth';
import { getTenantProfile, getMaskedPaymentSecrets } from '../../../lib/dal/settings';
import { maskSecret } from '@wcos/crypto';
import { SettingsClient } from './SettingsClient';
import { notFound } from 'next/navigation';

export default async function SettingsPage() {
  const session = await getSession();
  const [tenant, paymentSecretsMasked] = await Promise.all([
    getTenantProfile(session.tenantId),
    getMaskedPaymentSecrets(session.tenantId),
  ]);

  if (!tenant) {
    notFound();
  }

  const isOwner = session.role === 'OWNER';

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
          apiKey: isOwner ? tenant.apiKey : maskSecret(tenant.apiKey, 4),
          whatsappInstanceName: tenant.whatsappInstanceName,
          whatsappPhoneNumber: tenant.whatsappPhoneNumber || '',
          persona: tenant.persona as any,
          aiConfig: (tenant.aiConfig as any) || {},
          slug: tenant.slug || '',
          monthlyMessageCount: tenant.monthlyMessageCount,
          monthlyMessageLimit: tenant.monthlyMessageLimit,
        }}
        userRole={session.role}
        paymentSecretsMasked={paymentSecretsMasked}
      />
    </div>
  );
}
