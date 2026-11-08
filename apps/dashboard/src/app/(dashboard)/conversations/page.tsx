import { getSession } from '../../../lib/auth';
import {
  listConversations,
  getHandoffQueue,
  getConversationDetail,
} from '../../../lib/dal';
import { prisma } from '@wcos/db';
import { ConversationsClient } from './ConversationsClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ConversationsPageProps {
  searchParams: {
    id?: string;
  };
}

export default async function ConversationsPage({ searchParams }: ConversationsPageProps) {
  const session = await getSession();

  const [conversationsResult, handoffQueue] = await Promise.all([
    listConversations(session.tenantId, { limit: 50, sortBy: 'newest' }),
    getHandoffQueue(session.tenantId),
  ]);

  const targetId =
    searchParams.id ||
    handoffQueue[0]?.id ||
    conversationsResult.items[0]?.id;

  let selectedConversation = null;
  if (targetId) {
    selectedConversation = await getConversationDetail(session.tenantId, targetId);
  }

  // Fetch customer memory for all conversations to display customer names in threads
  const allPhones = Array.from(
    new Set([
      ...conversationsResult.items.map((c) => c.customerPhone),
      ...handoffQueue.map((c) => c.customerPhone),
    ])
  );

  const memories = await prisma.customerMemory.findMany({
    where: {
      tenantId: session.tenantId,
      customerPhone: { in: allPhones },
    },
    select: {
      customerPhone: true,
      customerName: true,
      totalOrders: true,
      totalSpent: true,
    },
  });

  const memoryMap = new Map(memories.map((m) => [m.customerPhone, m]));

  const mapConversationWithCustomer = (c: any) => {
    const mem = memoryMap.get(c.customerPhone);
    return {
      ...c,
      customer: mem
        ? {
            customerName: mem.customerName,
            totalOrders: mem.totalOrders,
            totalSpent: Number(mem.totalSpent),
          }
        : null,
    };
  };

  return (
    <div className="page-container" style={{ paddingBottom: '20px' }}>
      <div className="page-header" style={{ marginBottom: '14px' }}>
        <div>
          <h1 className="page-title">WhatsApp AI Inbox & Handoffs</h1>
          <p className="page-subtitle">
            Monitor real-time conversations, resolve bot escalation handoffs, and interact directly with customers.
          </p>
        </div>
      </div>

      <ConversationsClient
        conversations={conversationsResult.items.map(mapConversationWithCustomer)}
        handoffQueue={handoffQueue.map(mapConversationWithCustomer)}
        selectedConversation={
          selectedConversation
            ? {
                ...selectedConversation,
                customer: selectedConversation.customerMemory
                  ? {
                      customerName: selectedConversation.customerMemory.customerName,
                      totalOrders: selectedConversation.customerMemory.totalOrders,
                      totalSpent: Number(selectedConversation.customerMemory.totalSpent),
                    }
                  : null,
              }
            : null
        }
      />
    </div>
  );
}
