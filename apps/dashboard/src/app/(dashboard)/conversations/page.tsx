import { getSession } from '../../../lib/auth';
import {
  listConversations,
  getHandoffQueue,
  getConversationDetail,
} from '../../../lib/dal';
import { ConversationsClient } from './ConversationsClient';

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

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">WhatsApp AI Inbox & Handoffs</h1>
          <p className="page-subtitle">
            Monitor real-time conversations, resolve bot escalation handoffs, and interact directly with customers.
          </p>
        </div>
      </div>

      <ConversationsClient
        conversations={conversationsResult.items.map((c) => ({
          ...c,
          customer: null,
        }))}
        handoffQueue={handoffQueue.map((c) => ({
          ...c,
          customer: null,
        }))}
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
