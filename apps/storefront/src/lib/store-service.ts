import { prisma } from '@wcos/db';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StoreTenant {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  ownerPhone: string;
  whatsappPhoneNumber: string;
  whatsappInstanceName: string | null;
  businessCategory: string;
  botName: string;
  storefrontTheme: {
    primaryColor: string;
    accentColor: string;
    fontStyle: string;
  };
  storePolicies: Record<string, any>;
}

export interface StoreProduct {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  subcategory?: string | null;
  price: number;
  salePrice: number | null;
  stock: number;
  reserved: number;
  availableStock: number;
  imageUrls: string[];
  thumbnailUrl: string | null;
  attributes?: Record<string, any>;
  tags?: string[];
}

const DEFAULT_THEME = {
  primaryColor: '#0C0C0C',
  accentColor: '#C5A880',
  fontStyle: 'serif',
};

const DEFAULT_POLICIES = {
  allowAddressChangeUntil: 'SHIPPED',
  allowCancelUntil: 'PROCESSING',
};

export async function getStoreTenant(slug: string): Promise<StoreTenant | null> {
  const normalized = (slug || '').toLowerCase().trim();
  if (!normalized) {
    return null;
  }

  try {
    const tenant = await prisma.tenant.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { slug: normalized },
          { whatsappInstanceName: normalized },
          { customDomain: normalized },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        ownerName: true,
        ownerPhone: true,
        supportPhone: true,
        whatsappPhoneNumber: true,
        whatsappInstanceName: true,
        businessCategory: true,
        storefrontTheme: true,
        storePolicies: true,
        aiConfig: true,
      },
    });

    if (!tenant) {
      return null;
    }

    const aiConfig = (tenant.aiConfig as Record<string, any>) || {};
    const persona = (aiConfig['persona'] as Record<string, any>) || {};
    const botName =
      String(persona['botName'] || persona['agentName'] || '').trim() || 'Store Concierge';

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug || normalized,
      ownerName: tenant.ownerName,
      ownerPhone: tenant.ownerPhone,
      whatsappPhoneNumber: tenant.whatsappPhoneNumber || tenant.supportPhone || tenant.ownerPhone,
      whatsappInstanceName: tenant.whatsappInstanceName,
      businessCategory: tenant.businessCategory || 'Curated Online Store',
      botName,
      storefrontTheme: (tenant.storefrontTheme as any) || DEFAULT_THEME,
      storePolicies: (tenant.storePolicies as any) || DEFAULT_POLICIES,
    };
  } catch (err) {
    console.error('[StoreService] Failed to fetch store tenant:', err);
    return null;
  }
}

export async function getStoreProducts(
  tenantId: string,
  category?: string,
  search?: string
): Promise<{
  products: StoreProduct[];
  categories: string[];
}> {
  try {
    const andConditions: any[] = [];

    if (category && category !== 'all') {
      andConditions.push({
        OR: [
          { category: { equals: category, mode: 'insensitive' } },
          { subcategory: { equals: category, mode: 'insensitive' } },
        ],
      });
    }

    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where: any = {
      tenantId,
      status: { in: ['ACTIVE', 'OUT_OF_STOCK'] },
    };
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [dbProducts, dbCategories] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.findMany({
        where: { tenantId, status: { in: ['ACTIVE', 'OUT_OF_STOCK'] } },
        select: { category: true, subcategory: true },
      }),
    ]);

    const cats = Array.from(
      new Set(
        dbCategories
          .flatMap((c) => [c.category, c.subcategory])
          .filter((c): c is string => Boolean(c))
      )
    );

    return {
      products: dbProducts.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        category: p.category,
        subcategory: p.subcategory,
        price: Number(p.price),
        salePrice: p.salePrice ? Number(p.salePrice) : null,
        stock: p.stock,
        reserved: p.reserved,
        availableStock: Math.max(0, p.stock - p.reserved),
        imageUrls: p.imageUrls,
        thumbnailUrl: p.thumbnailUrl || p.imageUrls[0] || null,
        attributes: (p.attributes as any) || {},
        tags: p.tags,
      })),
      categories: cats,
    };
  } catch (err) {
    console.error('[StoreService] Failed to fetch store products:', err);
    return { products: [], categories: [] };
  }
}

export async function getStoreProductById(
  tenantId: string,
  idOrCode: string
): Promise<StoreProduct | null> {
  const query = (idOrCode || '').trim();
  if (!query) {
    return null;
  }

  try {
    const orFilters: any[] = [{ code: { equals: query, mode: 'insensitive' } }];
    if (UUID_REGEX.test(query)) {
      orFilters.unshift({ id: query });
    }

    const product = await prisma.product.findFirst({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'OUT_OF_STOCK'] },
        OR: orFilters,
      },
    });

    if (!product) {
      return null;
    }

    return {
      id: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      category: product.category,
      subcategory: product.subcategory,
      price: Number(product.price),
      salePrice: product.salePrice ? Number(product.salePrice) : null,
      stock: product.stock,
      reserved: product.reserved,
      availableStock: Math.max(0, product.stock - product.reserved),
      imageUrls: product.imageUrls,
      thumbnailUrl: product.thumbnailUrl || product.imageUrls[0] || null,
      attributes: (product.attributes as any) || {},
      tags: product.tags,
    };
  } catch (err) {
    console.error('[StoreService] Failed to fetch product by ID:', err);
    return null;
  }
}
