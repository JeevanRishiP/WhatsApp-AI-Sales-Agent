'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

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
          <div style={{ flex: '1 1 240px' }}>
            <input
              type="text"
              placeholder="Search by customer phone or name..."
              className="form-input"
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
                <th>Type</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No customer memories recorded yet. Customers are automatically indexed as they converse on WhatsApp.
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const cleanPhone = c.customerPhone.replace(/\D/g, '');
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Link
                            href={`/customers/${encodeURIComponent(c.customerPhone)}`}
                            style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent)' }}
                          >
                            {c.customerPhone}
                          </Link>
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.85rem' }}
                            title="Chat on WhatsApp"
                          >
                            💬
                          </a>
                        </div>
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        <Link
                          href={`/customers/${encodeURIComponent(c.customerPhone)}`}
                          style={{ color: 'var(--text-primary)', textDecoration: 'none' }}
                        >
                          {c.customerName || '—'}
                        </Link>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{c.totalOrders}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: c.totalSpent > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        ₹{c.totalSpent.toLocaleString('en-IN')}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {c.totalOrders > 0 ? `₹${c.averageOrderValue.toLocaleString('en-IN')}` : '—'}
                      </td>
                      <td>
                        <span className="badge" style={{ textTransform: 'uppercase', fontSize: '0.7rem' }}>
                          {c.preferredLanguage}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${c.isRepeatCustomer ? 'badge-success' : 'badge-info'}`}>
                          {c.isRepeatCustomer ? 'Repeat VIP' : 'Prospect'}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(c.lastContactAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <Link
                            href={`/customers/${encodeURIComponent(c.customerPhone)}`}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                          >
                            Profile →
                          </Link>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                            onClick={() => setSelectedCustomer(c)}
                            title="AI Quick Look"
                          >
                            🧠 Quick
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Page {page} of {totalPages} ({total} total customers)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => handleFilter('page', String(page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
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
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">
                  Customer Memory Profile
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Phone: {selectedCustomer.customerPhone} {selectedCustomer.customerName ? `(${selectedCustomer.customerName})` : ''}
                </span>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setSelectedCustomer(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Commerce Metrics Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  background: 'var(--bg-tertiary)',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Lifetime Value
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '2px', color: 'var(--accent)' }}>
                    ₹{selectedCustomer.totalSpent.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Total Orders
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '2px' }}>
                    {selectedCustomer.totalOrders}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Messages Exchanged
                  </div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '2px' }}>
                    {selectedCustomer.totalMessages}
                  </div>
                </div>
              </div>

              {/* Preferred Categories */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
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

              {/* Customer Attributes / Preferences */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '6px' }}>
                  AI Inferred Preferences & Attributes
                </div>
                <div
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    maxHeight: '160px',
                    overflowY: 'auto',
                  }}
                >
                  {selectedCustomer.preferredAttributes &&
                  Object.keys(selectedCustomer.preferredAttributes).length > 0 ? (
                    <pre style={{ margin: 0 }}>
                      {JSON.stringify(selectedCustomer.preferredAttributes, null, 2)}
                    </pre>
                  ) : (
                    '{"notes": "Buyer prefers COD or standard UPI, standard delivery"}'
                  )}
                </div>
              </div>

              {/* Engagement Timeline */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <div>
                  <strong>First Contact:</strong>{' '}
                  {new Date(selectedCustomer.firstContactAt).toLocaleDateString('en-IN')}
                </div>
                <div>
                  <strong>Last Contact:</strong>{' '}
                  {new Date(selectedCustomer.lastContactAt).toLocaleDateString('en-IN')}
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Link
                  href={`/customers/${encodeURIComponent(selectedCustomer.customerPhone)}`}
                  className="btn btn-primary btn-sm"
                >
                  Open Full Customer Profile Cockpit →
                </Link>
                <a
                  href={`https://wa.me/${selectedCustomer.customerPhone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  WhatsApp ↗
                </a>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
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
