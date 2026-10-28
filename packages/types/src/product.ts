import { z } from 'zod';

/**
 * Product schemas — Catalog data shapes
 *
 * Products are fully generic — they work for sarees, jewelry,
 * clothing, electronics, or any product type.
 * The `attributes` field is a flexible JSON object for
 * category-specific metadata (fabric, color, size, weight, etc.)
 */

export const ProductStatusSchema = z.enum([
  'ACTIVE',       // visible and purchasable
  'DRAFT',        // not yet published
  'OUT_OF_STOCK', // temporarily unavailable
  'ARCHIVED',     // soft-deleted
]);

export type ProductStatus = z.infer<typeof ProductStatusSchema>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50),              // unique per tenant, e.g., "KAN-2047"
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  price: z.number().nonnegative(),
  salePrice: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('INR'),
  stock: z.number().int().nonnegative().default(0),
  reserved: z.number().int().nonnegative().default(0),  // soft-reserved during checkout
  lowStockThreshold: z.number().int().nonnegative().default(5),
  imageUrls: z.array(z.string().url()).default([]),
  thumbnailUrl: z.string().url().optional(),
  attributes: z.record(z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ])).default({}),
  tags: z.array(z.string().max(50)).default([]),
  status: ProductStatusSchema.default('ACTIVE'),
  searchText: z.string().optional(),             // denormalized for full-text search
  embeddingText: z.string().optional(),           // text used to generate embedding vector
  weight: z.number().nonnegative().optional(),    // in grams, for shipping
  dimensions: z.object({
    length: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CreateProductSchema = ProductSchema.omit({
  id: true,
  tenantId: true,
  reserved: true,
  searchText: true,
  embeddingText: true,
  createdAt: true,
  updatedAt: true,
});

export type CreateProduct = z.infer<typeof CreateProductSchema>;

// ─── Product search / filter schemas ──────────────────────────────

export const ProductFilterSchema = z.object({
  query: z.string().max(200).optional(),           // free text search
  category: z.string().optional(),
  subcategory: z.string().optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  attributes: z.record(z.union([
    z.string(),
    z.array(z.string()),
  ])).optional(),
  tags: z.array(z.string()).optional(),
  status: ProductStatusSchema.optional(),
  inStock: z.boolean().optional(),
  sortBy: z.enum(['price_asc', 'price_desc', 'newest', 'name', 'relevance']).default('relevance'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(10),
});

export type ProductFilter = z.infer<typeof ProductFilterSchema>;

// ─── CSV import schema ────────────────────────────────────────────

export const ProductCSVRowSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  price: z.coerce.number().nonnegative(),
  salePrice: z.coerce.number().nonnegative().optional(),
  stock: z.coerce.number().int().nonnegative().default(0),
  imageUrls: z.string().optional(),  // comma-separated URLs
  tags: z.string().optional(),       // comma-separated tags
});

export type ProductCSVRow = z.infer<typeof ProductCSVRowSchema>;
