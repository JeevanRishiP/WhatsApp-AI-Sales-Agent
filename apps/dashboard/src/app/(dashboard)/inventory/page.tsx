import { getSession } from '../../../lib/auth';
import {
  listProducts,
  getCategories,
  getLowStockCount,
} from '../../../lib/dal';
import { InventoryClient } from './InventoryClient';

interface InventoryPageProps {
  searchParams: {
    page?: string;
    search?: string;
    category?: string;
    status?: any;
  };
}

export default async function InventoryPage({ searchParams }: InventoryPageProps) {
  const session = await getSession();

  const page = parseInt(searchParams.page || '1', 10);
  const search = searchParams.search;
  const category = searchParams.category;
  const status = searchParams.status;

  const [productsResult, categories, lowStockCount] = await Promise.all([
    listProducts(session.tenantId, {
      page,
      limit: 20,
      search,
      category,
      status,
      sortBy: 'newest',
    }),
    getCategories(session.tenantId),
    getLowStockCount(session.tenantId),
  ]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory & Catalog</h1>
          <p className="page-subtitle">
            Manage your store items, stock levels, prices, and WhatsApp catalog readiness.
          </p>
        </div>
      </div>

      <InventoryClient
        products={productsResult.items.map((p: any) => ({
          ...p,
          price: Number(p.price),
          salePrice: p.salePrice ? Number(p.salePrice) : null,
        }))}
        categories={categories}
        total={productsResult.pagination.total}
        page={productsResult.pagination.page}
        totalPages={productsResult.pagination.totalPages}
        lowStockCount={lowStockCount}
      />
    </div>
  );
}
