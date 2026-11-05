'use client';

import { useState, useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { loginAction } from '../../lib/actions/auth';
import {
  Zap,
  Key,
  Mail,
  Lock,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Store,
  Sparkles,
  Coffee,
} from 'lucide-react';

function SubmitButton({ method }: { method: 'password' | 'apikey' }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary"
      style={{ width: '100%', marginTop: '16px', justifyContent: 'center', padding: '10px 16px' }}
    >
      {pending ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.6s linear infinite',
            }}
          />
          <span>Authenticating...</span>
        </span>
      ) : method === 'password' ? (
        <span>Sign In to Dashboard</span>
      ) : (
        <span>Sign In with API Key</span>
      )}
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
        <div className="login-card" style={{ textAlign: 'center', padding: '56px 28px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(37, 211, 102, 0.12)',
              border: '1px solid rgba(37, 211, 102, 0.3)',
              color: 'var(--whatsapp)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <CheckCircle2 size={28} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Authentication Verified
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '6px' }}>
            Opening your merchant dashboard...
          </p>
          <div
            style={{
              marginTop: '24px',
              display: 'inline-block',
              width: '24px',
              height: '24px',
              border: '2.5px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: '#6366F1',
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
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-gradient)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
              marginBottom: '14px',
            }}
          >
            <Zap size={22} fill="white" />
          </div>
          <h1 className="login-title">WhatsApp Commerce OS</h1>
          <p className="login-subtitle">
            Autonomous AI Sales Agent & Multi-Staff Merchant Portal
          </p>
        </div>

        {/* 1-Click Instant Demo Login Cards */}
        <div
          style={{
            marginBottom: '22px',
            padding: '16px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#818CF8',
              marginBottom: '12px',
              letterSpacing: '0.06em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={12} />
            <span>Instant 1-Click Demo Environments</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <a
              href="/api/auth/demo-login?key=sk_live_aura_8f92jkl2309x"
              className="btn btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                width: '100%',
                fontWeight: 600,
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Store size={15} />
                <span>Aura Luxe Boutique</span>
              </div>
              <span style={{ fontSize: '0.6875rem', background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>
                Fashion & Jewelry
              </span>
            </a>

            <a
              href="/api/auth/demo-login?key=sk_live_roast_9f82kxl2390y"
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                width: '100%',
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Coffee size={15} style={{ color: '#F59E0B' }} />
                <span>RoastCraft India</span>
              </div>
              <span style={{ fontSize: '0.6875rem', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                Artisan Coffee
              </span>
            </a>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '18px 0',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          <span>or sign in manually</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
        </div>

        {/* Tab Switcher */}
        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${method === 'apikey' ? 'active' : ''}`}
            onClick={() => setMethod('apikey')}
          >
            API Key Authentication
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
          <div className="alert alert-error">
            <AlertTriangle size={15} />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction}>
          <input type="hidden" name="method" value={method} />

          {method === 'apikey' ? (
            <div className="form-group">
              <label className="form-label" htmlFor="apiKey">
                Merchant API Secret Key
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="apiKey"
                  name="apiKey"
                  type="text"
                  required
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk_live_aura_..."
                  className="form-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', paddingLeft: '34px' }}
                  autoComplete="off"
                />
                <Key size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => setApiKey('sk_live_aura_8f92jkl2309x')}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                >
                  Aura Key
                </button>
                <button
                  type="button"
                  onClick={() => setApiKey('sk_live_roast_9f82kxl2390y')}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
                >
                  RoastCraft Key
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="email">
                  Staff / Owner Email
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="aditi@auraluxe.in"
                    className="form-input"
                    style={{ paddingLeft: '34px' }}
                    autoComplete="email"
                  />
                  <Mail size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '14px' }}>
                <label className="form-label" htmlFor="password">
                  Account Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="form-input"
                    style={{ paddingLeft: '34px' }}
                    autoComplete="current-password"
                  />
                  <Lock size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                </div>
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
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Demo Credentials:</span>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('aditi@auraluxe.in');
                    setPassword('admin123');
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.6875rem', padding: '2px 8px' }}
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
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <ShieldCheck size={14} style={{ color: 'var(--success)' }} />
          <span>Strict multi-tenant security isolation. Every query is tenant-scoped.</span>
        </div>
      </div>
    </div>
  );
}
