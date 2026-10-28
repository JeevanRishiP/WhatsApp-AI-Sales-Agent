import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '../../../../lib/auth';
import { getFullCustomerProfile } from '../../../../lib/dal';
import { CustomerProfileClient } from './CustomerProfileClient';

interface CustomerProfilePageProps {
  params: {
    phone: string;
  };
}

export default async function CustomerProfilePage({ params }: CustomerProfilePageProps) {
  const session = await getSession();
  const rawParam = params.phone;
  const decodedPhone = decodeURIComponent(rawParam);

  const profile = await getFullCustomerProfile(session.tenantId, decodedPhone);

  if (!profile) {
    return (
      <div className="page-container">
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', maxWidth: '600px', margin: '40px auto' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>👤</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Customer Profile Not Found
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '24px' }}>
            No customer memory, orders, or conversation found for{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{decodedPhone}</code> in your tenant.
          </p>
          <Link href="/customers" className="btn btn-primary">
            ← Return to Customer Directory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <CustomerProfileClient profile={profile} />
    </div>
  );
}
