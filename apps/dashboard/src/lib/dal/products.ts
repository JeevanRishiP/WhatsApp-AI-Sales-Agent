// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Products (Inventory)                     ║
// ║                                                               ║
// ║  Full CRUD for product management.                            ║
// ║  Every query is scoped to tenantId.                           ║
// ╚═══════════════════════════════════════════════════════════════╝

import { prisma, type Prisma, type Product, type ProductStatus } from '@wcos/db';

// ─── Types ────────────────────────────────────────────────────────

export interface ProductListOptions {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  status?: ProductStatus;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'name' | 'stock_low';
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─── List Products ────────────────────────────────────────────────

export async function listProducts(
  tenantId: string,
  opts: ProductListOptions = {}
): Promise<PaginatedResult<Product>> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 20, 100);
  const skip = (page - 1) * limit;

  // Build WHERE clause — tenantId is ALWAYS included
  const where: Prisma.ProductWhereInput = { tenantId };

  if (opts.search) {
    where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { code: { contains: opts.search, mode: 'insensitive' } },
      { description: { contains: opts.search, mode: 'insensitive' } },
      { category: { contains: opts.search, mode: 'insensitive' } },
    ];
  }

  if (opts.category) {
    where.category = { equals: opts.category, mode: 'insensitive' };
  }

  if (opts.status) {
    where.status = opts.status;
  }

  if (opts.inStock) {
    where.stock = { gt: 0 };
  }

  if (opts.minPrice !== undefined || opts.maxPrice !== undefined) {
    where.price = {};
    if (opts.minPrice !== undefined) where.price.gte = opts.minPrice;
    if (opts.maxPrice !== undefined) where.price.lte = opts.maxPrice;
  }

  // Build ORDER BY
  let orderBy: Prisma.ProductOrderByWithRelationInput;
  switch (opts.sortBy) {
    case 'oldest':
      orderBy = { createdAt: 'asc' };
      break;
    case 'price_asc':
      orderBy = { price: 'asc' };
      break;
    case 'price_desc':
      orderBy = { price: 'desc' };
      break;
    case 'name':
      orderBy = { name: 'asc' };
      break;
    case 'stock_low':
      orderBy = { stock: 'asc' };
      break;
    default:
      orderBy = { createdAt: 'desc' };
  }

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limit,
      orderBy,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ─── Get Single Product ───────────────────────────────────────────

export async function getProduct(tenantId: string, productId: string): Promise<Product | null> {
  return prisma.product.findFirst({
    where: {
      id: productId,
      tenantId, // ← data isolation
    },
  });
}

// ─── Create Product ───────────────────────────────────────────────

export interface CreateProductInput {
  code: string;
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  price: number;
  salePrice?: number;
  currency?: string;
  stock?: number;
  lowStockThreshold?: number;
  imageUrls?: string[];
  attributes?: Record<string, unknown>;
  tags?: string[];
  status?: ProductStatus;
}

export async function createProduct(tenantId: string, input: CreateProductInput): Promise<Product> {
  // Check code uniqueness within tenant
  const existing = await prisma.product.findUnique({
    where: { tenantId_code: { tenantId, code: input.code } },
  });

  if (existing) {
    throw new Error(`Product with code '${input.code}' already exists`);
  }

  return prisma.product.create({
    data: {
      tenantId,
      code: input.code,
      name: input.name,
      description: input.description,
      category: input.category,
      subcategory: input.subcategory,
      price: input.price,
      salePrice: input.salePrice,
      currency: input.currency || 'INR',
      stock: input.stock ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? 5,
      imageUrls: input.imageUrls || [],
      attributes: (input.attributes as Prisma.InputJsonValue) || {},
      tags: input.tags || [],
      status: input.status || 'ACTIVE',
    },
  });
}

// ─── Update Product ───────────────────────────────────────────────

export interface UpdateProductInput {
  name?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  price?: number;
  salePrice?: number | null;
  currency?: string;
  stock?: number;
  lowStockThreshold?: number;
  imageUrls?: string[];
  attributes?: Record<string, unknown>;
  tags?: string[];
  status?: ProductStatus;
}

export async function updateProduct(
  tenantId: string,
  productId: string,
  input: UpdateProductInput
): Promise<Product> {
  // Verify product belongs to tenant BEFORE updating
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId },
  });

  if (!existing) {
    throw new Error('Product not found');
  }

  const data: Prisma.ProductUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.category !== undefined) data.category = input.category;
  if (input.subcategory !== undefined) data.subcategory = input.subcategory;
  if (input.price !== undefined) data.price = input.price;
  if (input.salePrice !== undefined) data.salePrice = input.salePrice;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.stock !== undefined) data.stock = input.stock;
  if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold;
  if (input.imageUrls !== undefined) data.imageUrls = input.imageUrls;
  if (input.attributes !== undefined) data.attributes = input.attributes as Prisma.InputJsonValue;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.status !== undefined) data.status = input.status;

  return prisma.product.update({
    where: { id: productId },
    data,
  });
}

// ─── Delete Product (soft delete → ARCHIVED) ─────────────────────

export async function archiveProduct(tenantId: string, productId: string): Promise<Product> {
  // Verify ownership
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId },
  });

  if (!existing) {
    throw new Error('Product not found');
  }

  return prisma.product.update({
    where: { id: productId },
    data: { status: 'ARCHIVED' },
  });
}

// ─── Get All Categories (for filters) ─────────────────────────────

export async function getProductCategories(tenantId: string): Promise<string[]> {
  const results = await prisma.product.findMany({
    where: { tenantId, category: { not: null } },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });

  return results.map((r) => r.category).filter(Boolean) as string[];
}

// ─── Bulk Update Stock ────────────────────────────────────────────

export async function updateStock(
  tenantId: string,
  productId: string,
  newStock: number
): Promise<Product> {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId },
  });

  if (!existing) {
    throw new Error('Product not found');
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      stock: newStock,
      status: newStock === 0 ? 'OUT_OF_STOCK' : existing.status === 'OUT_OF_STOCK' ? 'ACTIVE' : existing.status,
    },
  });
}

// ─── Product Stats ────────────────────────────────────────────────

export interface ProductStats {
  totalProducts: number;
  activeProducts: number;
  outOfStockProducts: number;
  draftProducts: number;
  archivedProducts: number;
  avgPrice: number;
  totalStockValue: number;
}

export async function getProductStats(tenantId: string): Promise<ProductStats> {
  const [statusCounts, avgPrice, stockValue] = await Promise.all([
    prisma.product.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    }),
    prisma.product.aggregate({
      where: { tenantId, status: 'ACTIVE' },
      _avg: { price: true },
    }),
    prisma.$queryRaw<[{ value: number }]>`
      SELECT COALESCE(SUM("price" * "stock"), 0)::float as value
      FROM "Product"
      WHERE "tenantId" = ${tenantId}::uuid AND "status" = 'ACTIVE'
    `,
  ]);

  const countByStatus = Object.fromEntries(
    statusCounts.map((s) => [s.status, s._count])
  );

  return {
    totalProducts: Object.values(countByStatus).reduce((a, b) => a + b, 0),
    activeProducts: countByStatus['ACTIVE'] || 0,
    outOfStockProducts: countByStatus['OUT_OF_STOCK'] || 0,
    draftProducts: countByStatus['DRAFT'] || 0,
    archivedProducts: countByStatus['ARCHIVED'] || 0,
    avgPrice: Number(avgPrice._avg.price || 0),
    totalStockValue: stockValue[0]?.value || 0,
  };
}

// ─── Categories & Low Stock ───────────────────────────────────────

export async function getCategories(tenantId: string): Promise<string[]> {
  const categories = await prisma.product.findMany({
    where: { tenantId, category: { not: null } },
    select: { category: true },
    distinct: ['category'],
  });
  return categories.map((c) => c.category!).filter(Boolean);
}

export async function getLowStockCount(tenantId: string): Promise<number> {
  const result = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "Product"
    WHERE "tenantId" = ${tenantId}::uuid
      AND "status" = 'ACTIVE'
      AND "stock" <= "lowStockThreshold"
  `;
  return Number(result[0]?.count || 0);
}
