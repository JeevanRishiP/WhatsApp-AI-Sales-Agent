'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Conversations                               ║
// ║                                                               ║
// ║  WhatsApp inbox management, human handoff resolution,         ║
// ║  and manual merchant messaging.                               ║
// ║  tenantId comes from session — never from user input.         ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { getTenantId } from '../auth';
import { resolveHandoff, reopenConversation } from '../dal/conversations';
import { prisma } from '@wcos/db';
import { z } from 'zod';

export interface ConversationActionState {
  error?: string;
  success?: boolean;
}

export async function resolveHandoffAction(
  conversationId: string,
  assignedTo?: string
): Promise<ConversationActionState> {
  const tenantId = await getTenantId();

  try {
    await resolveHandoff(tenantId, conversationId, assignedTo);
  } catch (err: any) {
    return { error: err.message || 'Failed to resolve handoff' };
  }

  revalidatePath('/conversations');
  return { success: true };
}

export async function reopenConversationAction(
  conversationId: string
): Promise<ConversationActionState> {
  const tenantId = await getTenantId();

  try {
    await reopenConversation(tenantId, conversationId);
  } catch (err: any) {
    return { error: err.message || 'Failed to reopen conversation' };
  }

  revalidatePath('/conversations');
  return { success: true };
}

const ReplySchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(4000),
});

export async function sendAgentReplyAction(
  conversationId: string,
  formData: FormData
): Promise<ConversationActionState> {
  const tenantId = await getTenantId();

  const parsed = ReplySchema.safeParse({
    message: formData.get('message'),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid message' };
  }

  try {
    // Verify conversation belongs to tenant
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });

    if (!conversation) {
      return { error: 'Conversation not found' };
    }

    // Save message with role 'AGENT'
    await prisma.message.create({
      data: {
        tenantId,
        conversationId,
        role: 'AGENT',
        content: parsed.data.message,
        messageType: 'text',
      },
    });

    // Update conversation last message timestamp & message count
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        messageCount: { increment: 1 },
      },
    });
  } catch (err: any) {
    return { error: err.message || 'Failed to send message' };
  }

  revalidatePath('/conversations');
  return { success: true };
}
