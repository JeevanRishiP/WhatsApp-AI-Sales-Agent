'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  resolveHandoffAction,
  reopenConversationAction,
  sendAgentReplyAction,
} from '../../../lib/actions/conversations';
import {
  MessageSquare,
  AlertTriangle,
  User,
  Bot,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Send,
  Sparkles,
  Clock,
  Search,
  ShieldAlert,
  Phone,
  ShoppingBag,
} from 'lucide-react';
import { AiAgentToggle } from '../../../components/AiAgentToggle';

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

function formatMessageTime(dateInput: any): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getChatDateLabel(dateInput: any): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffTime = today.getTime() - msgDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays === 2) {
    return 'Day before yesterday';
  }
  if (diffDays > 2 && diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  }
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ConversationsClient({
  conversations,
  handoffQueue,
  selectedConversation: initialSelected,
}: ConversationsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isInitialHandoff =
    initialSelected?.stage === 'HUMAN_HANDOFF' ||
    handoffQueue.some((h) => h.id === initialSelected?.id);

  const [activeTab, setActiveTab] = useState<'all' | 'handoff'>(
    isInitialHandoff ? 'handoff' : 'all'
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelected?.id || conversations[0]?.id || null
  );
  const [threadSearch, setThreadSearch] = useState('');
  const [replyText, setReplyText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const rawList = activeTab === 'handoff' ? handoffQueue : conversations;
  const displayList = rawList.filter((item) => {
    if (!threadSearch.trim()) return true;
    const query = threadSearch.toLowerCase();
    const phone = item.customerPhone.toLowerCase();
    const name = (item.customer?.customerName || '').toLowerCase();
    const intent = (item.lastIntent || '').toLowerCase();
    return phone.includes(query) || name.includes(query) || intent.includes(query);
  });

  const currentChat =
    (initialSelected?.id === selectedId ? initialSelected : null) ||
    conversations.find((c) => c.id === selectedId) ||
    handoffQueue.find((c) => c.id === selectedId) ||
    null;

  // Auto-scroll chat timeline directly within its container without scrolling ancestors
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  // Sync selectedId if parent initialSelected changes
  useEffect(() => {
    if (initialSelected?.id && initialSelected.id !== selectedId) {
      setSelectedId(initialSelected.id);
    }
  }, [initialSelected?.id]);

  // Keep outer card pinned at top to prevent scroll drift
  useEffect(() => {
    if (cardContainerRef.current) {
      cardContainerRef.current.scrollTop = 0;
    }
  }, [selectedId]);

  // Jump to bottom immediately on thread switch
  useEffect(() => {
    scrollToBottom('auto');
  }, [selectedId]);

  // Smooth scroll when new messages are added
  useEffect(() => {
    scrollToBottom('smooth');
  }, [currentChat?.messages?.length]);

  // Live auto-polling: refresh conversation timeline every 4s so new WhatsApp messages appear in real-time
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !isPending) {
        router.refresh();
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [router, isPending]);

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
    if (!replyText.trim() || !selectedId || isPending) return;

    const text = replyText;
    setReplyText('');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('message', text);

    startTransition(async () => {
      const res = await sendAgentReplyAction(selectedId, formData);
      if (res?.error) {
        setErrorMessage(res.error);
        setReplyText(text); // Restore unsent text
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div>
      {/* Top Controls: Tabs and Quick AI Agent Toggle */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('all')}
            style={{ borderRadius: 'var(--radius-full)', padding: '6px 14px' }}
          >
            <MessageSquare size={13} />
            <span>All Active Threads ({conversations.length})</span>
          </button>

          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'handoff' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('handoff')}
            style={{
              borderRadius: 'var(--radius-full)',
              padding: '6px 14px',
              borderColor: handoffQueue.length > 0 ? '#ef4444' : undefined,
              color: handoffQueue.length > 0 && activeTab !== 'handoff' ? '#F87171' : undefined,
              background: handoffQueue.length > 0 && activeTab !== 'handoff' ? 'rgba(239, 68, 68, 0.12)' : undefined,
              animation: handoffQueue.length > 0 && activeTab !== 'handoff' ? 'handoff-banner-blink 1.4s infinite' : undefined,
              fontWeight: handoffQueue.length > 0 ? 700 : undefined,
            }}
          >
            <AlertTriangle size={13} style={{ color: handoffQueue.length > 0 ? '#ef4444' : undefined }} />
            <span>Handoff Queue ({handoffQueue.length})</span>
          </button>
        </div>

        {/* Quick AI Agent Status & Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AiAgentToggle />
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert-error">
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Inbox Container — Two Columns */}
      <div
        ref={cardContainerRef}
        className="card"
        style={{
          padding: 0,
          display: 'grid',
          gridTemplateColumns: '340px 1fr',
          height: 'calc(100vh - 215px)',
          minHeight: '520px',
          maxHeight: 'calc(100vh - 215px)',
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        {/* Left Column: Thread List */}
        <div
          style={{
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            maxHeight: '100%',
            overflow: 'hidden',
            background: 'var(--bg-card)',
          }}
        >
          {/* Thread Search Box */}
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div className="search-input-wrapper" style={{ maxWidth: 'none' }}>
              <span className="search-icon">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search phone or customer..."
                className="search-input"
                style={{ padding: '7px 12px 7px 34px', fontSize: '0.8125rem' }}
                value={threadSearch}
                onChange={(e) => setThreadSearch(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}
          >
            {displayList.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p>
                  {activeTab === 'handoff'
                    ? 'No human handoff pending. AI sales agent is answering all queries autonomously.'
                    : 'No conversation threads found.'}
                </p>
              </div>
            ) : (
              displayList.map((item) => {
                const isSelected = item.id === selectedId;
                const isHandoff = item.stage === 'HANDOFF';
                const initial = (item.customer?.customerName || item.customerPhone || 'U').charAt(0).toUpperCase();

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item.id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: isSelected
                        ? 'rgba(99, 102, 241, 0.12)'
                        : isHandoff
                        ? 'rgba(239, 68, 68, 0.05)'
                        : 'transparent',
                      transition: 'background 0.15s ease',
                      position: 'relative',
                    }}
                  >
                    {isSelected && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: '3px',
                          background: 'var(--accent)',
                        }}
                      />
                    )}

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: isHandoff ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                          border: `1px solid ${isHandoff ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'}`,
                          color: isHandoff ? '#F87171' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {initial}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '0.875rem',
                              color: isSelected ? 'var(--text-primary)' : 'inherit',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.customer?.customerName || item.customerPhone}
                          </span>
                          <span
                            suppressHydrationWarning
                            style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', flexShrink: 0 }}
                          >
                            {formatMessageTime(item.lastMessageAt)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                          <span
                            className={`badge ${
                              isHandoff
                                ? 'badge-danger'
                                : item.stage === 'CHECKOUT_CONFIRM'
                                ? 'badge-success'
                                : 'badge-neutral'
                            }`}
                            style={{ fontSize: '0.625rem', padding: '1px 6px' }}
                          >
                            {item.stage}
                          </span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            {item.messageCount} msg{item.messageCount === 1 ? '' : 's'}
                          </span>
                        </div>

                        {item.handoffReason && (
                          <div style={{ fontSize: '0.6875rem', color: '#F87171', marginTop: '4px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            ⚠️ {item.handoffReason}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat History and Actions */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            maxHeight: '100%',
            overflow: 'hidden',
            background: 'var(--bg-canvas)',
          }}
        >
          {currentChat ? (
            <>
              {/* Chat Header */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  flexShrink: 0,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      {currentChat.customer?.customerName || currentChat.customerPhone}
                    </span>
                    <span
                      className={`badge ${
                        currentChat.stage === 'HANDOFF' ? 'badge-danger' : 'badge-info'
                      }`}
                      style={{ fontSize: '0.6875rem' }}
                    >
                      {currentChat.stage}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{currentChat.customerPhone}</span>
                    {currentChat.customer && (
                      <>
                        <span>•</span>
                        <span>Orders: {currentChat.customer.totalOrders}</span>
                        <span>•</span>
                        <span>Spent: ₹{Number(currentChat.customer.totalSpent).toLocaleString('en-IN')}</span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {currentChat.stage === 'HANDOFF' ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleResolveHandoff(currentChat.id)}
                      disabled={isPending}
                    >
                      <CheckCircle2 size={13} />
                      <span>Resolve Handoff</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleReopen(currentChat.id)}
                      disabled={isPending}
                      title="Reset state to browsing"
                    >
                      <RotateCcw size={13} />
                      <span>Reset State</span>
                    </button>
                  )}

                  <a
                    href={`https://wa.me/${currentChat.customerPhone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    <span>Open in WhatsApp</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Message Timeline */}
              <div
                ref={messagesContainerRef}
                className="message-list"
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  padding: '24px 20px',
                  maxHeight: 'none',
                  background: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.03) 0%, transparent 80%)',
                }}
              >
                {currentChat.messages && currentChat.messages.length > 0 ? (
                  <>
                    {/* WhatsApp Top Sticky / Floating Date Indicator */}
                    <div
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        display: 'flex',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                        marginBottom: '8px',
                      }}
                    >
                      <span
                        style={{
                          background: 'rgba(23, 28, 40, 0.92)',
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#E2E8F0',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          padding: '3px 14px',
                          borderRadius: '9999px',
                          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {getChatDateLabel(
                          currentChat.messages[currentChat.messages.length - 1]?.createdAt ||
                            currentChat.lastMessageAt ||
                            new Date()
                        )}
                      </span>
                    </div>

                    {currentChat.messages.map((msg, idx) => {
                      const role = (msg.role || '').toLowerCase();
                      const isCustomer = role === 'customer' || role === 'user';
                      const isAgent = role === 'agent' || role === 'merchant' || role === 'human';
                      const isSystem = role === 'system';

                      const prevMsg = idx > 0 ? currentChat.messages![idx - 1] : null;
                      const msgDateStr = new Date(msg.createdAt).toDateString();
                      const prevDateStr = prevMsg ? new Date(prevMsg.createdAt).toDateString() : null;
                      const isNewDay = idx === 0 || msgDateStr !== prevDateStr;
                      const dateDividerLabel = isNewDay ? getChatDateLabel(msg.createdAt) : null;

                      return (
                        <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                          {isNewDay && dateDividerLabel && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: idx === 0 ? '4px 0 14px 0' : '20px 0 14px 0',
                                position: 'relative',
                                width: '100%',
                              }}
                            >
                              <div
                                style={{
                                  position: 'absolute',
                                  left: 0,
                                  right: 0,
                                  height: '1px',
                                  background:
                                    'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08) 20%, rgba(255, 255, 255, 0.08) 80%, transparent)',
                                }}
                              />
                              <span
                                style={{
                                  position: 'relative',
                                  background: '#171C28',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: 'var(--text-secondary, #94A3B8)',
                                  fontSize: '0.6875rem',
                                  fontWeight: 600,
                                  padding: '3px 12px',
                                  borderRadius: '9999px',
                                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
                                  letterSpacing: '0.03em',
                                  textTransform: 'capitalize',
                                }}
                              >
                                {dateDividerLabel}
                              </span>
                            </div>
                          )}

                          <div
                            className="message-bubble"
                            style={{
                              alignSelf: isCustomer
                                ? 'flex-start'
                                : isSystem
                                ? 'center'
                                : 'flex-end',
                            background: isCustomer
                              ? '#171C28'
                              : isAgent
                              ? '#1E283E'
                              : isSystem
                              ? 'rgba(245, 158, 11, 0.1)'
                              : '#122521',
                            color: '#F1F5F9',
                            borderRadius: isCustomer
                              ? '14px 14px 14px 3px'
                              : isSystem
                              ? 'var(--radius-full)'
                              : '14px 14px 3px 14px',
                            border: isAgent
                              ? '1px solid rgba(99, 102, 241, 0.35)'
                              : isCustomer
                              ? '1px solid var(--border)'
                              : isSystem
                              ? '1px solid rgba(245, 158, 11, 0.25)'
                              : '1px solid rgba(37, 211, 102, 0.25)',
                            boxShadow: 'var(--shadow-sm)',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              marginBottom: '5px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              color: isCustomer
                                ? 'var(--text-secondary)'
                                : isAgent
                                ? '#818CF8'
                                : isSystem
                                ? '#FBBF24'
                                : '#34D399',
                            }}
                          >
                            {isCustomer ? (
                              <>
                                <User size={12} />
                                <span>{currentChat.customer?.customerName || 'Customer'}</span>
                              </>
                            ) : isAgent ? (
                              <>
                                <User size={12} />
                                <span>Store Staff (You)</span>
                              </>
                            ) : isSystem ? (
                              <span>System Event</span>
                            ) : (
                              <>
                                <Bot size={12} />
                                <span>WhatsApp AI Agent</span>
                              </>
                            )}

                            {msg.intent && (
                              <span
                                style={{
                                  fontSize: '0.625rem',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  color: 'var(--text-secondary)',
                                  fontWeight: 500,
                                }}
                              >
                                {msg.intent}
                              </span>
                            )}
                          </div>

                          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{msg.content}</div>

                          <div
                            className="message-time"
                            style={{
                              color: 'var(--text-muted)',
                              textAlign: isCustomer ? 'left' : 'right',
                              marginTop: '5px',
                              justifyContent: isCustomer ? 'flex-start' : 'flex-end',
                            }}
                          >
                            <Clock size={10} />
                            <span suppressHydrationWarning>
                              {formatMessageTime(msg.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                    })}
                  </>
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
                  padding: '14px 18px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type an official reply to message customer on WhatsApp..."
                  className="form-input"
                  style={{ flex: 1 }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!replyText.trim() || isPending}
                  style={{ padding: '8px 18px' }}
                >
                  <Send size={14} />
                  <span>{isPending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-muted)',
                gap: '8px',
              }}
            >
              <MessageSquare size={32} style={{ opacity: 0.3 }} />
              <p style={{ fontSize: '0.875rem' }}>Select a conversation from the left to view messages.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
