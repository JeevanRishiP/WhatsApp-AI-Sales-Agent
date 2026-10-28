'use client';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Customer Profile Cockpit — Interactive Client Component       ║
// ║                                                               ║
// ║  Displays 360° customer intelligence:                         ║
// ║  - Purchasing power metrics & SVG spend progression graph     ║
// ║  - Order history with full line items & delivery addresses    ║
// ║  - AI customer memory & merchant notes/tags management        ║
// ║  - Embedded WhatsApp chat stream with direct reply box        ║
// ╚═══════════════════════════════════════════════════════════════╝

import { useState, useTransition, useId } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FullCustomerProfile, CustomerOrderSummary } from '../../../../lib/dal/customers';
import {
  updateCustomerProfileAction,
  sendCustomerDirectMessageAction,
} from '../../../../lib/actions/customers';

interface CustomerProfileClientProps {
  profile: FullCustomerProfile;
}

export function CustomerProfileClient({ profile }: CustomerProfileClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'chat' | 'delivery'>('overview');
  const [graphMode, setGraphMode] = useState<'cumulative' | 'individual'>('cumulative');
  const [isPending, startTransition] = useTransition();
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(profile.customerName || '');
  const [editLanguage, setEditLanguage] = useState(profile.preferredLanguage || 'en');
  const [editNotes, setEditNotes] = useState(profile.merchantNotes || '');
  const [editTags, setEditTags] = useState(profile.merchantTags.join(', '));
  const [editCategories, setEditCategories] = useState(profile.preferredCategories.join(', '));

  // Chat message input state
  const [chatMessage, setChatMessage] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [copiedAddressIndex, setCopiedAddressIndex] = useState<number | null>(null);

  const cleanPhone = profile.customerPhone.replace(/\D/g, '');

  // Tier metadata
  const tierConfig = {
    PLATINUM_VIP: {
      label: 'Platinum VIP',
      color: '#d4af37',
      bg: 'rgba(212, 175, 55, 0.15)',
      badgeClass: 'badge-warning',
      icon: '👑',
      desc: 'Top 1% shopper with high purchase frequency and basket size',
    },
    GOLD_PREFERRED: {
      label: 'Gold Preferred',
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.15)',
      badgeClass: 'badge-warning',
      icon: '🌟',
      desc: 'Repeat loyal shopper with proven high purchasing power',
    },
    SILVER_REGULAR: {
      label: 'Silver Regular',
      color: '#60a5fa',
      bg: 'rgba(96, 165, 250, 0.15)',
      badgeClass: 'badge-info',
      icon: '🛡️',
      desc: 'Active customer with successful fulfilled orders',
    },
    PROSPECT: {
      label: 'Lead / Prospect',
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      badgeClass: '',
      icon: '🎯',
      desc: 'Inquirer exploring products on WhatsApp with high purchase intent',
    },
  }[profile.purchasePower.tier];

  // Save profile updates
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setActionNotice(null);

    const formData = new FormData();
    formData.append('customerId', profile.id);
    formData.append('customerPhone', profile.customerPhone);
    formData.append('customerName', editName);
    formData.append('preferredLanguage', editLanguage);
    formData.append('merchantNotes', editNotes);
    formData.append('merchantTags', editTags);
    formData.append('preferredCategories', editCategories);

    startTransition(async () => {
      const res = await updateCustomerProfileAction({}, formData);
      if (res.error) {
        setActionNotice({ type: 'error', message: res.error });
      } else {
        setActionNotice({ type: 'success', message: res.message || 'Customer profile updated successfully' });
        setIsEditing(false);
        router.refresh();
      }
    });
  };

  // Send message in chat
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    const formData = new FormData();
    formData.append('customerPhone', profile.customerPhone);
    formData.append('message', chatMessage);

    startTransition(async () => {
      const res = await sendCustomerDirectMessageAction({}, formData);
      if (res.error) {
        setActionNotice({ type: 'error', message: res.error });
      } else {
        setChatMessage('');
        setActionNotice({ type: 'success', message: 'Message logged and queued for WhatsApp dispatch' });
        router.refresh();
      }
    });
  };

  // Copy address utility
  const handleCopyAddress = (addr: any, index: number) => {
    const text = [
      addr.name,
      addr.phone,
      addr.addressLine1,
      addr.addressLine2,
      addr.landmark,
      `${addr.city || ''}, ${addr.state || ''} - ${addr.pincode || ''}`,
      addr.country || 'India',
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(text);
    setCopiedAddressIndex(index);
    setTimeout(() => setCopiedAddressIndex(null), 2000);
  };

  // Render Spending Progression SVG Graph
  const timeline = profile.spendingTimeline;
  const graphWidth = 720;
  const graphHeight = 220;
  const padding = { top: 25, right: 35, bottom: 45, left: 65 };
  const innerWidth = graphWidth - padding.left - padding.right;
  const innerHeight = graphHeight - padding.top - padding.bottom;

  const maxVal = Math.max(
    1000,
    ...(timeline.length > 0
      ? timeline.map((p) => (graphMode === 'cumulative' ? p.cumulativeSpend : p.amount))
      : [5000])
  );

  const points = timeline.map((pt, i) => {
    const val = graphMode === 'cumulative' ? pt.cumulativeSpend : pt.amount;
    const x =
      timeline.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + (i / (timeline.length - 1)) * innerWidth;
    const y = padding.top + innerHeight - (val / maxVal) * innerHeight;
    return { ...pt, x, y, val };
  });

  const polylinePath =
    points.length > 0 ? points.map((p) => `${p.x},${p.y}`).join(' ') : '';
  const areaPath =
    points.length > 0
      ? `${points[0].x},${padding.top + innerHeight} ${polylinePath} ${
          points[points.length - 1].x
        },${padding.top + innerHeight}`
      : '';

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ─── Breadcrumb & Top Bar ──────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Link href="/customers" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span>←</span> Back to Customers
          </Link>
          <span style={{ color: 'var(--text-muted)' }}>/</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Customer Profile</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <a
            href={`https://wa.me/${cleanPhone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-success btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span>💬</span> Open WhatsApp Web
          </a>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? '✕ Cancel Edit' : '✏️ Edit Profile'}
          </button>
        </div>
      </div>

      {/* ─── Feedback Toast Notice ──────────────────────────────── */}
      {actionNotice && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            background: actionNotice.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
            border: `1px solid ${actionNotice.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
            color: actionNotice.type === 'success' ? 'var(--success)' : 'var(--danger)',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{actionNotice.message}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─── Header Identity & Purchasing Power Banner ──────────── */}
      <div className="card" style={{ padding: '24px 28px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
          {/* Identity details */}
          <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                fontWeight: 700,
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)',
              }}
            >
              {(profile.customerName || profile.customerPhone).charAt(0).toUpperCase()}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {profile.customerName || 'Unnamed Shopper'}
                </h1>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    background: tierConfig.bg,
                    color: tierConfig.color,
                    border: `1px solid ${tierConfig.color}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {tierConfig.icon} {tierConfig.label}
                </span>
                <span className="badge" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                  {profile.preferredLanguage}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {profile.customerPhone}
                </span>
                <span>•</span>
                <span>
                  First seen:{' '}
                  {new Date(profile.firstContactAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
                <span>•</span>
                <span>
                  Last active:{' '}
                  {new Date(profile.lastContactAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Purchasing Power Summary Gauge */}
          <div
            style={{
              display: 'flex',
              gap: '20px',
              padding: '14px 20px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Lifetime Value
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                ₹{profile.purchasePower.lifetimeValue.toLocaleString('en-IN')}
              </div>
            </div>

            <div style={{ width: '1px', height: '36px', background: 'var(--border)' }} />

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Orders
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {profile.purchasePower.totalOrdersCount}
              </div>
            </div>

            <div style={{ width: '1px', height: '36px', background: 'var(--border)' }} />

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Avg Order (AOV)
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)' }}>
                ₹{profile.purchasePower.averageOrderValue.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form Drawer */}
        {isEditing && (
          <form
            onSubmit={handleSaveProfile}
            style={{
              marginTop: '22px',
              paddingTop: '20px',
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
            }}
          >
            <div>
              <label className="form-label">Customer Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Priya Sharma"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">Preferred Language</label>
              <select
                className="form-select"
                value={editLanguage}
                onChange={(e) => setEditLanguage(e.target.value)}
              >
                <option value="en">English (en)</option>
                <option value="hi">Hindi (hi)</option>
                <option value="hinglish">Hinglish</option>
                <option value="ta">Tamil (ta)</option>
                <option value="te">Telugu (te)</option>
                <option value="kn">Kannada (kn)</option>
                <option value="ml">Malayalam (ml)</option>
                <option value="mr">Marathi (mr)</option>
                <option value="bn">Bengali (bn)</option>
              </select>
            </div>

            <div>
              <label className="form-label">Merchant CRM Tags (comma separated)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. VIP, Weekend Delivery, Saree Lover"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">Preferred Categories (comma separated)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Silk Sarees, Kurtas, Jewelry"
                value={editCategories}
                onChange={(e) => setEditCategories(e.target.value)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Internal Merchant Notes</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Add special instructions, courier preferences, or notes about this customer..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsEditing(false)}
                disabled={isPending}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ─── Navigation Tabs ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '2px' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Purchasing Power & Intelligence
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'orders' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('orders')}
        >
          📦 Order History ({profile.orders.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'delivery' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('delivery')}
        >
          📍 Delivery Details ({profile.deliveryAddresses.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'chat' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 WhatsApp Chat Stream ({profile.conversation?.messages.length || 0})
        </button>
      </div>

      {/* ─── TAB 1: OVERVIEW & PURCHASING POWER ──────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Purchasing Power Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {/* Purchasing Tier Gauge */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  PURCHASE POWER TIER
                </span>
                <span style={{ fontSize: '1.25rem' }}>{tierConfig.icon}</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: tierConfig.color }}>
                {tierConfig.label}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px', minHeight: '38px' }}>
                {tierConfig.desc}
              </p>

              {/* Tier Progress Bar */}
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Power Score</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{profile.purchasePower.tierScore}/100</span>
                </div>
                <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${profile.purchasePower.tierScore}%`,
                      background: `linear-gradient(90deg, #3b82f6 0%, ${tierConfig.color} 100%)`,
                      borderRadius: '4px',
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Buying Velocity & Cadence */}
            <div className="card" style={{ padding: '20px' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                BUYING CADENCE & VELOCITY
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '12px' }}>
                {profile.purchasePower.repeatCadenceDays
                  ? `Every ~${profile.purchasePower.repeatCadenceDays} Days`
                  : profile.purchasePower.totalOrdersCount > 0
                  ? 'First Order Placed'
                  : 'Awaiting 1st Order'}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {profile.purchasePower.repeatCadenceDays
                  ? `High repeat cadence customer with ~₹${profile.purchasePower.estimatedMonthlyRunRate.toLocaleString('en-IN')}/mo purchase run-rate.`
                  : 'Customer has not yet established a recurring repeat cycle.'}
              </p>

              <div style={{ marginTop: '14px', display: 'flex', gap: '16px', fontSize: '0.8125rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Highest Single Order:</span>{' '}
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    ₹{profile.purchasePower.highestOrderValue.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Payment Pref:</span>{' '}
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {profile.purchasePower.preferredPaymentMethod || 'UPI / Online'}
                  </span>
                </div>
              </div>
            </div>

            {/* Order Fulfillment Reliability */}
            <div className="card" style={{ padding: '20px' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                FULFILLMENT RELIABILITY
              </span>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success)', marginTop: '12px' }}>
                {profile.purchasePower.totalOrdersCount > 0
                  ? `${Math.round(
                      (profile.purchasePower.completedOrdersCount / profile.purchasePower.totalOrdersCount) * 100
                    )}% Completed`
                  : 'No Orders Yet'}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {profile.purchasePower.completedOrdersCount} successfully delivered/processed orders,{' '}
                {profile.purchasePower.cancelledOrdersCount} cancelled/refunded.
              </p>

              <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                <span className="badge badge-success">
                  ✓ {profile.purchasePower.completedOrdersCount} Active/Fulfilled
                </span>
                {profile.purchasePower.cancelledOrdersCount > 0 && (
                  <span className="badge badge-danger">
                    ✕ {profile.purchasePower.cancelledOrdersCount} Cancelled
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ─── Interactive Spending Progression Graph ─────────── */}
          <div className="card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Customer Spending Progression Over Time
                </h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Chronological progression of orders placed and cumulative lifetime spend.
                </p>
              </div>

              {/* Graph Mode Switcher */}
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${graphMode === 'cumulative' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                  onClick={() => setGraphMode('cumulative')}
                >
                  📈 Cumulative Growth
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${graphMode === 'individual' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.75rem' }}
                  onClick={() => setGraphMode('individual')}
                >
                  📊 Individual Orders
                </button>
              </div>
            </div>

            {timeline.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📉</div>
                No order history recorded yet for this customer.
                <p style={{ fontSize: '0.8125rem', marginTop: '4px' }}>
                  Orders placed through WhatsApp or created by admin will plot here automatically.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', position: 'relative' }}>
                <svg
                  viewBox={`0 0 ${graphWidth} ${graphHeight}`}
                  style={{ width: '100%', minWidth: '600px', height: 'auto', display: 'block' }}
                >
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                    const y = padding.top + innerHeight - pct * innerHeight;
                    const val = Math.round(pct * maxVal);
                    return (
                      <g key={idx}>
                        <line
                          x1={padding.left}
                          y1={y}
                          x2={padding.left + innerWidth}
                          y2={y}
                          stroke="var(--border)"
                          strokeDasharray="4 4"
                          strokeWidth="1"
                        />
                        <text
                          x={padding.left - 10}
                          y={y + 4}
                          fill="var(--text-muted)"
                          fontSize="10"
                          textAnchor="end"
                          fontFamily="var(--font-mono)"
                        >
                          ₹{val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Area fill for cumulative */}
                  {graphMode === 'cumulative' && areaPath && (
                    <polygon points={areaPath} fill="url(#spendGradient)" />
                  )}

                  {/* Polyline line */}
                  {points.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={polylinePath}
                    />
                  )}

                  {/* Vertical Bars for individual mode */}
                  {graphMode === 'individual' &&
                    points.map((p, i) => {
                      const barWidth = Math.max(16, innerWidth / (points.length * 2.5));
                      const barHeight = (p.val / maxVal) * innerHeight;
                      return (
                        <rect
                          key={`bar-${i}`}
                          x={p.x - barWidth / 2}
                          y={padding.top + innerHeight - barHeight}
                          width={barWidth}
                          height={barHeight}
                          fill={p.status === 'CANCELLED' ? '#ef4444' : '#3b82f6'}
                          rx="4"
                          opacity={hoveredPoint === i ? 1 : 0.8}
                          onMouseEnter={() => setHoveredPoint(i)}
                          onMouseLeave={() => setHoveredPoint(null)}
                          style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                        />
                      );
                    })}

                  {/* Data Points */}
                  {points.map((p, i) => (
                    <g key={i}>
                      <circle
                        cx={p.x}
                        y={p.y}
                        r={hoveredPoint === i ? '7' : '5'}
                        fill="#fff"
                        stroke={p.status === 'CANCELLED' ? '#ef4444' : '#3b82f6'}
                        strokeWidth="3"
                        onMouseEnter={() => setHoveredPoint(i)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                      />
                      {/* X-axis labels */}
                      <text
                        x={p.x}
                        y={padding.top + innerHeight + 20}
                        fill="var(--text-muted)"
                        fontSize="10"
                        textAnchor="middle"
                      >
                        {p.date}
                      </text>
                    </g>
                  ))}
                </svg>

                {/* Tooltip on Hover */}
                {hoveredPoint !== null && points[hoveredPoint] && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '16px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--accent)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 14px',
                      boxShadow: 'var(--shadow-md)',
                      pointerEvents: 'none',
                      fontSize: '0.8125rem',
                      zIndex: 10,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      Order #{points[hoveredPoint].orderNumber}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Date: {points[hoveredPoint].date}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Items: {points[hoveredPoint].itemCount} items
                    </div>
                    <div style={{ marginTop: '4px', fontWeight: 700, color: 'var(--accent)' }}>
                      Amount: ₹{points[hoveredPoint].amount.toLocaleString('en-IN')}
                    </div>
                    {graphMode === 'cumulative' && (
                      <div style={{ color: 'var(--success)', fontSize: '0.75rem', marginTop: '2px' }}>
                        Cumulative LTV: ₹{points[hoveredPoint].cumulativeSpend.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ─── AI Memory & Merchant Notes Grid ────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
            {/* AI Inferred Preferences */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '1.2rem' }}>🧠</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  AI Inferred Preferences & Memory
                </h3>
              </div>

              {/* Preferred Categories */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Product Category Affinities
                </div>
                {profile.preferredCategories.length === 0 ? (
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    No specific categories tagged yet.
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {profile.preferredCategories.map((cat, i) => (
                      <span key={i} className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Budget Range Inferred */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Budget Sensitivity
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {profile.budgetRange && (profile.budgetRange.min || profile.budgetRange.max)
                    ? `₹${profile.budgetRange.min || 0} – ₹${profile.budgetRange.max || 'Above'}`
                    : profile.totalSpent > 0
                    ? `Mid-to-High Basket (~₹${profile.averageOrderValue.toLocaleString('en-IN')} per purchase)`
                    : 'Standard Value Seeking'}
                </div>
              </div>

              {/* Inferred Attributes */}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Style, Size & Variant Attributes
                </div>
                {Object.keys(profile.preferredAttributes || {}).filter(
                  (k) => k !== 'merchantNotes' && k !== 'merchantTags'
                ).length === 0 ? (
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    No variant preferences recorded yet.
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {Object.entries(profile.preferredAttributes)
                      .filter(([k]) => k !== 'merchantNotes' && k !== 'merchantTags')
                      .map(([k, v], i) => (
                        <span key={i} className="badge" style={{ fontSize: '0.75rem' }}>
                          <strong>{k}:</strong> {String(v)}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Merchant Internal CRM Notes & Tags */}
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.2rem' }}>📝</span>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    Merchant Private Notes & Tags
                  </h3>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              </div>

              {/* Tags */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Merchant Tags
                </div>
                {profile.merchantTags.length === 0 ? (
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    No tags assigned. Click Edit to add tags like &ldquo;VIP&rdquo; or &ldquo;Frequent Buyer&rdquo;.
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {profile.merchantTags.map((tag, i) => (
                      <span key={i} className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                        🏷️ {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes Content */}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Notes
                </div>
                {profile.merchantNotes ? (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: 'var(--bg-tertiary)', padding: '12px 14px', borderRadius: 'var(--radius-sm)' }}>
                    {profile.merchantNotes}
                  </p>
                ) : (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No internal notes yet. Use notes to document custom courier instructions, special discounts promised, or customer preferences.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: ORDER HISTORY & ITEMS ───────────────────────── */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {profile.orders.length === 0 ? (
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛍️</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Orders Placed Yet</h3>
              <p style={{ fontSize: '0.875rem', marginTop: '6px' }}>
                When this customer places an order via WhatsApp or checkout link, it will appear here with full line items and tracking.
              </p>
            </div>
          ) : (
            profile.orders.map((order) => {
              const statusColorMap: Record<string, string> = {
                DELIVERED: 'badge-success',
                SHIPPED: 'badge-info',
                PROCESSING: 'badge-warning',
                PAYMENT_CONFIRMED: 'badge-info',
                PENDING_PAYMENT: 'badge-warning',
                CANCELLED: 'badge-danger',
                REFUNDED: 'badge-danger',
              };

              return (
                <div key={order.id} className="card" style={{ padding: '20px 24px' }}>
                  {/* Order Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '14px', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Link
                          href={`/orders?search=${order.orderNumber}`}
                          style={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
                        >
                          #{order.orderNumber}
                        </Link>
                        <span className={`badge ${statusColorMap[order.status] || ''}`}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                        {order.paymentMethod && (
                          <span className="badge" style={{ fontSize: '0.7rem' }}>
                            {order.paymentMethod.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Placed on{' '}
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        ₹{order.total.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Subtotal: ₹{order.subtotal.toLocaleString('en-IN')} | Shipping: ₹{order.shippingCharge}
                      </div>
                    </div>
                  </div>

                  {/* Line Items Grid */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-tertiary)',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {item.productImageUrl ? (
                            <img
                              src={item.productImageUrl}
                              alt={item.productName}
                              style={{ width: '42px', height: '42px', borderRadius: '4px', objectFit: 'cover' }}
                            />
                          ) : (
                            <div
                              style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '4px',
                                background: 'var(--bg-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.2rem',
                              }}
                            >
                              📦
                            </div>
                          )}

                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                              {item.productName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                              SKU: {item.productCode} • Qty: {item.quantity} × ₹{item.priceAtOrder.toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>

                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                          ₹{item.totalAtOrder.toLocaleString('en-IN')}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Shipping & Delivery Footer for this Order */}
                  <div
                    style={{
                      marginTop: '16px',
                      paddingTop: '14px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '12px',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Delivery Destination: </span>
                      {order.deliveryAddress ? (
                        <span style={{ color: 'var(--text-primary)' }}>
                          {[
                            order.deliveryAddress.addressLine1,
                            order.deliveryAddress.city,
                            order.deliveryAddress.state,
                            order.deliveryAddress.pincode,
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Not specified</span>
                      )}
                    </div>

                    {order.trackingNumber && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Tracking:</span>
                        <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)' }}>
                          {order.trackingNumber}
                        </code>
                        {order.trackingUrl && (
                          <a
                            href={order.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                          >
                            Track Package ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── TAB 3: DELIVERY DETAILS & ADDRESSES ─────────────────── */}
      {activeTab === 'delivery' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {profile.deliveryAddresses.length === 0 ? (
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📍</div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                No Delivery Addresses Recorded Yet
              </h3>
              <p style={{ fontSize: '0.875rem', marginTop: '6px' }}>
                Addresses provided by the customer during WhatsApp checkout or order placement will be saved here automatically.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
              {profile.deliveryAddresses.map((addr, idx) => (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: '20px',
                    border: idx === 0 ? '1px solid var(--accent)' : '1px solid var(--border)',
                    position: 'relative',
                  }}
                >
                  {idx === 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'var(--accent-subtle)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                      }}
                    >
                      ★ Most Recent
                    </span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '1.2rem' }}>🏡</span>
                    <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {addr.name || profile.customerName || 'Customer Address'}
                    </h4>
                  </div>

                  <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
                    {addr.addressLine1 && <div>{addr.addressLine1}</div>}
                    {addr.addressLine2 && <div>{addr.addressLine2}</div>}
                    {addr.landmark && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                        Landmark: {addr.landmark}
                      </div>
                    )}
                    <div>
                      {[addr.city, addr.state].filter(Boolean).join(', ')}{' '}
                      {addr.pincode && <strong>- {addr.pincode}</strong>}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '4px' }}>
                      {addr.country || 'India'}
                    </div>
                  </div>

                  {addr.phone && (
                    <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      📞 Delivery Phone: <strong style={{ color: 'var(--text-primary)' }}>{addr.phone}</strong>
                    </div>
                  )}

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCopyAddress(addr, idx)}
                    >
                      {copiedAddressIndex === idx ? '✓ Copied!' : '📋 Copy Address'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 4: EMBEDDED WHATSAPP CHAT STREAM ───────────────── */}
      {activeTab === 'chat' && (
        <div className="card" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '640px' }}>
          {/* Chat Header */}
          <div
            style={{
              padding: '14px 20px',
              background: 'var(--bg-tertiary)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ fontSize: '1.25rem' }}>💬</div>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                  WhatsApp Chat with {profile.customerName || profile.customerPhone}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Stage: {profile.conversation?.stage || 'IDLE'} • Language: {profile.preferredLanguage}
                </div>
              </div>
            </div>

            <a
              href={`https://wa.me/${cleanPhone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-success btn-sm"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            >
              Open in WhatsApp Web ↗
            </a>
          </div>

          {/* Messages Scrollable Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              background: '#0b141a', // WhatsApp dark background hue
            }}
          >
            {!profile.conversation || profile.conversation.messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>💬</div>
                No WhatsApp messages on record yet.
                <p style={{ fontSize: '0.8125rem', marginTop: '4px' }}>
                  Messages exchanged between this customer and your AI sales assistant will stream here in real time.
                </p>
              </div>
            ) : (
              profile.conversation.messages.map((m) => {
                const isCustomer = m.role === 'customer' || m.role === 'user';
                const isAgent = m.role === 'agent' || m.role === 'human';

                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isCustomer ? 'flex-start' : 'flex-end',
                      maxWidth: '100%',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '10px 14px',
                        borderRadius: isCustomer ? '14px 14px 14px 2px' : '14px 14px 2px 14px',
                        background: isCustomer
                          ? '#202c33' // WhatsApp incoming bubble
                          : isAgent
                          ? '#1e3a8a' // Merchant manual message
                          : '#005c4b', // WhatsApp outgoing assistant bubble
                        color: '#e9edef',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      {/* Role indicator header */}
                      <div
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: isCustomer ? '#8696a0' : isAgent ? '#93c5fd' : '#53bdeb',
                        }}
                      >
                        {isCustomer ? (
                          <span>👤 {profile.customerName || 'Customer'}</span>
                        ) : isAgent ? (
                          <span>👔 Merchant Agent (You)</span>
                        ) : (
                          <span>🤖 AI Sales Assistant</span>
                        )}
                        {m.intent && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: 'rgba(255,255,255,0.1)',
                              color: '#fff',
                            }}
                          >
                            intent: {m.intent}
                          </span>
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>

                      {/* Timestamp */}
                      <div
                        style={{
                          fontSize: '0.6875rem',
                          color: 'rgba(233, 237, 239, 0.6)',
                          textAlign: 'right',
                          marginTop: '4px',
                        }}
                      >
                        {new Date(m.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick Reply Composer */}
          <form
            onSubmit={handleSendMessage}
            style={{
              padding: '14px 20px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              className="form-input"
              placeholder={`Type a direct WhatsApp reply to ${profile.customerName || profile.customerPhone}...`}
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              disabled={isPending}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending || !chatMessage.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>🚀</span> {isPending ? 'Sending...' : 'Send to Customer'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
