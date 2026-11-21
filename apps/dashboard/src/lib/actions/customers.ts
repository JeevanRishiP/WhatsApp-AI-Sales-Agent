'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Customers                                    ║
// ║                                                               ║
// ║  Customer profile updates, merchant notes/tags, and direct     ║
// ║  WhatsApp messaging from customer cockpit.                    ║
// ║  Every action enforces tenantId from verified session.        ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { getSession, hasRole } from '../auth';
import { updateCustomerDetails } from '../dal/customers';
import { prisma } from '@wcos/db';
import { z } from 'zod';
import { sendWhatsAppTextMessage } from '../whatsapp';

const CUSTOMER_MANAGE_ROLES = ['OWNER', 'STORE_MANAGER', 'SUPPORT_CONCIERGE'] as const;

export interface CustomerActionState {
  error?: string;
  success?: boolean;
  message?: string;
}

const UpdateCustomerSchema = z.object({
  customerId: z.string().min(1),
  customerPhone: z.string().min(1),
  customerName: z.string().max(100).optional(),
  preferredLanguage: z.string().max(20).optional(),
  merchantNotes: z.string().max(2000).optional(),
  merchantTags: z.string().optional(), // Comma-separated
  preferredCategories: z.string().optional(), // Comma-separated
  vipTier: z.string().optional(),
  reason: z.string().max(500).optional(),
});

export async function updateCustomerProfileAction(
  prevState: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const session = await getSession();
  if (!hasRole(session, CUSTOMER_MANAGE_ROLES)) {
    return { error: 'Access denied: Insufficient permissions' };
  }

  const rawData = {
    customerId: formData.get('customerId') as string,
    customerPhone: formData.get('customerPhone') as string,
    customerName: (formData.get('customerName') as string) || undefined,
    preferredLanguage: (formData.get('preferredLanguage') as string) || undefined,
    merchantNotes: (formData.get('merchantNotes') as string) || undefined,
    merchantTags: (formData.get('merchantTags') as string) || undefined,
    preferredCategories: (formData.get('preferredCategories') as string) || undefined,
    vipTier: (formData.get('vipTier') as string) || undefined,
    reason: (formData.get('reason') as string) || undefined,
  };

  const parsed = UpdateCustomerSchema.safeParse(rawData);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid form input' };
  }

  const {
    customerId,
    customerPhone,
    customerName,
    preferredLanguage,
    merchantNotes,
    merchantTags,
    preferredCategories,
    vipTier,
    reason,
  } = parsed.data;

  try {
    const tagsArray = merchantTags
      ? merchantTags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const categoriesArray = preferredCategories
      ? preferredCategories.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;

    await updateCustomerDetails(session.tenantId, customerId, {
      customerName,
      preferredLanguage,
      merchantNotes,
      merchantTags: tagsArray,
      preferredCategories: categoriesArray,
    });

    if (vipTier) {
      await prisma.customer.updateMany({
        where: { tenantId: session.tenantId, phone: customerPhone },
        data: { vipTier },
      });
    }

    // Record immutable audit trail entry
    await prisma.dataRevisionLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'CUSTOMER',
        entityId: customerId,
        action: 'CUSTOMER_UPDATE',
        staffId: session.staffId,
        staffName: session.staffName || 'Staff',
        staffRole: session.role,
        actorType: 'STAFF',
        reason: reason || 'Customer profile notes or preferences updated by staff',
        diffSummary: {
          name: customerName,
          vipTier,
          tags: tagsArray,
        },
      },
    }).catch((err) => console.error('[AuditLog] Failed to record customer update:', err));

    revalidatePath('/customers');
    revalidatePath(`/customers/${encodeURIComponent(customerPhone)}`);
    revalidatePath('/audit');

    return { success: true, message: 'Customer profile updated successfully' };
  } catch (err: any) {
    return { error: err.message || 'Failed to update customer profile' };
  }
}

const SendMessageSchema = z.object({
  customerPhone: z.string().min(5),
  message: z.string().min(1, 'Message cannot be empty').max(4000),
});

export async function sendCustomerDirectMessageAction(
  prevState: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const session = await getSession();
  if (!hasRole(session, CUSTOMER_MANAGE_ROLES)) {
    return { error: 'Access denied: Insufficient permissions' };
  }
  const tenantId = session.tenantId;

  const parsed = SendMessageSchema.safeParse({
    customerPhone: formData.get('customerPhone') as string,
    message: formData.get('message') as string,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid message' };
  }

  const { customerPhone, message } = parsed.data;

  try {
    // 1. Find or create conversation for this customer
    let conversation = await prisma.conversation.findFirst({
      where: {
        tenantId,
        customerPhone,
      },
    });

    if (!conversation) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      conversation = await prisma.conversation.create({
        data: {
          tenantId,
          customerPhone,
          stage: 'HUMAN_HANDOFF',
          language: 'en',
          startedAt: now,
          expiresAt,
          lastMessageAt: now,
          messageCount: 0,
        },
      });
    }

    // 2. Dispatch real-time WhatsApp message via Evolution API
    const dispatchResult = await sendWhatsAppTextMessage({
      tenantId,
      toPhone: customerPhone,
      text: message.trim(),
    });

    if (!dispatchResult.success) {
      return { error: dispatchResult.error || 'Failed to send WhatsApp message' };
    }

    // 3. Insert message as agent with WhatsApp message ID
    await prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'agent',
        content: message.trim(),
        messageType: 'text',
        whatsappMessageId: dispatchResult.messageId || null,
      },
    });

    // 4. Update conversation stats
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        messageCount: { increment: 1 },
      },
    });

    revalidatePath(`/customers/${encodeURIComponent(customerPhone)}`);
    revalidatePath('/conversations');

    return { success: true, message: 'Message sent to customer chat' };
  } catch (err: any) {
    return { error: err.message || 'Failed to send message to customer' };
  }
}
