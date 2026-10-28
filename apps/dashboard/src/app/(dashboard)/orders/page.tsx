import { getSession } from '../../../lib/auth';
import { listOrders } from '../../../lib/dal';
import { OrdersClient } from './OrdersClient';

interface OrdersPageProps {
  searchParams: {
    page?: string;
    search?: string;
    status?: any;
  };
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const session = await getSession();

  const page = parseInt(searchParams.page || '1', 10);
  const search = searchParams.search;
  const status = searchParams.status;

  const ordersResult = await listOrders(session.tenantId, {
    page,
    limit: 20,
    search,
    status: status || undefined,
    sortBy: 'newest',
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders & Fulfillment</h1>
          <p className="page-subtitle">
            Manage your incoming orders, dispatch tracking, and payment verification.
          </p>
        </div>
      </div>

      <OrdersClient
        orders={ordersResult.items.map((o: any) => ({
          ...o,
          subtotal: Number(o.subtotal),
          discount: Number(o.discount),
          shippingCharge: Number(o.shippingCharge),
          tax: Number(o.tax),
          total: Number(o.total),
          items: (o.items || []).map((it: any) => ({
            ...it,
            priceAtOrder: Number(it.priceAtOrder),
            discountAtOrder: Number(it.discountAtOrder),
            taxAtOrder: Number(it.taxAtOrder),
            totalAtOrder: Number(it.totalAtOrder),
          })),
        }))}
        total={ordersResult.pagination.total}
        page={ordersResult.pagination.page}
        totalPages={ordersResult.pagination.totalPages}
      />
    </div>
  );
}
