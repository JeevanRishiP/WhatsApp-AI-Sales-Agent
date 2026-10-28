'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Products                                    ║
// ║                                                               ║
// ║  CRUD operations for inventory management.                    ║
// ║  tenantId comes from session — never from user input.         ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTenantId } from '@/lib/auth';
import {
  createProduct,
  updateProduct,
  archiveProduct,
  updateStock,
  type CreateProductInput,
  type UpdateProductInput,
} from '@/lib/dal/products';
import { z } from 'zod';

// ─── Validation Schemas ───────────────────────────────────────────

const ProductFormSchema = z.object({
  code: z.string().min(1, 'Product code is required').max(50),
  name: z.string().min(1, 'Product name is required').max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  price: z.coerce.number().nonnegative('Price must be positive'),
  salePrice: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.string().length(3).default('INR'),
  stock: z.coerce.number().int().nonnegative().default(0),
  lowStockThreshold: z.coerce.number().int().nonnegative().default(5),
  tags: z.string().optional(), // comma-separated
  status: z.enum(['ACTIVE', 'DRAFT', 'OUT_OF_STOCK', 'ARCHIVED']).default('ACTIVE'),
});

// ─── Create Product ───────────────────────────────────────────────

export interface ProductActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  success?: boolean;
}

export async function createProductAction(
  _prev: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const tenantId = await getTenantId();

  const rawData = {
    code: formData.get('code'),
    name: formData.get('name'),
    description: formData.get('description') || undefined,
    category: formData.get('category') || undefined,
    subcategory: formData.get('subcategory') || undefined,
    price: formData.get('price'),
    salePrice: formData.get('salePrice') || undefined,
    currency: formData.get('currency') || 'INR',
    stock: formData.get('stock') || 0,
    lowStockThreshold: formData.get('lowStockThreshold') || 5,
    tags: formData.get('tags') || undefined,
    status: formData.get('status') || 'ACTIVE',
  };

  const parsed = ProductFormSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const input: CreateProductInput = {
    ...parsed.data,
    salePrice: parsed.data.salePrice ?? undefined,
    tags: parsed.data.tags ? parsed.data.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
  };

  try {
    await createProduct(tenantId, input);
  } catch (err: any) {
    return { error: err.message || 'Failed to create product' };
  }

  revalidatePath('/inventory');
  redirect('/inventory');
}

// ─── Update Product ───────────────────────────────────────────────

export async function updateProductAction(
  productId: string,
  _prev: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const tenantId = await getTenantId();

  const UpdateSchema = ProductFormSchema.partial().omit({ code: true });

  const rawData: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (value !== '' && value !== null) {
      rawData[key] = value;
    }
  }

  const parsed = UpdateSchema.safeParse(rawData);

  if (!parsed.success) {
    return {
      error: 'Validation failed',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const input: UpdateProductInput = {
    ...parsed.data,
    salePrice: parsed.data.salePrice ?? undefined,
    tags: parsed.data.tags ? parsed.data.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
  };

  try {
    await updateProduct(tenantId, productId, input);
  } catch (err: any) {
    return { error: err.message || 'Failed to update product' };
  }

  revalidatePath('/inventory');
  revalidatePath(`/inventory/${productId}`);
  return { success: true };
}

// ─── Archive Product ──────────────────────────────────────────────

export async function archiveProductAction(productId: string): Promise<ProductActionState> {
  const tenantId = await getTenantId();

  try {
    await archiveProduct(tenantId, productId);
  } catch (err: any) {
    return { error: err.message || 'Failed to archive product' };
  }

  revalidatePath('/inventory');
  return { success: true };
}

// ─── Quick Stock Update ───────────────────────────────────────────

export async function updateStockAction(
  productId: string,
  newStock: number
): Promise<ProductActionState> {
  const tenantId = await getTenantId();

  if (newStock < 0) {
    return { error: 'Stock cannot be negative' };
  }

  try {
    await updateStock(tenantId, productId, newStock);
  } catch (err: any) {
    return { error: err.message || 'Failed to update stock' };
  }

  revalidatePath('/inventory');
  revalidatePath(`/inventory/${productId}`);
  return { success: true };
}

// ─── Bulk CSV Import ──────────────────────────────────────────────

export interface BulkImportState {
  error?: string;
  importedCount?: number;
  success?: boolean;
}

export async function bulkImportProductsAction(
  csvContent: string
): Promise<BulkImportState> {
  const tenantId = await getTenantId();

  if (!csvContent || csvContent.trim().length === 0) {
    return { error: 'CSV content is empty' };
  }

  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { error: 'CSV must contain a header row and at least one item row' };
  }

  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const codeIdx = header.indexOf('code');
  const nameIdx = header.indexOf('name');
  const priceIdx = header.indexOf('price');
  const stockIdx = header.indexOf('stock');
  const catIdx = header.indexOf('category');
  const descIdx = header.indexOf('description');

  if (codeIdx === -1 || nameIdx === -1 || priceIdx === -1) {
    return { error: 'CSV must contain at least "code", "name", and "price" columns in the header' };
  }

  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const rawCells = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const code = rawCells[codeIdx];
    const name = rawCells[nameIdx];
    const price = parseFloat(rawCells[priceIdx]);
    const stock = stockIdx !== -1 ? parseInt(rawCells[stockIdx], 10) || 0 : 0;
    const category = catIdx !== -1 ? rawCells[catIdx] : undefined;
    const description = descIdx !== -1 ? rawCells[descIdx] : undefined;

    if (!code || !name || isNaN(price) || price < 0) continue;

    try {
      await createProduct(tenantId, {
        code,
        name,
        price,
        stock,
        category,
        description,
        currency: 'INR',
        status: 'ACTIVE',
        lowStockThreshold: 5,
      });
      imported++;
    } catch {
      // If SKU already exists or duplicate, continue to next row
    }
  }

  revalidatePath('/inventory');
  return { success: true, importedCount: imported };
}
