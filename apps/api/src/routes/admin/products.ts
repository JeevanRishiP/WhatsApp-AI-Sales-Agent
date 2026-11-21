import { type FastifyPluginAsync } from 'fastify';
import { prisma } from '@wcos/db';
import { requireAdminAuth } from '../../middleware/auth.js';
import {
  CreateProductSchema,
  ProductFilterSchema,
  ProductCSVRowSchema,
} from '@wcos/types';
import { parse } from 'csv-parse/sync';

interface TenantProductParams {
  tenantId: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeSkuCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export const productAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAdminAuth);

  // POST /admin/tenants/:tenantId/products — Create product
  fastify.post<{ Params: TenantProductParams }>(
    '/admin/tenants/:tenantId/products',
    async (request, reply) => {
      const { tenantId } = request.params;
      if (!UUID_REGEX.test(tenantId)) {
        return reply.status(400).send({ error: 'Invalid tenant ID' });
      }
      const parsed = CreateProductSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parsed.error.format(),
        });
      }

      const {
        code,
        name,
        description,
        category,
        subcategory,
        price,
        salePrice,
        currency,
        stock,
        attributes,
        tags,
        imageUrls,
        status,
      } = parsed.data;

      // Check unique code per tenant
      const existing = await prisma.product.findUnique({
        where: {
          tenantId_code: { tenantId, code },
        },
      });

      if (existing) {
        return reply.status(409).send({
          error: `Product with code '${code}' already exists for this tenant`,
        });
      }

      const product = await prisma.product.create({
        data: {
          tenantId,
          code,
          codeNormalized: normalizeSkuCode(code),
          name,
          description,
          category,
          subcategory,
          price,
          salePrice,
          currency: currency || 'INR',
          stock: stock || 0,
          attributes: attributes || {},
          tags: tags || [],
          imageUrls: imageUrls || [],
          status: status || 'ACTIVE',
        },
      });

      return reply.status(201).send(product);
    }
  );

  // GET /admin/tenants/:tenantId/products — Search & list products
  fastify.get<{ Params: TenantProductParams }>(
    '/admin/tenants/:tenantId/products',
    async (request, reply) => {
      const { tenantId } = request.params;
      if (!UUID_REGEX.test(tenantId)) {
        return reply.status(400).send({ error: 'Invalid tenant ID' });
      }
      const filterResult = ProductFilterSchema.safeParse(request.query);
      const filter = filterResult.success ? filterResult.data : ProductFilterSchema.parse({});
      const page = filter.page;
      const limit = filter.limit;
      const skip = (page - 1) * limit;

      const where: any = {
        tenantId,
      };

      if (filter.category) {
        where.category = { equals: filter.category, mode: 'insensitive' };
      }
      if (filter.subcategory) {
        where.subcategory = { equals: filter.subcategory, mode: 'insensitive' };
      }
      if (filter.status) {
        where.status = filter.status;
      }
      if (filter.inStock) {
        where.stock = { gt: 0 };
      }
      if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
        where.price = {};
        if (filter.minPrice !== undefined) where.price.gte = filter.minPrice;
        if (filter.maxPrice !== undefined) where.price.lte = filter.maxPrice;
      }
      if (filter.query) {
        where.OR = [
          { name: { contains: filter.query, mode: 'insensitive' } },
          { description: { contains: filter.query, mode: 'insensitive' } },
          { code: { contains: filter.query, mode: 'insensitive' } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.product.count({ where }),
      ]);

      return reply.send({
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
  );

  // POST /admin/tenants/:tenantId/products/import-csv — Bulk CSV import
  fastify.post<{ Params: TenantProductParams }>(
    '/admin/tenants/:tenantId/products/import-csv',
    async (request, reply) => {
      const { tenantId } = request.params;
      if (!UUID_REGEX.test(tenantId)) {
        return reply.status(400).send({ error: 'Invalid tenant ID' });
      }
      const rawBody = (request.body as { csvContent?: string })?.csvContent || (request.rawBody as string);

      if (!rawBody || typeof rawBody !== 'string') {
        return reply.status(400).send({
          error: 'Please provide csvContent in request body or as raw CSV payload',
        });
      }

      let records: any[];
      try {
        records = parse(rawBody, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
      } catch (err: any) {
        return reply.status(400).send({
          error: 'Failed to parse CSV',
          details: err.message,
        });
      }

      const successful: string[] = [];
      const errors: Array<{ row: number; error: any }> = [];
      const validRows: Array<{
        rowNum: number;
        data: typeof ProductCSVRowSchema._type;
        imageUrls: string[];
        tags: string[];
      }> = [];

      for (let i = 0; i < records.length; i++) {
        const parsed = ProductCSVRowSchema.safeParse(records[i]);
        if (!parsed.success) {
          errors.push({ row: i + 1, error: parsed.error.format() });
          continue;
        }
        const data = parsed.data;
        const imageUrls = data.imageUrls
          ? data.imageUrls.split(',').map((u) => u.trim()).filter(Boolean)
          : [];
        const tags = data.tags
          ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [];
        validRows.push({ rowNum: i + 1, data, imageUrls, tags });
      }

      const CHUNK_SIZE = 50;
      for (let start = 0; start < validRows.length; start += CHUNK_SIZE) {
        const chunk = validRows.slice(start, start + CHUNK_SIZE);
        try {
          const results = await prisma.$transaction(
            chunk.map(({ data, imageUrls, tags }) =>
              prisma.product.upsert({
                where: { tenantId_code: { tenantId, code: data.code } },
                create: {
                  tenantId,
                  code: data.code,
                  codeNormalized: normalizeSkuCode(data.code),
                  name: data.name,
                  description: data.description,
                  category: data.category,
                  subcategory: data.subcategory,
                  price: data.price,
                  salePrice: data.salePrice,
                  stock: data.stock,
                  imageUrls,
                  tags,
                  status: 'ACTIVE',
                },
                update: {
                  codeNormalized: normalizeSkuCode(data.code),
                  name: data.name,
                  description: data.description,
                  category: data.category,
                  subcategory: data.subcategory,
                  price: data.price,
                  salePrice: data.salePrice,
                  stock: data.stock,
                  imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
                  tags: tags.length > 0 ? tags : undefined,
                },
                select: { id: true },
              })
            )
          );
          for (const res of results) {
            successful.push(res.id);
          }
        } catch (err: any) {
          for (const item of chunk) {
            errors.push({ row: item.rowNum, error: err.message });
          }
        }
      }

      return reply.send({
        totalRows: records.length,
        importedCount: successful.length,
        errorCount: errors.length,
        errors: errors.slice(0, 20), // return up to 20 errors
      });
    }
  );
};
