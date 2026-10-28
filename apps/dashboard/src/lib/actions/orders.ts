'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Orders                                      ║
// ║                                                               ║
// ║  Order status management and tracking updates.                ║
// ║  tenantId comes from session — never from user input.         ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { getTenantId } from '@/lib/auth';
import {
  updateOrderStatus,
  updateTracking,
  addInternalNote,
} from '@/lib/dal/orders';
import { z } from 'zod';

export interface OrderActionState {
  error?: string;
  success?: boolean;
}

// ─── Update Order Status ──────────────────────────────────────────

const StatusUpdateSchema = z.object({
  status: z.enum([
    'PENDING_PAYMENT',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUND_INITIATED',
    'REFUNDED',
  ]),
  note: z.string().max(500).optional(),
});

export async function updateOrderStatusAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const tenantId = await getTenantId();

  const parsed = StatusUpdateSchema.safeParse({
    status: formData.get('status'),
    note: formData.get('note') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    await updateOrderStatus(tenantId, orderId, parsed.data.status, parsed.data.note);
  } catch (err: any) {
    return { error: err.message || 'Failed to update status' };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}

// ─── Update Tracking ──────────────────────────────────────────────

const TrackingSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required').max(100),
  trackingUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export async function updateTrackingAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const tenantId = await getTenantId();

  const parsed = TrackingSchema.safeParse({
    trackingNumber: formData.get('trackingNumber'),
    trackingUrl: formData.get('trackingUrl') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    await updateTracking(
      tenantId,
      orderId,
      parsed.data.trackingNumber,
      parsed.data.trackingUrl || undefined
    );
  } catch (err: any) {
    return { error: err.message || 'Failed to update tracking' };
  }

  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}

// ─── Add Internal Note ────────────────────────────────────────────

export async function addNoteAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const tenantId = await getTenantId();

  const note = formData.get('note') as string;
  if (!note || note.trim().length === 0) {
    return { error: 'Note cannot be empty' };
  }

  if (note.length > 1000) {
    return { error: 'Note is too long (max 1000 characters)' };
  }

  try {
    await addInternalNote(tenantId, orderId, note.trim());
  } catch (err: any) {
    return { error: err.message || 'Failed to add note' };
  }

  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}

export const addInternalNoteAction = addNoteAction;

// ─── Simulate Razorpay Payment (Sandbox) ───────────────────────────

export async function simulateRazorpayPaymentAction(
  orderId: string
): Promise<OrderActionState> {
  const tenantId = await getTenantId();

  try {
    const apiUrl = (
      process.env['API_URL'] ||
      process.env['APP_BASE_URL'] ||
      'http://localhost:3002'
    ).replace(/\/+$/, '');
    try {
      const res = await fetch(`${apiUrl}/payments/checkout/${orderId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'upi' }),
      });
      if (res.ok) {
        revalidatePath('/orders');
        revalidatePath(`/orders/${orderId}`);
        return { success: true };
      }
    } catch {
      // Fallback to direct DB transaction if API server is not running
    }

    // 2. Direct atomic confirmation fallback via Prisma
    const { prisma } = await import('@wcos/db');
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) {
      return { error: 'Order not found' };
    }

    const paymentId = `pay_test_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
    const razorpayOrderId = order.razorpayOrderId || `order_test_${order.id.slice(0, 8)}`;

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'PAYMENT_CONFIRMED',
          paymentMethod: 'RAZORPAY_ONLINE',
          razorpayPaymentId: paymentId,
          razorpayOrderId,
          statusHistory: [
            ...((order.statusHistory as any[]) || []),
            {
              status: 'PAYMENT_CONFIRMED',
              timestamp: new Date(),
              updatedBy: 'merchant_dashboard_sandbox',
              note: `Simulated payment captured via UPI (Payment ID: ${paymentId})`,
            },
          ],
        },
      });

      if (order.reservationId) {
        const reservation = await tx.inventoryReservation.findUnique({
          where: { id: order.reservationId },
        });

        if (reservation && reservation.status === 'ACTIVE') {
          await tx.inventoryReservation.update({
            where: { id: reservation.id },
            data: { status: 'COMMITTED' },
          });

          const items = Array.isArray(reservation.items)
            ? (reservation.items as Array<{ productId: string; quantity: number }>)
            : [];

          for (const it of items) {
            if (it.productId && typeof it.quantity === 'number') {
              await tx.product.update({
                where: { id: it.productId },
                data: {
                  stock: { decrement: it.quantity },
                  reserved: { decrement: it.quantity },
                },
              });
            }
          }
        }
      }
    });

    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to simulate payment' };
  }
}
