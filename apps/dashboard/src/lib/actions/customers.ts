'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Customers                                    ║
// ║                                                               ║
// ║  Customer profile updates, merchant notes/tags, and direct     ║
// ║  WhatsApp messaging from customer cockpit.                    ║
// ║  Every action enforces tenantId from verified session.        ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { getTenantId } from '../auth';
import { updateCustomerDetails } from '../dal/customers';
import { prisma } from '@wcos/db';
import { z } from 'zod';

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
});

export async function updateCustomerProfileAction(
  prevState: CustomerActionState,
  formData: FormData
): Promise<CustomerActionState> {
  const tenantId = await getTenantId();

  const rawData = {
    customerId: formData.get('customerId') as string,
    customerPhone: formData.get('customerPhone') as string,
    customerName: (formData.get('customerName') as string) || undefined,
    preferredLanguage: (formData.get('preferredLanguage') as string) || undefined,
    merchantNotes: (formData.get('merchantNotes') as string) || undefined,
    merchantTags: (formData.get('merchantTags') as string) || undefined,
    preferredCategories: (formData.get('preferredCategories') as string) || undefined,
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
  } = parsed.data;

  try {
    const tagsArray = merchantTags
      ? merchantTags.split(',').map((t) => t.trim()).filter(Boolean)
      : undefined;

    const categoriesArray = preferredCategories
      ? preferredCategories.split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;

    await updateCustomerDetails(tenantId, customerId, {
      customerName,
      preferredLanguage,
      merchantNotes,
      merchantTags: tagsArray,
      preferredCategories: categoriesArray,
    });

    revalidatePath('/customers');
    revalidatePath(`/customers/${encodeURIComponent(customerPhone)}`);

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
  const tenantId = await getTenantId();

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

    // 2. Insert message as agent
    await prisma.message.create({
      data: {
        tenantId,
        conversationId: conversation.id,
        role: 'agent',
        content: message.trim(),
        messageType: 'text',
      },
    });

    // 3. Update conversation stats
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
