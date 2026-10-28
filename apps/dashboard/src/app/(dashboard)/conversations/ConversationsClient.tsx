'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  resolveHandoffAction,
  reopenConversationAction,
  sendAgentReplyAction,
} from '../../../lib/actions/conversations';

interface MessageData {
  id: string;
  role: string;
  content: string;
  messageType: string;
  intent: string | null;
  llmModel: string | null;
  createdAt: any;
}

interface ConversationItem {
  id: string;
  customerPhone: string;
  stage: string;
  language: string;
  messageCount: number;
  lastMessageAt: any;
  lastIntent: string | null;
  handoffReason: string | null;
  messages?: MessageData[];
  customer?: {
    customerName: string | null;
    totalOrders: number;
    totalSpent: any;
  } | null;
}

interface ConversationsClientProps {
  conversations: ConversationItem[];
  handoffQueue: ConversationItem[];
  selectedConversation: ConversationItem | null;
}

export function ConversationsClient({
  conversations,
  handoffQueue,
  selectedConversation: initialSelected,
}: ConversationsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<'all' | 'handoff'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelected?.id || conversations[0]?.id || null
  );
  const [replyText, setReplyText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const displayList = activeTab === 'handoff' ? handoffQueue : conversations;
  const currentChat =
    (initialSelected?.id === selectedId ? initialSelected : null) ||
    conversations.find((c) => c.id === selectedId) ||
    handoffQueue.find((c) => c.id === selectedId) ||
    null;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    router.push(`/conversations?id=${id}`);
  };

  const handleResolveHandoff = async (id: string) => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await resolveHandoffAction(id, 'Store Merchant');
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleReopen = async (id: string) => {
    setErrorMessage(null);
    startTransition(async () => {
      const res = await reopenConversationAction(id);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedId) return;

    const text = replyText;
    setReplyText('');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('message', text);

    startTransition(async () => {
      const res = await sendAgentReplyAction(selectedId, formData);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div>
      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('all')}
        >
          All Active Threads ({conversations.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'handoff' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('handoff')}
          style={{
            borderColor: handoffQueue.length > 0 ? 'var(--danger)' : undefined,
            color: handoffQueue.length > 0 && activeTab !== 'handoff' ? 'var(--danger)' : undefined,
          }}
        >
          🚨 Human Handoff Queue ({handoffQueue.length})
        </button>
      </div>

      {errorMessage && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: '14px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.875rem',
          }}
        >
          {errorMessage}
        </div>
      )}

      {/* Main Inbox Container — Two Columns */}
      <div
        className="card"
        style={{
          padding: 0,
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          height: 'calc(100vh - 220px)',
          minHeight: '520px',
          overflow: 'hidden',
        }}
      >
        {/* Left Column: Thread List */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {displayList.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {activeTab === 'handoff'
                ? 'No pending human handoffs. AI bot is handling all inquiries smoothly.'
                : 'No conversations yet.'}
            </div>
          ) : (
            displayList.map((item) => {
              const isSelected = item.id === selectedId;
              const isHandoff = item.stage === 'HANDOFF';
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--bg-tertiary)'
                      : isHandoff
                      ? 'rgba(234, 67, 53, 0.05)'
                      : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isSelected ? 'var(--accent)' : 'inherit' }}>
                      {item.customer?.customerName || item.customerPhone}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {new Date(item.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <span
                      className={`badge ${
                        isHandoff
                          ? 'badge-danger'
                          : item.stage === 'CHECKOUT_CONFIRM'
                          ? 'badge-success'
                          : 'badge-info'
                      }`}
                      style={{ fontSize: '0.65rem', padding: '1px 6px' }}
                    >
                      {item.stage}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {item.messageCount} msg{item.messageCount === 1 ? '' : 's'}
                    </span>
                  </div>

                  {item.handoffReason && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '4px', fontWeight: 500 }}>
                      ⚠️ {item.handoffReason}
                    </div>
                  )}

                  {item.lastIntent && !item.handoffReason && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Intent: {item.lastIntent}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Chat History and Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
          {currentChat ? (
            <>
              {/* Chat Header */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>
                      {currentChat.customer?.customerName
                        ? `${currentChat.customer.customerName} (${currentChat.customerPhone})`
                        : currentChat.customerPhone}
                    </span>
                    <span
                      className={`badge ${
                        currentChat.stage === 'HANDOFF' ? 'badge-danger' : 'badge-info'
                      }`}
                    >
                      {currentChat.stage}
                    </span>
                  </div>
                  {currentChat.customer && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Orders: {currentChat.customer.totalOrders} • Total Spent: ₹
                      {Number(currentChat.customer.totalSpent).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {currentChat.stage === 'HANDOFF' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleResolveHandoff(currentChat.id)}
                      disabled={isPending}
                    >
                      ✅ Resolve Handoff
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleReopen(currentChat.id)}
                      disabled={isPending}
                      title="Reset state to browsing"
                    >
                      🔄 Reset Conversation
                    </button>
                  )}
                  <a
                    href={`https://wa.me/${currentChat.customerPhone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    Open WhatsApp App ↗
                  </a>
                </div>
              </div>

              {/* Message Timeline */}
              <div
                className="message-list"
                style={{ flex: 1, overflowY: 'auto', padding: '20px' }}
              >
                {currentChat.messages && currentChat.messages.length > 0 ? (
                  currentChat.messages.map((msg) => {
                    const isUser = msg.role === 'CUSTOMER';
                    const isSystem = msg.role === 'SYSTEM';
                    const isAgent = msg.role === 'AGENT';

                    return (
                      <div
                        key={msg.id}
                        className={`message-bubble ${
                          isUser
                            ? 'message-customer'
                            : isSystem
                            ? 'message-system'
                            : 'message-assistant'
                        }`}
                        style={{
                          background: isAgent ? 'rgba(52, 168, 83, 0.15)' : undefined,
                          borderColor: isAgent ? 'var(--success)' : undefined,
                        }}
                      >
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                          {isUser ? 'Customer' : isAgent ? 'Merchant (You)' : isSystem ? 'System Event' : 'WhatsApp AI Agent'}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                        <div className="message-time">
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {msg.intent && ` • ${msg.intent}`}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No messages recorded in this conversation thread yet.
                  </div>
                )}
              </div>

              {/* Reply Input Form */}
              <form
                onSubmit={handleSendReply}
                style={{
                  padding: '12px 16px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  display: 'flex',
                  gap: '10px',
                }}
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type an official message to reply directly to the customer on WhatsApp..."
                  className="form-input"
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!replyText.trim() || isPending}
                >
                  {isPending ? 'Sending...' : 'Send Message'}
                </button>
              </form>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
              }}
            >
              Select a conversation from the left to inspect messages and assist customers.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
