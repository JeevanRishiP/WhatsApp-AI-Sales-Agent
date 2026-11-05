'use client';

import { useState, useTransition } from 'react';
import { Bot, Power, AlertCircle } from 'lucide-react';
import { toggleAiAgentAction } from '../lib/actions/settings';

interface AiAgentToggleProps {
  initialEnabled?: boolean;
}

export function AiAgentToggle({ initialEnabled = true }: AiAgentToggleProps) {
  const [enabled, setEnabled] = useState<boolean>(initialEnabled);
  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextState = !enabled;
    setEnabled(nextState);

    startTransition(async () => {
      const res = await toggleAiAgentAction(nextState);
      if (res?.success) {
        setToastMessage(
          nextState
            ? '✅ WhatsApp AI Agent is now ONLINE and auto-replying to customers.'
            : '⏸️ WhatsApp AI Agent is PAUSED. Offline auto-responder is active.'
        );
      } else {
        // Revert on error
        setEnabled(!nextState);
        setToastMessage('❌ Failed to update agent status. Please try again.');
      }

      setTimeout(() => {
        setToastMessage(null);
      }, 3500);
    });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className={`ai-toggle-btn ${enabled ? 'active' : 'inactive'}`}
        title={
          enabled
            ? 'AI Sales Agent is currently active. Click to switch OFF and activate offline auto-reply.'
            : 'AI Sales Agent is currently OFF. Click to switch ON and resume autonomous replies.'
        }
        aria-label={enabled ? 'Turn WhatsApp AI Agent Off' : 'Turn WhatsApp AI Agent On'}
        style={{
          opacity: isPending ? 0.75 : 1,
        }}
      >
        <span className={enabled ? 'pulse-dot' : 'pulse-dot-amber'} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Bot
            size={13}
            style={{
              color: enabled ? 'var(--whatsapp)' : 'var(--warning)',
              transition: 'color 0.2s ease',
            }}
          />
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: enabled ? '#4ade80' : '#facc15',
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
            }}
          >
            {isPending ? 'Updating...' : enabled ? 'AI Agent: Active' : 'AI Agent: Paused'}
          </span>
        </div>

        {/* Visual Pill Switch */}
        <div className={`ai-switch-track ${enabled ? 'active' : ''}`}>
          <div className={`ai-switch-thumb ${enabled ? 'active' : ''}`} />
        </div>
      </button>

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 9999,
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            fontSize: '0.75rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

