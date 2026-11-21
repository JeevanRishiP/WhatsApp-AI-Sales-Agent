'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Filter,
  User,
  Phone,
  ShoppingBag,
  ExternalLink,
  Brain,
  ArrowUpRight,
  X,
  Sparkles,
  Calendar,
  MessageSquare,
  Users,
} from 'lucide-react';
import { formatDate, formatDateShort } from '@/lib/format';

interface CustomerRecord {
  id: string;
  customerPhone: string;
  customerName: string | null;
  preferredCategories: string[];
  preferredAttributes: any;
  budgetRange: any;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: any;
  averageOrderValue: number;
  isRepeatCustomer: boolean;
  preferredLanguage: string;
  totalMessages: number;
  firstContactAt: any;
  lastContactAt: any;
}

interface CustomersClientProps {
  customers: CustomerRecord[];
  total: number;
  page: number;
  totalPages: number;
}

export function CustomersClient({ customers, total, page, totalPages }: CustomersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);

  const currentSearch = searchParams.get('search') || '';
  const currentSort = searchParams.get('sortBy') || 'recent_contact';
  const currentRepeat = searchParams.get('isRepeat') || '';

  const handleFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`/customers?${params.toString()}`);
  };

  return (
    <div>
      {/* Search & Sort Controls */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-input-wrapper" style={{ flex: '1 1 260px', maxWidth: 'none' }}>
            <span className="search-icon">
              <Search size={15} />
            </span>
            <input
              type="text"
              placeholder="Search by customer phone or name..."
              className="search-input"
              defaultValue={currentSearch}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilter('search', (e.target as HTMLInputElement).value);
                }
              }}
            />
          </div>

          <div style={{ width: '180px' }}>
            <select
              className="form-select"
              value={currentRepeat}
              onChange={(e) => handleFilter('isRepeat', e.target.value)}
            >
              <option value="">All Customers</option>
              <option value="true">Repeat Buyers</option>
              <option value="false">First-time / Inquirers</option>
            </select>
          </div>

          <div style={{ width: '180px' }}>
            <select
              className="form-select"
              value={currentSort}
              onChange={(e) => handleFilter('sortBy', e.target.value)}
            >
              <option value="recent_contact">Recent Contact</option>
              <option value="most_spent">Highest LTV / Spent</option>
              <option value="most_orders">Most Orders</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Customer Phone</th>
                <th>Name</th>
                <th>Orders</th>
                <th>Total Spent</th>
                <th>Avg Order Value</th>
                <th>Language</th>
                <th>Tier</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                    <Users size={28} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
                    <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No customer memories indexed yet</p>
                    <p style={{ fontSize: '0.75rem', marginTop: '2px' }}>Customers are automatically indexed as they converse on WhatsApp.</p>
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const cleanPhone = c.customerPhone.replace(/\D/g, '');
                  const initial = (c.customerName || c.customerPhone || 'U').charAt(0).toUpperCase();

                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Link
                            href={`/customers/${encodeURIComponent(c.customerPhone)}`}
                            style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8125rem' }}
                          >
                            {c.customerPhone}
                          </Link>
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--whatsapp)', display: 'inline-flex' }}
                            title="Chat on WhatsApp"
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: 'var(--bg-tertiary)',
                              border: '1px solid var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {initial}
                          </div>
                          <Link
                            href={`/customers/${encodeURIComponent(c.customerPhone)}`}
                            style={{ fontWeight: 500, color: 'var(--text-primary)' }}
                          >
                            {c.customerName || 'Anonymous'}
                          </Link>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.totalOrders}</span>
                      </td>
                      <td style={{ fontWeight: 700, color: c.totalSpent > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        ₹{c.totalSpent.toLocaleString('en-IN')}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {c.totalOrders > 0 ? `₹${c.averageOrderValue.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontSize: '0.625rem' }}>
                          {c.preferredLanguage}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${c.isRepeatCustomer ? 'badge-success' : 'badge-info'}`}>
                          {c.isRepeatCustomer ? 'Repeat VIP' : 'Prospect'}
                        </span>
                      </td>
                      <td
                        style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
                        suppressHydrationWarning
                      >
                        {formatDateShort(c.lastContactAt)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          <Link
                            href={`/customers/${encodeURIComponent(c.customerPhone)}`}
                            className="btn btn-secondary btn-sm"
                          >
                            Profile
                          </Link>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedCustomer(c)}
                            title="AI Quick Look"
                          >
                            <Brain size={12} />
                            <span>Memory</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="table-footer">
            <span>
              Page {page} of {totalPages} ({total} total customers)
            </span>
            <div className="pagination">
              <button
                type="button"
                className="pagination-btn"
                disabled={page <= 1}
                onClick={() => handleFilter('page', String(page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="pagination-btn"
                disabled={page >= totalPages}
                onClick={() => handleFilter('page', String(page + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer AI Memory Modal */}
      {selectedCustomer && (
        <div className="modal-backdrop" onClick={() => setSelectedCustomer(null)}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Brain size={18} style={{ color: 'var(--accent)' }} />
                  <span>AI Customer Memory</span>
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  {selectedCustomer.customerPhone} {selectedCustomer.customerName ? `(${selectedCustomer.customerName})` : ''}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setSelectedCustomer(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Commerce Metrics Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  background: 'var(--bg-tertiary)',
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '18px',
                  textAlign: 'center',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Lifetime Value
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '3px', color: '#818CF8', fontFamily: 'var(--font-mono)' }}>
                    ₹{selectedCustomer.totalSpent.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Orders
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '3px', color: 'var(--text-primary)' }}>
                    {selectedCustomer.totalOrders}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Messages
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '3px', color: 'var(--text-primary)' }}>
                    {selectedCustomer.totalMessages}
                  </div>
                </div>
              </div>

              {/* Preferred Categories */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  Frequently Explored Categories
                </div>
                {selectedCustomer.preferredCategories.length > 0 ? (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {selectedCustomer.preferredCategories.map((cat) => (
                      <span key={cat} className="badge badge-info">
                        {cat}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    No specific category preference detected yet.
                  </span>
                )}
              </div>

              {/* Inferred Preferences */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  AI Inferred Preferences & Memory
                </div>
                <div
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8125rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                    border: '1px solid var(--border)',
                  }}
                >
                  {selectedCustomer.preferredAttributes &&
                  Object.keys(selectedCustomer.preferredAttributes).length > 0 ? (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(selectedCustomer.preferredAttributes, null, 2)}
                    </pre>
                  ) : (
                    '{"notes": "Buyer prefers COD or standard UPI, standard delivery"}'
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <div suppressHydrationWarning>
                  <strong style={{ color: 'var(--text-muted)' }}>First Contact:</strong>{' '}
                  {formatDate(selectedCustomer.firstContactAt)}
                </div>
                <div suppressHydrationWarning>
                  <strong style={{ color: 'var(--text-muted)' }}>Last Contact:</strong>{' '}
                  {formatDate(selectedCustomer.lastContactAt)}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link
                  href={`/customers/${encodeURIComponent(selectedCustomer.customerPhone)}`}
                  className="btn btn-primary btn-sm"
                >
                  <span>Full Profile</span>
                  <ArrowUpRight size={13} />
                </Link>
                <a
                  href={`https://wa.me/${selectedCustomer.customerPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <span>WhatsApp</span>
                  <ExternalLink size={12} />
                </a>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedCustomer(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
