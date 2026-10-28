// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Conversations                            ║
// ║                                                               ║
// ║  WhatsApp conversation and message viewer.                    ║
// ║  Every query is scoped to tenantId.                           ║
// ╚═══════════════════════════════════════════════════════════════╝

import { prisma, type Prisma, type Conversation, type Message, type ConversationStage } from '@wcos/db';

// ─── Types ────────────────────────────────────────────────────────

export interface ConversationListOptions {
  page?: number;
  limit?: number;
  search?: string;
  stage?: ConversationStage;
  sortBy?: 'newest' | 'oldest' | 'most_messages';
}

interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ConversationWithMessageCount extends Conversation {
  _count: { messages: number };
}

// ─── List Conversations ───────────────────────────────────────────

export async function listConversations(
  tenantId: string,
  opts: ConversationListOptions = {}
): Promise<PaginatedResult<ConversationWithMessageCount>> {
  const page = opts.page || 1;
  const limit = Math.min(opts.limit || 20, 100);
  const skip = (page - 1) * limit;

  const where: Prisma.ConversationWhereInput = { tenantId };

  if (opts.search) {
    where.OR = [{ customerPhone: { contains: opts.search } }];
  }

  if (opts.stage) {
    where.stage = opts.stage;
  }

  let orderBy: Prisma.ConversationOrderByWithRelationInput;
  switch (opts.sortBy) {
    case 'oldest':
      orderBy = { lastMessageAt: 'asc' };
      break;
    case 'most_messages':
      orderBy = { messageCount: 'desc' };
      break;
    default:
      orderBy = { lastMessageAt: 'desc' };
  }

  const [items, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: { _count: { select: { messages: true } } },
    }),
    prisma.conversation.count({ where }),
  ]);

  return {
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ─── Get Conversation with Messages ───────────────────────────────

export interface ConversationDetail extends Conversation {
  messages: Message[];
  customerMemory: {
    customerName: string | null;
    totalOrders: number;
    totalSpent: Prisma.Decimal;
    isRepeatCustomer: boolean;
  } | null;
}

export async function getConversationDetail(
  tenantId: string,
  conversationId: string
): Promise<ConversationDetail | null> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      tenantId, // ← data isolation
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        take: 200, // last 200 messages
      },
    },
  });

  if (!conversation) return null;

  // Fetch associated customer memory
  const customerMemory = await prisma.customerMemory.findFirst({
    where: {
      tenantId,
      customerPhone: conversation.customerPhone,
    },
    select: {
      customerName: true,
      totalOrders: true,
      totalSpent: true,
      isRepeatCustomer: true,
    },
  });

  return {
    ...conversation,
    customerMemory,
  };
}

// ─── Get Human Handoff Queue ──────────────────────────────────────

export async function getHandoffQueue(tenantId: string): Promise<Conversation[]> {
  return prisma.conversation.findMany({
    where: {
      tenantId,
      stage: 'HUMAN_HANDOFF',
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });
}

// ─── Conversation Stats ──────────────────────────────────────────

export interface ConversationStats {
  totalConversations: number;
  activeConversations: number;
  handoffQueue: number;
  avgMessagesPerConversation: number;
  conversationsByStage: Array<{ stage: string; count: number }>;
}

export async function getConversationStats(tenantId: string): Promise<ConversationStats> {
  const [total, active, handoff, avgMessages, byStage] = await Promise.all([
    prisma.conversation.count({ where: { tenantId } }),
    prisma.conversation.count({
      where: {
        tenantId,
        stage: { notIn: ['IDLE'] },
        lastMessageAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.conversation.count({
      where: { tenantId, stage: 'HUMAN_HANDOFF' },
    }),
    prisma.conversation.aggregate({
      where: { tenantId },
      _avg: { messageCount: true },
    }),
    prisma.conversation.groupBy({
      by: ['stage'],
      where: { tenantId },
      _count: true,
    }),
  ]);

  return {
    totalConversations: total,
    activeConversations: active,
    handoffQueue: handoff,
    avgMessagesPerConversation: Math.round(avgMessages._avg.messageCount || 0),
    conversationsByStage: byStage.map((s) => ({
      stage: s.stage,
      count: s._count,
    })),
  };
}

// ─── Handoff & Stage Actions ──────────────────────────────────────

export async function resolveHandoff(
  tenantId: string,
  conversationId: string,
  assignedTo?: string
) {
  return prisma.conversation.updateMany({
    where: {
      id: conversationId,
      tenantId,
    },
    data: {
      stage: 'GREETING',
      handoffReason: null,
      handoffAssignedTo: assignedTo || 'Merchant',
    },
  });
}

export async function reopenConversation(
  tenantId: string,
  conversationId: string
) {
  return prisma.conversation.updateMany({
    where: {
      id: conversationId,
      tenantId,
    },
    data: {
      stage: 'GREETING',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}
