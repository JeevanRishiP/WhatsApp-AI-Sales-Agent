'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Orders                                      ║
// ║                                                               ║
// ║  Order status management and tracking updates.                ║
// ║  tenantId comes from session — never from user input.         ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { getSession, hasRole } from '@/lib/auth';
import {
  updateOrderStatus,
  updateTracking,
  addInternalNote,
  generateBillAndAwb,
} from '@/lib/dal/orders';
import { type CourierPartner } from '@/lib/shipping/logistics-service';
import { prisma } from '@wcos/db';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SENSITIVE_ORDER_STATUSES = new Set([
  'PAYMENT_CONFIRMED',
  'CANCELLED',
  'REFUND_INITIATED',
  'REFUNDED',
]);

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
  reason: z.string().max(500).optional(),
});

export async function updateOrderStatusAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const session = await getSession();
  if (!UUID_REGEX.test(orderId)) {
    return { error: 'Invalid order ID' };
  }

  const parsed = StatusUpdateSchema.safeParse({
    status: formData.get('status'),
    note: formData.get('note') || undefined,
    reason: formData.get('reason') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  if (SENSITIVE_ORDER_STATUSES.has(parsed.data.status)) {
    if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
      return { error: 'Access denied: Only Owner or Store Manager can confirm payments, cancel, or refund orders' };
    }
  } else if (!hasRole(session, ['OWNER', 'STORE_MANAGER', 'FULFILLMENT_LEAD'])) {
    return { error: 'Access denied: Insufficient permissions to update order fulfillment status' };
  }

  try {
    await updateOrderStatus(
      session.tenantId,
      orderId,
      parsed.data.status,
      parsed.data.note,
      {
        staffId: session.staffId,
        staffName: session.staffName || 'Staff',
        staffRole: session.role,
        reason: parsed.data.reason || parsed.data.note || `Status transitioned to ${parsed.data.status}`,
      }
    );
  } catch (err: any) {
    return { error: err.message || 'Failed to update status' };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/audit');
  return { success: true };
}

// ─── Update Tracking ──────────────────────────────────────────────

const TrackingSchema = z.object({
  trackingNumber: z.string().min(1, 'Tracking number is required').max(100),
  trackingUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  courier: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export async function updateTrackingAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER', 'FULFILLMENT_LEAD'])) {
    return { error: 'Access denied: Insufficient permissions to update tracking' };
  }
  if (!UUID_REGEX.test(orderId)) {
    return { error: 'Invalid order ID' };
  }

  const parsed = TrackingSchema.safeParse({
    trackingNumber: formData.get('trackingNumber'),
    trackingUrl: formData.get('trackingUrl') || undefined,
    courier: formData.get('courier') || undefined,
    reason: formData.get('reason') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    await updateTracking(
      session.tenantId,
      orderId,
      parsed.data.trackingNumber,
      parsed.data.trackingUrl || undefined,
      {
        staffId: session.staffId,
        staffName: session.staffName || 'Fulfillment',
        staffRole: session.role,
        reason: parsed.data.reason || `Assigned tracking ${parsed.data.trackingNumber}`,
      }
    );
  } catch (err: any) {
    return { error: err.message || 'Failed to update tracking' };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  revalidatePath('/audit');
  return { success: true };
}

// ─── Add Internal Note ────────────────────────────────────────────

export async function addNoteAction(
  orderId: string,
  _prev: OrderActionState,
  formData: FormData
): Promise<OrderActionState> {
  const session = await getSession();

  const note = formData.get('note') as string;
  if (!note || note.trim().length === 0) {
    return { error: 'Note cannot be empty' };
  }

  if (note.length > 1000) {
    return { error: 'Note is too long (max 1000 characters)' };
  }

  try {
    await addInternalNote(session.tenantId, orderId, note.trim(), {
      staffId: session.staffId,
      staffName: session.staffName || 'Staff',
      staffRole: session.role,
    });
  } catch (err: any) {
    return { error: err.message || 'Failed to add note' };
  }

  revalidatePath('/orders');
  revalidatePath(`/orders/${orderId}`);
  return { success: true };
}

export const addInternalNoteAction = addNoteAction;

// ─── Assign Staff to Order ────────────────────────────────────────

export async function assignStaffAction(
  orderId: string,
  staffId: string
): Promise<OrderActionState> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER', 'FULFILLMENT_LEAD'])) {
    return { error: 'Access denied: Insufficient permissions to assign staff' };
  }
  if (!UUID_REGEX.test(orderId) || !UUID_REGEX.test(staffId)) {
    return { error: 'Invalid order or staff identifier' };
  }

  try {
    // Strictly enforce tenant ownership of BOTH target staff user and order
    const staff = await prisma.staffUser.findFirst({
      where: { id: staffId, tenantId: session.tenantId, status: 'ACTIVE' },
    });
    if (!staff) {
      return { error: 'Staff member not found or inactive in your store' };
    }

    const orderResult = await prisma.order.updateMany({
      where: { id: orderId, tenantId: session.tenantId },
      data: { assignedStaffId: staff.id },
    });
    if (orderResult.count === 0) {
      return { error: 'Order not found' };
    }

    await prisma.dataRevisionLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'ORDER',
        entityId: orderId,
        action: 'NOTE_ADDED',
        staffId: session.staffId,
        staffName: session.staffName || 'Staff',
        staffRole: session.role,
        reason: `Assigned order handling to ${staff.fullName}`,
        diffSummary: { assignedStaffId: { to: staff.id } },
      },
    });
  } catch (err: any) {
    return { error: err.message || 'Failed to assign staff' };
  }

  revalidatePath('/orders');
  revalidatePath('/audit');
  return { success: true };
}

// ─── Generate Bill & Link Delivery Partner (DTDC / Delhivery) ─────

export async function generateBillAndAwbAction(
  orderId: string,
  courierPartner: CourierPartner = 'DELHIVERY'
): Promise<OrderActionState & { awbCode?: string; trackingUrl?: string }> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER', 'FULFILLMENT_LEAD'])) {
    return { error: 'Access denied: Insufficient permissions to dispatch orders' };
  }
  if (!UUID_REGEX.test(orderId)) {
    return { error: 'Invalid order ID' };
  }

  try {
    const { consignment } = await generateBillAndAwb(
      session.tenantId,
      orderId,
      courierPartner,
      {
        staffId: session.staffId,
        staffName: session.staffName || 'Packing Staff',
        staffRole: session.role,
      }
    );

    revalidatePath('/orders');
    revalidatePath(`/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}/bill`);
    revalidatePath('/audit');

    return {
      success: true,
      awbCode: consignment.awbCode,
      trackingUrl: consignment.trackingUrl,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to generate bill and AWB' };
  }
}

// ─── Simulate Razorpay Payment (Sandbox) ───────────────────────────

export async function simulateRazorpayPaymentAction(
  orderId: string
): Promise<OrderActionState> {
  if (
    process.env['NODE_ENV'] === 'production' ||
    process.env['ENABLE_PAYMENT_SIMULATOR'] !== 'true'
  ) {
    return { error: 'Payment simulation is disabled in this environment' };
  }

  const session = await getSession();
  if (session.role !== 'OWNER' && session.role !== 'STORE_MANAGER') {
    return { error: 'Access denied: Insufficient permissions to confirm payment' };
  }
  const tenantId = session.tenantId;

  try {
    const { prisma } = await import('@wcos/db');
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) {
      return { error: 'Order not found' };
    }

    const apiUrl = (
      process.env['API_URL'] ||
      process.env['APP_BASE_URL'] ||
      'http://localhost:3002'
    ).replace(/\/+$/, '');
    try {
      const res = await fetch(`${apiUrl}/payments/checkout/${order.id}/simulate`, {
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
