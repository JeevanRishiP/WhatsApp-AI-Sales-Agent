import { NextRequest, NextResponse } from 'next/server';
import { verifySession, hasRole } from '@/lib/auth';
import { prisma } from '@wcos/db';
import { z } from 'zod';

// ─── Atomic Bulk Stock Adjustment Endpoint ────────────────────────
// POST /api/inventory/stock-adjust
// Aggregates duplicate productId deltas and applies conditional SQL updates atomically.

const AdjustmentSchema = z.object({
  adjustments: z
    .array(
      z.object({
        productId: z.string().uuid('Invalid product ID'),
        delta: z.number().int('Delta must be an integer').min(-10000).max(10000),
        note: z.string().max(200).optional(),
      })
    )
    .min(1, 'At least one adjustment required')
    .max(50, 'Maximum 50 adjustments per request'),
});

export async function POST(req: NextRequest) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER', 'FULFILLMENT_LEAD'])) {
    return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
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

  // Aggregate duplicate productId entries into net deltas
  const aggregated = new Map<string, { netDelta: number; notes: string[] }>();
  for (const adj of parsed.data.adjustments) {
    const prev = aggregated.get(adj.productId) || { netDelta: 0, notes: [] };
    prev.netDelta += adj.delta;
    if (adj.note) prev.notes.push(adj.note);
    aggregated.set(adj.productId, prev);
  }

  const productIds = Array.from(aggregated.keys());

  try {
    const results = await prisma.$transaction(async (tx) => {
      const ownedProducts = await tx.product.findMany({
        where: { id: { in: productIds }, tenantId: session.tenantId },
        select: { id: true, name: true, stock: true, status: true },
      });

      if (ownedProducts.length !== productIds.length) {
        throw new Error('OWNERSHIP_OR_NOT_FOUND');
      }

      const updatedProducts: Array<{
        id: string;
        code: string;
        name: string;
        stock: number;
        status: string;
      }> = [];

      for (const product of ownedProducts) {
        const entry = aggregated.get(product.id)!;
        const delta = entry.netDelta;
        if (delta === 0) continue;

        // Conditional atomic update guarantees stock never drops below zero or reserved under concurrency
        const affected = await tx.$executeRaw`
          UPDATE "Product"
          SET stock = stock + ${delta},
              status = CASE
                WHEN stock + ${delta} = 0 AND status = 'ACTIVE' THEN 'OUT_OF_STOCK'::"ProductStatus"
                WHEN stock + ${delta} > 0 AND status = 'OUT_OF_STOCK' THEN 'ACTIVE'::"ProductStatus"
                ELSE status
              END,
              "updatedAt" = NOW()
          WHERE id = ${product.id}::uuid
            AND "tenantId" = ${session.tenantId}::uuid
            AND stock + ${delta} >= reserved
            AND stock + ${delta} >= 0
        `;

        if (affected !== 1) {
          throw new Error(`INSUFFICIENT_STOCK:${product.name}`);
        }

        const refreshed = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { id: true, code: true, name: true, stock: true, status: true },
        });
        updatedProducts.push(refreshed);
      }

      await tx.auditLog.createMany({
        data: parsed.data.adjustments.map((adj) => ({
          tenantId: session.tenantId,
          actorId: session.staffId || session.email || 'dashboard_staff',
          actorType: 'HUMAN',
          action: 'STOCK_ADJUSTED',
          resourceId: adj.productId,
          metadata: {
            delta: adj.delta,
            note: adj.note || null,
            performedBy: session.email,
            role: session.role,
            timestamp: new Date().toISOString(),
          },
        })),
      });

      return updatedProducts;
    });

    return NextResponse.json({
      success: true,
      updated: results.length,
      products: results,
    });
  } catch (err: any) {
    if (err.message === 'OWNERSHIP_OR_NOT_FOUND') {
      return NextResponse.json({ error: 'One or more products not found or unauthorized' }, { status: 403 });
    }
    if (typeof err.message === 'string' && err.message.startsWith('INSUFFICIENT_STOCK:')) {
      const name = err.message.slice('INSUFFICIENT_STOCK:'.length);
      return NextResponse.json(
        { error: `Insufficient available stock for "${name}" after accounting for active reservations.` },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: 'Stock adjustment failed' }, { status: 500 });
  }
}
