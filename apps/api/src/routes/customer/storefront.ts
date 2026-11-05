import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { CustomerAuthService } from '../../services/customer-auth-service.js';

export const customerStorefrontRoutes: FastifyPluginAsync = async (server) => {
  /**
   * Public store profile, brand colors, typography style, and shopping policies.
   */
  server.get<{
    Params: { slug: string };
  }>('/api/v1/customer/store/:slug', async (request, reply) => {
    const { slug } = request.params;

    try {
      const tenant = await CustomerAuthService.resolveTenant(slug);

      return reply.send({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug || tenant.whatsappInstanceName,
        businessCategory: tenant.businessCategory,
        whatsappPhoneNumber: tenant.whatsappPhoneNumber,
        whatsappInstanceName: tenant.whatsappInstanceName,
        storefrontTheme: tenant.storefrontTheme || {
          primaryColor: '#0C0C0C',
          accentColor: '#C5A880',
          fontStyle: 'serif',
        },
        storePolicies: tenant.storePolicies || {
          allowAddressChangeUntil: 'SHIPPED',
          allowCancelUntil: 'PROCESSING',
        },
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'StoreNotFound',
        message: err.message,
      });
    }
  });

  /**
   * Public product catalog with category filter, search, and stock indicators.
   */
  server.get<{
    Params: { slug: string };
    Querystring: {
      category?: string;
      search?: string;
      page?: string;
      limit?: string;
    };
  }>('/api/v1/customer/store/:slug/catalog', async (request, reply) => {
    const { slug } = request.params;
    const { category, search, page = '1', limit = '24' } = request.query;

    try {
      const tenant = await CustomerAuthService.resolveTenant(slug);

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        tenantId: tenant.id,
        status: 'ACTIVE',
      };

      if (category && category !== 'all') {
        where.category = { equals: category, mode: 'insensitive' };
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [products, totalCount, categories] = await Promise.all([
        prisma.product.findMany({
          where,
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            category: true,
            subcategory: true,
            price: true,
            salePrice: true,
            currency: true,
            stock: true,
            reserved: true,
            imageUrls: true,
            thumbnailUrl: true,
            tags: true,
            attributes: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.product.count({ where }),
        prisma.product.findMany({
          where: { tenantId: tenant.id, status: 'ACTIVE' },
          select: { category: true },
          distinct: ['category'],
        }),
      ]);

      const availableCategories = categories
        .map((c) => c.category)
        .filter((c): c is string => Boolean(c));

      return reply.send({
        products: products.map((p) => ({
          ...p,
          price: Number(p.price),
          salePrice: p.salePrice ? Number(p.salePrice) : null,
          availableStock: Math.max(0, p.stock - p.reserved),
          isLowStock: p.stock - p.reserved <= 5 && p.stock - p.reserved > 0,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitNum),
        },
        categories: availableCategories,
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'StoreNotFound',
        message: err.message,
      });
    }
  });

  /**
   * Single product lookbook detail page.
   */
  server.get<{
    Params: { slug: string; id: string };
  }>('/api/v1/customer/store/:slug/products/:id', async (request, reply) => {
    const { slug, id } = request.params;

    try {
      const tenant = await CustomerAuthService.resolveTenant(slug);

      const product = await prisma.product.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [{ id: id.length === 36 ? id : undefined }, { code: id }],
        },
      });

      if (!product) {
        return reply.status(404).send({ error: 'Product not found' });
      }

      return reply.send({
        product: {
          ...product,
          price: Number(product.price),
          salePrice: product.salePrice ? Number(product.salePrice) : null,
          availableStock: Math.max(0, product.stock - product.reserved),
        },
      });
    } catch (err: any) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'StoreNotFound',
        message: err.message,
      });
    }
  });
};

