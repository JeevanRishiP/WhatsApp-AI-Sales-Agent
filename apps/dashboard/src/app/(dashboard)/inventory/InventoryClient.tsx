'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createProductAction,
  updateProductAction,
  archiveProductAction,
  updateStockAction,
  bulkImportProductsAction,
} from '../../../lib/actions/products';

interface ProductItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  price: any;
  salePrice: any;
  stock: number;
  lowStockThreshold: number;
  status: string;
  tags: string[];
  createdAt: any;
}

interface InventoryClientProps {
  products: ProductItem[];
  categories: string[];
  total: number;
  page: number;
  totalPages: number;
  lowStockCount: number;
}

export function InventoryClient({
  products,
  categories,
  total,
  page,
  totalPages,
  lowStockCount,
}: InventoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [stockEditProduct, setStockEditProduct] = useState<ProductItem | null>(null);
  const [stockValue, setStockValue] = useState<number>(0);
  const [stockNote, setStockNote] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleExportCSV = () => {
    const headers = ['Code', 'Name', 'Category', 'Price', 'SalePrice', 'Stock', 'Threshold', 'Status'];
    const rows = products.map((p) => [
      `"${p.code}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${(p.category || '').replace(/"/g, '""')}"`,
      p.price,
      p.salePrice || '',
      p.stock,
      p.lowStockThreshold,
      p.status,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `catalog_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter state from URL
  const currentSearch = searchParams.get('search') || '';
  const currentCategory = searchParams.get('category') || '';
  const currentStatus = searchParams.get('status') || '';

  const handleFilterChange = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`/inventory?${params.toString()}`);
  };

  const handleQuickStockUpdate = async (product: ProductItem, newStock: number) => {
    setErrorMessage(null);
    const delta = newStock - product.stock;
    if (delta === 0) {
      setStockEditProduct(null);
      setStockNote('');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch('/api/inventory/stock-adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adjustments: [
              {
                productId: product.id,
                delta,
                note: stockNote.trim() || (delta > 0 ? `Restocked +${delta} units` : `Stock adjusted ${delta} units`),
              },
            ],
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error || 'Failed to adjust stock');
        } else {
          setStockEditProduct(null);
          setStockNote('');
          setSuccessMessage(`Stock updated for ${product.name} (${delta > 0 ? '+' : ''}${delta})`);
          router.refresh();
        }
      } catch {
        // Fallback to direct server action
        const fallback = await updateStockAction(product.id, newStock);
        if (fallback?.error) {
          setErrorMessage(fallback.error);
        } else {
          setStockEditProduct(null);
          setStockNote('');
          setSuccessMessage(`Stock updated for ${product.name}`);
          router.refresh();
        }
      }
    });
  };

  const handleArchive = async (product: ProductItem) => {
    if (!confirm(`Are you sure you want to archive "${product.name}"?`)) return;
    setErrorMessage(null);
    startTransition(async () => {
      const res = await archiveProductAction(product.id);
      if (res?.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage(`Archived "${product.name}"`);
        router.refresh();
      }
    });
  };

  return (
    <div>
      {/* Top Controls: Search and Filters */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px' }}>
            <input
              type="text"
              placeholder="Search by name, SKU/code, or category..."
              className="form-input"
              defaultValue={currentSearch}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilterChange('search', (e.target as HTMLInputElement).value);
                }
              }}
            />
          </div>

          <div style={{ width: '180px' }}>
            <select
              className="form-select"
              value={currentCategory}
              onChange={(e) => handleFilterChange('category', e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: '160px' }}>
            <select
              className="form-select"
              value={currentStatus}
              onChange={(e) => handleFilterChange('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="OUT_OF_STOCK">Out of Stock</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCSV}
              title="Export visible catalog items to CSV"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowImportModal(true)}
              title="Bulk upload items via CSV"
            >
              📤 Bulk Import
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              + Add Product
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div
          style={{
            padding: '12px',
            marginBottom: '16px',
            background: 'var(--danger-bg)',
            color: 'var(--danger)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div
          style={{
            padding: '12px',
            marginBottom: '16px',
            background: 'var(--success-bg)',
            color: 'var(--success)',
            border: '1px solid var(--success)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {successMessage}
        </div>
      )}

      {/* Product Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Code / SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No products found matching criteria. Click "+ Add Product" to create your first item.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isLow = p.stock <= p.lowStockThreshold && p.status === 'ACTIVE';
                  return (
                    <tr key={p.id}>
                      <td>
                        <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {p.code}
                        </code>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        {p.description && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                              maxWidth: '300px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td>{p.category || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          ₹{Number(p.price).toLocaleString('en-IN')}
                        </div>
                        {p.salePrice && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>
                            Sale: ₹{Number(p.salePrice).toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            className={`badge ${
                              p.stock === 0
                                ? 'badge-danger'
                                : isLow
                                ? 'badge-warning'
                                : 'badge-success'
                            }`}
                          >
                            {p.stock} units
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setStockEditProduct(p);
                              setStockValue(p.stock);
                              setStockNote('');
                            }}
                            title="Quick Adjust Stock"
                          >
                            ✏️
                          </button>
                        </div>
                        {isLow && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--warning)', marginTop: '2px' }}>
                            Alert ≤ {p.lowStockThreshold}
                          </div>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            p.status === 'ACTIVE'
                              ? 'badge-success'
                              : p.status === 'ARCHIVED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingProduct(p)}
                          >
                            Edit
                          </button>
                          {p.status !== 'ARCHIVED' && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleArchive(p)}
                              disabled={isPending}
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
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
              Showing Page {page} of {totalPages} ({total} total products)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => handleFilterChange('page', String(page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => handleFilterChange('page', String(page + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Create New Catalog Product</h2>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>
            <form
              action={async (formData) => {
                setErrorMessage(null);
                startTransition(async () => {
                  const res = await createProductAction({}, formData);
                  if (res?.error) {
                    setErrorMessage(res.error);
                  } else {
                    setShowAddModal(false);
                    setSuccessMessage('Product created successfully');
                    router.refresh();
                  }
                });
              }}
            >
              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">SKU / Code *</label>
                    <input
                      name="code"
                      required
                      placeholder="e.g. TSHIRT-BLK-M"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Product Name *</label>
                    <input
                      name="name"
                      required
                      placeholder="e.g. Classic Cotton T-Shirt"
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      name="category"
                      placeholder="e.g. Apparel"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Subcategory</label>
                    <input
                      name="subcategory"
                      placeholder="e.g. Men's Tops"
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Price (INR) *</label>
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      required
                      placeholder="799"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sale Price (Optional)</label>
                    <input
                      name="salePrice"
                      type="number"
                      step="0.01"
                      placeholder="699"
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Initial Stock Units *</label>
                    <input
                      name="stock"
                      type="number"
                      required
                      defaultValue={10}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Low Stock Alert Threshold</label>
                    <input
                      name="lowStockThreshold"
                      type="number"
                      defaultValue={5}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Description (AI uses this when describing to buyers)</label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Premium 100% combed cotton, breathable fit, available in black."
                    className="form-textarea"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Tags (comma-separated)</label>
                    <input
                      name="tags"
                      placeholder="summer, cotton, best-seller"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select name="status" className="form-select" defaultValue="ACTIVE">
                      <option value="ACTIVE">Active (Live in WhatsApp Catalog)</option>
                      <option value="DRAFT">Draft</option>
                      <option value="OUT_OF_STOCK">Out of Stock</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Saving...' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Product ({editingProduct.code})</h2>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setEditingProduct(null)}
              >
                ✕
              </button>
            </div>
            <form
              action={async (formData) => {
                setErrorMessage(null);
                startTransition(async () => {
                  const res = await updateProductAction(editingProduct.id, {}, formData);
                  if (res?.error) {
                    setErrorMessage(res.error);
                  } else {
                    setEditingProduct(null);
                    setSuccessMessage(`Updated ${editingProduct.name}`);
                    router.refresh();
                  }
                });
              }}
            >
              <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                <div className="form-group">
                  <label className="form-label">Product Name</label>
                  <input
                    name="name"
                    defaultValue={editingProduct.name}
                    required
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input
                      name="category"
                      defaultValue={editingProduct.category || ''}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      name="status"
                      className="form-select"
                      defaultValue={editingProduct.status}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="DRAFT">Draft</option>
                      <option value="OUT_OF_STOCK">Out of Stock</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Price (INR)</label>
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      defaultValue={Number(editingProduct.price)}
                      required
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sale Price (Optional)</label>
                    <input
                      name="salePrice"
                      type="number"
                      step="0.01"
                      defaultValue={editingProduct.salePrice ? Number(editingProduct.salePrice) : ''}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Stock Units</label>
                    <input
                      name="stock"
                      type="number"
                      defaultValue={editingProduct.stock}
                      required
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Low Stock Threshold</label>
                    <input
                      name="lowStockThreshold"
                      type="number"
                      defaultValue={editingProduct.lowStockThreshold}
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Description</label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={editingProduct.description || ''}
                    className="form-textarea"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingProduct(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Stock Adjustment Modal */}
      {stockEditProduct && (() => {
        const delta = stockValue - stockEditProduct.stock;
        return (
          <div className="modal-backdrop">
            <div className="modal-content" style={{ maxWidth: '440px' }}>
              <div className="modal-header">
                <h2 className="modal-title">Adjust Stock: {stockEditProduct.name}</h2>
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                  onClick={() => setStockEditProduct(null)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Current in stock: <strong>{stockEditProduct.stock} units</strong>
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: delta > 0 ? 'rgba(16,185,129,0.1)' : delta < 0 ? 'rgba(239,68,68,0.1)' : 'var(--bg-tertiary)',
                      color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)',
                    }}
                  >
                    {delta > 0 ? `+${delta} units` : delta < 0 ? `${delta} units` : 'No change'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStockValue((prev) => Math.max(0, prev - 1))}
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStockValue((prev) => Math.max(0, prev - 5))}
                  >
                    -5
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={stockValue}
                    onChange={(e) => setStockValue(Math.max(0, parseInt(e.target.value) || 0))}
                    className="form-input"
                    style={{ textAlign: 'center', fontWeight: 600, fontSize: '1.1rem' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStockValue((prev) => prev + 1)}
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStockValue((prev) => prev + 5)}
                  >
                    +5
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Reason / Note for Audit Log</label>
                  <input
                    type="text"
                    placeholder="e.g. Inbound supplier shipment, damaged unit, physical count"
                    value={stockNote}
                    onChange={(e) => setStockNote(e.target.value)}
                    className="form-input"
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStockEditProduct(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isPending || delta === 0}
                  onClick={() => handleQuickStockUpdate(stockEditProduct, stockValue)}
                >
                  {isPending ? 'Saving...' : delta > 0 ? `Add ${delta} to Stock` : delta < 0 ? `Deduct ${Math.abs(delta)} from Stock` : 'Save Stock'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk CSV Import Modal */}
      {showImportModal && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Bulk Import Products via CSV</h2>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setShowImportModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Paste CSV text or upload a CSV file with columns:
                <br />
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>
                  code, name, price, stock, category, description
                </code>
              </p>

              <div style={{ marginBottom: '12px' }}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setImportCsvText(event.target?.result as string || '');
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className="form-input"
                  style={{ fontSize: '0.8125rem' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Or Paste CSV Data Directly:</label>
                <textarea
                  rows={8}
                  value={importCsvText}
                  onChange={(e) => setImportCsvText(e.target.value)}
                  placeholder={`code,name,price,stock,category,description\nTSHIRT-01,Classic Black Tee,599,25,Apparel,Comfort cotton crew neck\nHOODIE-02,Grey Pullover Hoodie,1299,10,Apparel,Fleece lined winter hoodie`}
                  className="form-textarea"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowImportModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isPending || !importCsvText.trim()}
                onClick={() => {
                  setErrorMessage(null);
                  startTransition(async () => {
                    const res = await bulkImportProductsAction(importCsvText);
                    if (res?.error) {
                      setErrorMessage(res.error);
                    } else {
                      setShowImportModal(false);
                      setImportCsvText('');
                      setSuccessMessage(`Successfully imported ${res.importedCount} products into your catalog!`);
                      router.refresh();
                    }
                  });
                }}
              >
                {isPending ? 'Importing Items...' : 'Start Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
