'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Phone,
  Clock,
  Sparkles,
} from 'lucide-react';
import { resolveHandoffAction } from '../lib/actions/conversations';

export interface HandoffQueueItem {
  id: string;
  customerPhone: string;
  customerName?: string | null;
  handoffReason: string;
  updatedAt: string;
  lastMessage?: string | null;
}

interface HumanHandoffStickyBannerProps {
  initialCount?: number;
  initialQueue?: HandoffQueueItem[];
}

export function HumanHandoffStickyBanner({
  initialCount = 0,
  initialQueue = [],
}: HumanHandoffStickyBannerProps) {
  const [count, setCount] = useState<number>(initialCount);
  const [queue, setQueue] = useState<HandoffQueueItem[]>(initialQueue);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();
  const prevCountRef = useRef<number>(initialCount);

  // Play a soft attention alert chime via Web Audio API
  const playAlertChime = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.25); // D6

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio autoplay policy might silently block until user interaction
    }
  };

  // Subscribe to SSE /api/events for handoff alerts with visibility-aware fallback polling
  useEffect(() => {
    let mounted = true;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;

    const applyUpdate = (data: { count?: number; queue?: HandoffQueueItem[] }) => {
      if (!mounted) return;
      const newCount = Number(data.count || 0);
      const newQueue: HandoffQueueItem[] = data.queue || [];
      if (newCount > prevCountRef.current) {
        playAlertChime();
      }
      prevCountRef.current = newCount;
      setCount(newCount);
      setQueue(newQueue);
    };

    const checkHandoffStatus = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/handoff/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        applyUpdate(data);
      } catch {
        // Network retry on next interval
      }
    };

    const startFallbackPolling = () => {
      if (fallbackTimer) return;
      fallbackTimer = setInterval(checkHandoffStatus, 15000);
    };

    if (typeof window !== 'undefined' && typeof EventSource !== 'undefined') {
      try {
        eventSource = new EventSource('/api/events');
        eventSource.addEventListener('handoff_status', (evt) => {
          try {
            const parsed = JSON.parse((evt as MessageEvent).data);
            applyUpdate(parsed);
          } catch {
            // Ignore malformed SSE event payload
          }
        });
        eventSource.onerror = () => {
          // Keep EventSource reconnect, and enable gentle visibility-aware fallback
          startFallbackPolling();
        };
      } catch {
        startFallbackPolling();
      }
    } else {
      checkHandoffStatus();
      startFallbackPolling();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkHandoffStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (fallbackTimer) clearInterval(fallbackTimer);
      if (eventSource) eventSource.close();
    };
  }, [soundEnabled]);

  const handleResolve = (conversationId: string) => {
    startTransition(async () => {
      // Optimistic state update
      setQueue((prev) => prev.filter((item) => item.id !== conversationId));
      setCount((prev) => Math.max(0, prev - 1));

      await resolveHandoffAction(conversationId, 'Store Merchant');
    });
  };

  if (count <= 0) {
    return null;
  }

  const latestItem = queue[0];

  // Minimized Floating Pill Mode
  if (isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          animation: 'handoff-banner-blink 1.2s infinite',
          padding: '10px 16px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(239, 68, 68, 0.95)',
          color: '#ffffff',
          boxShadow: '0 8px 30px rgba(239, 68, 68, 0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: 'pointer',
        }}
        onClick={() => setIsMinimized(false)}
      >
        <span className="handoff-beacon">🚨</span>
        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
          {count} Human Handoff Pending!
        </span>
        <button
          type="button"
          className="btn btn-xs"
          style={{
            background: 'white',
            color: '#b91c1c',
            fontWeight: 700,
            borderRadius: '9999px',
            padding: '2px 8px',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized(false);
          }}
        >
          Expand ↗
        </button>
      </div>
    );
  }

  // Full Sticky Blinking Top Banner
  return (
    <div className="sticky-handoff-banner" role="alert" aria-live="assertive">
      {/* Left: Siren & Information */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '280px' }}>
        <div className="handoff-beacon" title="Urgent Customer Action Required">
          🚨
        </div>

        <div>
          <div className="handoff-headline">
            <span>LIVE HUMAN HANDOFF REQUEST</span>
            <span
              style={{
                fontSize: '0.6875rem',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: '#ef4444',
                color: '#fff',
                fontWeight: 800,
                letterSpacing: '0.05em',
              }}
            >
              {count} {count === 1 ? 'CUSTOMER WAITING' : 'CUSTOMERS WAITING'}
            </span>
          </div>

          <div
            style={{
              fontSize: '0.8125rem',
              color: 'rgba(255, 255, 255, 0.95)',
              marginTop: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            {latestItem ? (
              <>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {latestItem.customerName ? `${latestItem.customerName} (` : ''}
                  {latestItem.customerPhone}
                  {latestItem.customerName ? ')' : ''}
                </span>
                <span>•</span>
                <span style={{ color: '#fed7aa', fontStyle: 'italic' }}>
                  &ldquo;{latestItem.handoffReason}&rdquo;
                </span>
                {latestItem.lastMessage && (
                  <>
                    <span>•</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.8)', maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Last text: &ldquo;{latestItem.lastMessage}&rdquo;
                    </span>
                  </>
                )}
              </>
            ) : (
              <span>Customer is requesting to speak with an executive directly on WhatsApp.</span>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Direct Link to Live CRM Chat */}
        <Link
          href={`/conversations${latestItem ? `?id=${latestItem.id}&tab=handoff` : ''}`}
          className="btn btn-sm"
          style={{
            background: '#ffffff',
            color: '#b91c1c',
            fontWeight: 700,
            borderRadius: 'var(--radius-full)',
            padding: '6px 16px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <MessageSquare size={14} />
          <span>Open Live Chat &amp; Assist</span>
        </Link>

        {/* Quick Phone Call Option */}
        {latestItem && (
          <a
            href={`tel:${latestItem.customerPhone}`}
            className="btn btn-sm"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: 'var(--radius-full)',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Call customer directly"
          >
            <Phone size={13} />
            <span>Call</span>
          </a>
        )}

        {/* Resolve Button */}
        {latestItem && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={isPending}
            onClick={() => handleResolve(latestItem.id)}
            style={{
              background: 'rgba(34, 197, 94, 0.25)',
              color: '#86efac',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: 'var(--radius-full)',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Mark handoff as handled and return conversation to active"
          >
            <CheckCircle2 size={13} />
            <span>{isPending ? 'Resolving...' : 'Mark Handled'}</span>
          </button>
        )}

        {/* Audio Alert Toggle */}
        <button
          type="button"
          onClick={() => setSoundEnabled(!soundEnabled)}
          style={{
            background: 'transparent',
            border: 'none',
            color: soundEnabled ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
          title={soundEnabled ? 'Alert chime is enabled' : 'Alert chime is muted'}
          aria-label={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>

        {/* Minimize Button */}
        <button
          type="button"
          onClick={() => setIsMinimized(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.8)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Minimize banner to floating icon"
          aria-label="Minimize handoff alert"
        >
          <ChevronUp size={16} />
        </button>
      </div>
    </div>
  );
}

