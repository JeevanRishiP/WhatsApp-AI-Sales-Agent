import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@wcos/db';
import { z } from 'zod';

// ─── Bulk Stock Adjustment Endpoint ────────────────────────────────
// POST /api/inventory/stock-adjust
// Body: { adjustments: [{ productId, delta, note }] }
//
// delta > 0 = add stock, delta < 0 = remove stock
// Enforces tenantId ownership before updating.

const AdjustmentSchema = z.object({
  adjustments: z
    .array(
      z.object({
        productId: z.string().uuid('Invalid product ID'),
        delta: z.number().int('Delta must be an integer'),
        note: z.string().max(200).optional(),
      })
    )
    .min(1, 'At least one adjustment required')
    .max(50, 'Maximum 50 adjustments per request'),
});

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = AdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { adjustments } = parsed.data;
  const productIds = adjustments.map((a) => a.productId);

  // Verify all products belong to this tenant
  const ownedProducts = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId: session.tenantId },
    select: { id: true, stock: true, name: true },
  });

  const ownedIds = new Set(ownedProducts.map((p) => p.id));
  const unauthorized = productIds.filter((id) => !ownedIds.has(id));
  if (unauthorized.length > 0) {
    return NextResponse.json(
      { error: `Product(s) not found or not owned: ${unauthorized.join(', ')}` },
      { status: 403 }
    );
  }

  // Validate no stock goes below zero
  const stockMap = new Map(ownedProducts.map((p) => [p.id, p.stock]));
  for (const adj of adjustments) {
    const currentStock = stockMap.get(adj.productId) ?? 0;
    if (currentStock + adj.delta < 0) {
      const product = ownedProducts.find((p) => p.id === adj.productId);
      return NextResponse.json(
        {
          error: `Insufficient stock for "${product?.name}". Current: ${currentStock}, requested delta: ${adj.delta}`,
        },
        { status: 422 }
      );
    }
  }

  // Apply all adjustments in a single transaction
  const results = await prisma.$transaction(
    adjustments.map((adj) =>
      prisma.product.update({
        where: { id: adj.productId },
        data: { stock: { increment: adj.delta } },
        select: { id: true, code: true, name: true, stock: true },
      })
    )
  );

  // Log to audit log
  try {
    await prisma.auditLog.createMany({
      data: adjustments.map((adj) => ({
        tenantId: session.tenantId,
        actorId: session.email || 'dashboard_owner',
        actorType: 'HUMAN',
        action: 'STOCK_ADJUSTED',
        resourceId: adj.productId,
        metadata: {
          delta: adj.delta,
          note: adj.note || null,
          performedBy: session.email || 'dashboard_owner',
          timestamp: new Date().toISOString(),
        },
      })),
    });
  } catch {
    // Non-critical — proceed even if audit log fails
  }

  return NextResponse.json({
    success: true,
    updated: results.length,
    products: results,
  });
}
