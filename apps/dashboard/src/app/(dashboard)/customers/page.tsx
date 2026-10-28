import { getSession } from '../../../lib/auth';
import { listCustomers } from '../../../lib/dal';
import { CustomersClient } from './CustomersClient';

interface CustomersPageProps {
  searchParams: {
    page?: string;
    search?: string;
    sortBy?: any;
    isRepeat?: string;
  };
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const session = await getSession();

  const page = parseInt(searchParams.page || '1', 10);
  const search = searchParams.search;
  const sortBy = searchParams.sortBy;
  const isRepeat =
    searchParams.isRepeat === 'true'
      ? true
      : searchParams.isRepeat === 'false'
      ? false
      : undefined;

  const customersResult = await listCustomers(session.tenantId, {
    page,
    limit: 20,
    search,
    sortBy,
    isRepeat,
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers & Intelligence</h1>
          <p className="page-subtitle">
            Understand your shoppers, their automated order histories, and AI-inferred memory profiles.
          </p>
        </div>
      </div>

      <CustomersClient
        customers={customersResult.items.map((c) => ({
          ...c,
          totalSpent: Number(c.totalSpent),
          averageOrderValue: Number(c.averageOrderValue),
        }))}
        total={customersResult.pagination.total}
        page={customersResult.pagination.page}
        totalPages={customersResult.pagination.totalPages}
      />
    </div>
  );
}
