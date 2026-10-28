'use client';

import { useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { loginAction } from '../../lib/actions/auth';

function SubmitButton({ method }: { method: 'password' | 'apikey' }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
      style={{ width: '100%', marginTop: '14px', justifyContent: 'center' }}
    >
      {pending
        ? 'Verifying...'
        : method === 'password'
        ? 'Sign In with Password'
        : 'Sign In with API Key'}
    </button>
  );
}

export default function LoginPage() {
  const [method, setMethod] = useState<'password' | 'apikey'>('apikey');
  const [state, formAction] = useFormState(loginAction, {});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apiKey, setApiKey] = useState('sk_live_aura_8f92jkl2309x');

  useEffect(() => {
    if (state?.success) {
      window.location.replace('/');
    }
  }, [state?.success]);

  if (state?.success) {
    return (
      <div className="login-container">
        <div className="login-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>⚡</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)' }}>
            Authentication Successful
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '8px' }}>
            Opening your merchant dashboard...
          </p>
          <div
            style={{
              marginTop: '24px',
              display: 'inline-block',
              width: '28px',
              height: '28px',
              border: '3px solid rgba(59, 130, 246, 0.2)',
              borderTopColor: '#3b82f6',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{ textAlign: 'center', fontSize: '2rem', marginBottom: '8px' }}>
          ⚡
        </div>
        <h1 className="login-title">WhatsApp Commerce OS</h1>
        <p className="login-subtitle">
          Merchant Portal — Access your business dashboard
        </p>

        {/* 1-Click Instant Demo Login (Works in 1 click with zero typing) */}
        <div
          style={{
            marginBottom: '20px',
            padding: '14px',
            borderRadius: 'var(--radius)',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#60a5fa',
              marginBottom: '10px',
              letterSpacing: '0.05em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚡</span>
            <span>Instant 1-Click Demo Login</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <a
              href="/api/auth/demo-login?key=sk_live_aura_8f92jkl2309x"
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
                width: '100%',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              <span>👑</span>
              <span>Open Aura Luxe Boutique (Demo)</span>
            </a>
            <a
              href="/api/auth/demo-login?key=sk_live_roast_9f82kxl2390y"
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                textDecoration: 'none',
                width: '100%',
                fontSize: '0.8125rem',
              }}
            >
              <span>☕</span>
              <span>Open RoastCraft India</span>
            </a>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '16px 0',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          <span>or sign in manually</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${method === 'apikey' ? 'active' : ''}`}
            onClick={() => setMethod('apikey')}
          >
            API Key
          </button>
          <button
            type="button"
            className={`login-tab ${method === 'password' ? 'active' : ''}`}
            onClick={() => setMethod('password')}
          >
            Email & Password
          </button>
        </div>

        {state?.error && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--danger-bg)',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              fontSize: '0.875rem',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction}>
          <input type="hidden" name="method" value={method} />

          {method === 'apikey' ? (
            <div className="form-group">
              <label className="form-label" htmlFor="apiKey">
                Tenant API Key
              </label>
              <input
                id="apiKey"
                name="apiKey"
                type="text"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk_live_aura_8f92jkl2309x"
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                autoComplete="off"
              />
              <div
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quick Fill:</span>
                <button
                  type="button"
                  onClick={() => setApiKey('sk_live_aura_8f92jkl2309x')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.7rem', padding: '2px 8px', height: 'auto' }}
                >
                  Aura Luxe
                </button>
                <button
                  type="button"
                  onClick={() => setApiKey('sk_live_roast_9f82kxl2390y')}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.7rem', padding: '2px 8px', height: 'auto' }}
                >
                  RoastCraft
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Business / Owner Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aditi@auraluxe.in"
                  className="form-input"
                  autoComplete="email"
                />
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="form-input"
                  autoComplete="current-password"
                />
              </div>

              <div
                style={{
                  marginTop: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Demo Creds:</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('aditi@auraluxe.in');
                    setPassword('admin123');
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.7rem', padding: '2px 8px', height: 'auto' }}
                >
                  Fill Aura (admin123)
                </button>
              </div>
            </>
          )}

          <SubmitButton method={method} />
        </form>

        <div
          style={{
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
          }}
        >
          🔒 Isolated tenant environment. Every query is strictly scoped to your business.
        </div>
      </div>
    </div>
  );
}
