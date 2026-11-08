import { prisma } from '@wcos/db';
import auraData from './aura-data.json';

export interface StoreTenant {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  ownerPhone: string;
  whatsappPhoneNumber: string;
  whatsappInstanceName: string;
  businessCategory: string;
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

export const AURA_TENANT: StoreTenant = {
  id: auraData.tenant.id,
  name: 'Aura Luxe Boutique',
  slug: 'aura-luxe',
  ownerName: auraData.tenant.ownerName,
  ownerPhone: auraData.tenant.ownerPhone,
  whatsappPhoneNumber: auraData.tenant.ownerPhone,
  whatsappInstanceName: auraData.tenant.whatsappInstanceName,
  businessCategory: 'Luxury Handloom & Silk Sarees',
  storefrontTheme: {
    primaryColor: '#0C0C0C',
    accentColor: '#C5A880',
    fontStyle: 'serif',
  },
  storePolicies: {
    allowAddressChangeUntil: 'SHIPPED',
    allowCancelUntil: 'PROCESSING',
  },
};

export const AURA_PRODUCTS: StoreProduct[] = auraData.products.map((p) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description,
  category: p.category,
  subcategory: p.subcategory,
  price: p.price,
  salePrice: p.salePrice ?? null,
  stock: p.stock,
  reserved: 0,
  availableStock: p.stock,
  imageUrls: p.imageUrls,
  thumbnailUrl: p.imageUrls[0] || null,
  attributes: p.attributes as any,
  tags: p.tags,
}));

export async function getStoreTenant(slug: string): Promise<StoreTenant> {
  const normalized = (slug || '').toLowerCase().trim();

  // 1. Try fetching from live PostgreSQL database
  try {
    const isAura =
      normalized === 'aura' ||
      normalized === 'aura-luxe' ||
      normalized === 'aura-saree-shop' ||
      normalized === 'aura-archived' ||
      normalized === 'demo' ||
      normalized === 'wa_aura_luxe_01';

    if (isAura) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          id: AURA_TENANT.id,
          status: 'ACTIVE',
        },
      });

      if (tenant) {
        return {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug || 'aura-luxe',
          ownerName: tenant.ownerName,
          ownerPhone: tenant.ownerPhone,
          whatsappPhoneNumber: tenant.whatsappPhoneNumber || tenant.ownerPhone,
          whatsappInstanceName: tenant.whatsappInstanceName,
          businessCategory: tenant.businessCategory || 'Luxury Handloom & Silk Sarees',
          storefrontTheme: (tenant.storefrontTheme as any) || AURA_TENANT.storefrontTheme,
          storePolicies: (tenant.storePolicies as any) || AURA_TENANT.storePolicies,
        };
      }
    }

    const tenant = await prisma.tenant.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          { slug: normalized },
          { whatsappInstanceName: normalized },
        ],
      },
    });

    if (tenant) {
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug || normalized,
        ownerName: tenant.ownerName,
        ownerPhone: tenant.ownerPhone,
        whatsappPhoneNumber: tenant.whatsappPhoneNumber || tenant.ownerPhone,
        whatsappInstanceName: tenant.whatsappInstanceName,
        businessCategory: tenant.businessCategory || 'Luxury Handloom & Silk Sarees',
        storefrontTheme: (tenant.storefrontTheme as any) || AURA_TENANT.storefrontTheme,
        storePolicies: (tenant.storePolicies as any) || AURA_TENANT.storePolicies,
      };
    }
  } catch (err) {
    // Database offline or query error, fall back to Aura Luxe Boutique
  }

  // 2. Return Aura Luxe Boutique as standard store
  return AURA_TENANT;
}

export async function getStoreProducts(tenantId: string, category?: string, search?: string): Promise<{
  products: StoreProduct[];
  categories: string[];
}> {
  try {
    const where: any = {
      tenantId,
      status: { in: ['ACTIVE', 'OUT_OF_STOCK'] },
    };

    if (category && category !== 'all') {
      where.OR = [
        { category: { equals: category, mode: 'insensitive' } },
        { subcategory: { equals: category, mode: 'insensitive' } },
      ];
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
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

    if (dbProducts.length > 0) {
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
    }
  } catch {
    // Database offline, fall back to Aura products
  }

  // Fallback to Aura Luxe Boutique seed products
  let filtered = [...AURA_PRODUCTS];

  if (category && category !== 'all') {
    filtered = filtered.filter(
      (p) =>
        p.category?.toLowerCase() === category.toLowerCase() ||
        p.subcategory?.toLowerCase() === category.toLowerCase()
    );
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }

  const allCategories = Array.from(
    new Set(
      AURA_PRODUCTS.flatMap((p) => [p.category, p.subcategory]).filter((c): c is string => Boolean(c))
    )
  );

  return {
    products: filtered,
    categories: allCategories,
  };
}

export async function getStoreProductById(tenantId: string, idOrCode: string): Promise<StoreProduct | null> {
  try {
    const product = await prisma.product.findFirst({
      where: {
        tenantId,
        OR: [{ id: idOrCode.length === 36 ? idOrCode : undefined }, { code: idOrCode }],
      },
    });

    if (product) {
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
    }
  } catch {
    // Database offline
  }

  // Fallback to Aura catalog
  const match = AURA_PRODUCTS.find(
    (p) => p.id === idOrCode || p.code.toLowerCase() === idOrCode.toLowerCase()
  );

  return match || null;
}

