'use client';

import { useState, useEffect, useTransition, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createProductAction,
  updateProductAction,
  archiveProductAction,
  updateStockAction,
  bulkImportProductsAction,
  updateProductImagesAction,
  uploadProductImageAction,
  removeProductImageAction,
  setPrimaryProductImageAction,
} from '../../../lib/actions/products';
import {
  Search,
  Download,
  Upload,
  Plus,
  Edit2,
  Trash2,
  Package,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
  Tag,
  ChevronRight,
  Boxes,
  Camera,
  Image as ImageIcon,
  Star,
  Eye,
  ArrowLeft,
  ArrowRight,
  UploadCloud,
  Copy,
  Check,
  ExternalLink,
  Maximize2,
  Loader2,
  Link as LinkIcon,
} from 'lucide-react';

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
  imageUrls: string[];
  thumbnailUrl: string | null;
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

  // Local synced item state for instant responsive UI
  const [items, setItems] = useState<ProductItem[]>(products);
  useEffect(() => {
    setItems(products);
  }, [products]);

  // Photo Management state
  const [photoProduct, setPhotoProduct] = useState<ProductItem | null>(null);
  const [activePhotoTab, setActivePhotoTab] = useState<'upload' | 'url'>('upload');
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const [photoStatusMessage, setPhotoStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateProductInState = (productId: string, imageUrls: string[], thumbnailUrl?: string | null) => {
    const effectiveThumb = thumbnailUrl !== undefined ? thumbnailUrl : (imageUrls[0] || null);
    setItems((prev) =>
      prev.map((item) =>
        item.id === productId
          ? { ...item, imageUrls, thumbnailUrl: effectiveThumb }
          : item
      )
    );
    if (photoProduct && photoProduct.id === productId) {
      setPhotoProduct({
        ...photoProduct,
        imageUrls,
        thumbnailUrl: effectiveThumb,
      });
    }
  };

  const handleUploadFiles = async (files: FileList | null) => {
    if (!photoProduct || !files || files.length === 0) return;
    setIsPhotoLoading(true);
    setPhotoStatusMessage(null);

    let successCount = 0;
    let latestImageUrls = [...(photoProduct.imageUrls || [])];
    let latestThumbnail = photoProduct.thumbnailUrl;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        const res = await uploadProductImageAction(photoProduct.id, formData);
        if (res.success && res.imageUrls) {
          successCount++;
          latestImageUrls = res.imageUrls;
          latestThumbnail = res.thumbnailUrl || latestImageUrls[0] || null;
        } else if (res.error) {
          setPhotoStatusMessage({ type: 'error', text: res.error });
          break;
        }
      }

      if (successCount > 0) {
        updateProductInState(photoProduct.id, latestImageUrls, latestThumbnail);
        setPhotoStatusMessage({
          type: 'success',
          text: `Successfully added ${successCount} ${successCount === 1 ? 'photo' : 'photos'}!`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setPhotoStatusMessage({ type: 'error', text: err.message || 'Upload failed' });
    } finally {
      setIsPhotoLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddPhotoUrl = async () => {
    if (!photoProduct || !newPhotoUrl.trim()) return;
    const url = newPhotoUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('/')) {
      setPhotoStatusMessage({ type: 'error', text: 'Please enter a valid HTTP or HTTPS image URL' });
      return;
    }

    setIsPhotoLoading(true);
    setPhotoStatusMessage(null);

    try {
      const nextUrls = [...(photoProduct.imageUrls || []), url];
      const res = await updateProductImagesAction(photoProduct.id, nextUrls);
      if (res.success && res.imageUrls) {
        updateProductInState(photoProduct.id, res.imageUrls, res.thumbnailUrl);
        setNewPhotoUrl('');
        setPhotoStatusMessage({ type: 'success', text: 'Photo URL added to gallery!' });
        router.refresh();
      } else {
        setPhotoStatusMessage({ type: 'error', text: res.error || 'Failed to add photo URL' });
      }
    } catch (err: any) {
      setPhotoStatusMessage({ type: 'error', text: err.message || 'Failed to add photo' });
    } finally {
      setIsPhotoLoading(false);
    }
  };

  const handleRemovePhoto = async (imageUrl: string) => {
    if (!photoProduct) return;
    if (!confirm('Are you sure you want to remove this photo?')) return;

    setIsPhotoLoading(true);
    setPhotoStatusMessage(null);

    try {
      const res = await removeProductImageAction(photoProduct.id, imageUrl);
      if (res.success && res.imageUrls) {
        updateProductInState(photoProduct.id, res.imageUrls, res.thumbnailUrl);
        setPhotoStatusMessage({ type: 'success', text: 'Photo removed from item' });
        router.refresh();
      } else {
        setPhotoStatusMessage({ type: 'error', text: res.error || 'Failed to remove photo' });
      }
    } catch (err: any) {
      setPhotoStatusMessage({ type: 'error', text: err.message || 'Failed to remove photo' });
    } finally {
      setIsPhotoLoading(false);
    }
  };

  const handleSetPrimary = async (imageUrl: string) => {
    if (!photoProduct) return;
    setIsPhotoLoading(true);
    setPhotoStatusMessage(null);

    try {
      const res = await setPrimaryProductImageAction(photoProduct.id, imageUrl);
      if (res.success && res.imageUrls) {
        updateProductInState(photoProduct.id, res.imageUrls, res.thumbnailUrl);
        setPhotoStatusMessage({ type: 'success', text: 'Set as primary cover photo!' });
        router.refresh();
      } else {
        setPhotoStatusMessage({ type: 'error', text: res.error || 'Failed to set cover photo' });
      }
    } catch (err: any) {
      setPhotoStatusMessage({ type: 'error', text: err.message || 'Failed to set cover photo' });
    } finally {
      setIsPhotoLoading(false);
    }
  };

  const handleMovePhoto = async (fromIdx: number, toIdx: number) => {
    if (!photoProduct || !photoProduct.imageUrls) return;
    const urls = [...photoProduct.imageUrls];
    if (toIdx < 0 || toIdx >= urls.length) return;

    const [moved] = urls.splice(fromIdx, 1);
    urls.splice(toIdx, 0, moved);

    setIsPhotoLoading(true);
    setPhotoStatusMessage(null);

    try {
      const res = await updateProductImagesAction(photoProduct.id, urls, urls[0]);
      if (res.success && res.imageUrls) {
        updateProductInState(photoProduct.id, res.imageUrls, res.thumbnailUrl);
        setPhotoStatusMessage({ type: 'success', text: 'Photo order updated!' });
        router.refresh();
      } else {
        setPhotoStatusMessage({ type: 'error', text: res.error || 'Failed to reorder' });
      }
    } catch (err: any) {
      setPhotoStatusMessage({ type: 'error', text: err.message || 'Failed to reorder' });
    } finally {
      setIsPhotoLoading(false);
    }
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

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
          <div className="search-input-wrapper" style={{ flex: '1 1 260px', maxWidth: 'none' }}>
            <span className="search-icon">
              <Search size={15} />
            </span>
            <input
              type="text"
              placeholder="Search by name, SKU/code, or category..."
              className="search-input"
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

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleExportCSV}
              title="Export visible catalog items to CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowImportModal(true)}
              title="Bulk upload items via CSV"
            >
              <Upload size={14} />
              <span>Bulk Import</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={15} />
              <span>Add Product</span>
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="alert alert-error">
          <AlertTriangle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Product Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '68px', textAlign: 'center' }}>Photo</th>
                <th>Code / SKU</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock Level</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                    <Boxes size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No products found matching criteria</p>
                    <p style={{ fontSize: '0.75rem', marginTop: '2px' }}>Click "+ Add Product" to create your first catalog item.</p>
                  </td>
                </tr>
              ) : (
                items.map((p) => {
                  const isLow = p.stock <= p.lowStockThreshold && p.status === 'ACTIVE';
                  const hasPhotos = p.imageUrls && p.imageUrls.length > 0;
                  const displayThumb = p.thumbnailUrl || (hasPhotos ? p.imageUrls[0] : null);

                  return (
                    <tr key={p.id}>
                      <td style={{ textAlign: 'center', padding: '8px 12px' }}>
                        <div
                          onClick={() => {
                            setPhotoProduct(p);
                            setPhotoStatusMessage(null);
                          }}
                          title={hasPhotos ? `View & manage ${p.imageUrls.length} photos` : 'Upload or add photos'}
                          style={{
                            width: '46px',
                            height: '46px',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                            border: hasPhotos ? '1.5px solid var(--border-light)' : '1.5px dashed var(--border)',
                            background: 'var(--bg-tertiary)',
                            position: 'relative',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.18s ease',
                            boxShadow: hasPhotos ? '0 2px 5px rgba(0,0,0,0.3)' : 'none',
                          }}
                        >
                          {hasPhotos && displayThumb ? (
                            <>
                              <img
                                src={displayThumb}
                                alt={p.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                onError={(e) => {
                                  (e.target as any).style.display = 'none';
                                }}
                              />
                              {p.imageUrls.length > 1 && (
                                <span
                                  style={{
                                    position: 'absolute',
                                    bottom: '2px',
                                    right: '2px',
                                    background: 'rgba(0, 0, 0, 0.78)',
                                    color: '#fff',
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    lineHeight: 1,
                                    border: '1px solid rgba(255, 255, 255, 0.15)',
                                  }}
                                >
                                  +{p.imageUrls.length - 1}
                                </span>
                              )}
                            </>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '1px',
                                color: 'var(--text-muted)',
                              }}
                            >
                              <Camera size={14} />
                              <span style={{ fontSize: '8px', fontWeight: 600 }}>+Add</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <code
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {p.code}
                        </code>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                        {p.description && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-muted)',
                              maxWidth: '320px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              marginTop: '2px',
                            }}
                          >
                            {p.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-neutral">{p.category || 'General'}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                          ₹{Number(p.price).toLocaleString('en-IN')}
                        </div>
                        {p.salePrice && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
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
                            style={{ padding: '3px 7px', fontSize: '0.75rem' }}
                            onClick={() => {
                              setStockEditProduct(p);
                              setStockValue(p.stock);
                              setStockNote('');
                            }}
                            title="Quick Adjust Stock"
                          >
                            <Edit2 size={12} />
                          </button>
                        </div>
                        {isLow && (
                          <div style={{ fontSize: '0.6875rem', color: '#FBBF24', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <AlertTriangle size={11} />
                            <span>Min {p.lowStockThreshold} units</span>
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
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => {
                              setPhotoProduct(p);
                              setPhotoStatusMessage(null);
                            }}
                            title="Manage Photos"
                          >
                            <Camera size={12} />
                            <span>Photos ({p.imageUrls?.length || 0})</span>
                          </button>
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
          <div className="table-footer">
            <span>
              Showing Page {page} of {totalPages} ({total} total products)
            </span>
            <div className="pagination">
              <button
                type="button"
                className="pagination-btn"
                disabled={page <= 1}
                onClick={() => handleFilterChange('page', String(page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="pagination-btn"
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
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create Catalog Product</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setShowAddModal(false)}
              >
                <X size={18} />
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
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
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

                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label">Description (AI uses this when recommending to buyers)</label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Premium 100% combed cotton, breathable fit, available in black."
                    className="form-textarea"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">Tags (comma-separated)</label>
                    <input
                      name="tags"
                      placeholder="summer, cotton, bestseller"
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

                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label">Photo URLs (Optional - comma or line separated)</label>
                  <textarea
                    name="imageUrls"
                    rows={2}
                    placeholder="https://images.unsplash.com/photo-1..., https://... (You can also upload images directly after creation)"
                    className="form-textarea"
                    style={{ fontSize: '0.8125rem' }}
                  />
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
        <div className="modal-backdrop" onClick={() => setEditingProduct(null)}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Product ({editingProduct.code})</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setEditingProduct(null)}
              >
                <X size={18} />
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
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Product Name</label>
                  <input
                    name="name"
                    defaultValue={editingProduct.name}
                    required
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
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

                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label">Description</label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={editingProduct.description || ''}
                    className="form-textarea"
                  />
                </div>

                <div className="form-group" style={{ marginTop: '14px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Camera size={15} style={{ color: 'var(--accent)' }} />
                      <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>Item Photos ({editingProduct.imageUrls?.length || 0})</label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '3px 9px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      onClick={() => {
                        setPhotoProduct(editingProduct);
                        setEditingProduct(null);
                        setPhotoStatusMessage(null);
                      }}
                    >
                      <Camera size={12} />
                      <span>Open Photo Manager</span>
                    </button>
                  </div>
                  <textarea
                    name="imageUrls"
                    rows={2}
                    defaultValue={(editingProduct.imageUrls || []).join('\n')}
                    placeholder="https://... (paste direct image links, one per line)"
                    className="form-textarea"
                    style={{ fontSize: '0.8125rem' }}
                  />
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Paste image URLs above or click "Open Photo Manager" to upload directly from your Mac / device.
                  </div>
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
          <div className="modal-backdrop" onClick={() => setStockEditProduct(null)}>
            <div className="modal-content" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Adjust Stock: {stockEditProduct.name}</h2>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '6px' }}
                  onClick={() => setStockEditProduct(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Current in stock: <strong style={{ color: 'var(--text-primary)' }}>{stockEditProduct.stock} units</strong>
                  </span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: delta > 0 ? 'var(--success-bg)' : delta < 0 ? 'var(--danger-bg)' : 'var(--bg-tertiary)',
                      color: delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-muted)',
                      border: `1px solid ${delta > 0 ? 'var(--success-border)' : delta < 0 ? 'var(--danger-border)' : 'var(--border)'}`,
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
                    style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.125rem', fontFamily: 'var(--font-mono)' }}
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
                  <label className="form-label">Audit Log Justification</label>
                  <input
                    type="text"
                    placeholder="e.g. Inbound supplier shipment, physical count correction"
                    value={stockNote}
                    onChange={(e) => setStockNote(e.target.value)}
                    className="form-input"
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
                  {isPending ? 'Saving...' : delta > 0 ? `Add +${delta} to Stock` : delta < 0 ? `Deduct ${Math.abs(delta)}` : 'Save Stock'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk CSV Import Modal */}
      {showImportModal && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Bulk Import Products via CSV</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setShowImportModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Paste CSV text or upload a CSV file with columns:
                <br />
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginTop: '4px', display: 'inline-block' }}>
                  code, name, price, stock, category, description
                </code>
              </p>

              <div style={{ marginBottom: '14px' }}>
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
                  rows={7}
                  value={importCsvText}
                  onChange={(e) => setImportCsvText(e.target.value)}
                  placeholder={`code,name,price,stock,category,description\nTSHIRT-01,Classic Black Tee,599,25,Apparel,Comfort cotton crew neck\nHOODIE-02,Grey Pullover Hoodie,1299,10,Apparel,Fleece lined winter hoodie`}
                  className="form-textarea"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
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

      {/* ─── Photo Manager Modal ────────────────────────────────────── */}
      {photoProduct && (
        <div className="modal-backdrop" onClick={() => setPhotoProduct(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '820px', width: '94%', maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--accent-subtle)',
                    border: '1px solid var(--accent-glow)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                  }}
                >
                  <Camera size={18} />
                </div>
                <div>
                  <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Manage Item Photos</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border)',
                        color: 'var(--accent)',
                      }}
                    >
                      {photoProduct.imageUrls?.length || 0} {photoProduct.imageUrls?.length === 1 ? 'Photo' : 'Photos'}
                    </span>
                  </h2>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{photoProduct.name}</span>
                    <span>•</span>
                    <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{photoProduct.code}</code>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setPhotoProduct(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Photo Status Message */}
              {photoStatusMessage && (
                <div
                  className={`alert ${
                    photoStatusMessage.type === 'success' ? 'alert-success' : 'alert-error'
                  }`}
                  style={{ padding: '8px 12px', fontSize: '0.8125rem' }}
                >
                  {photoStatusMessage.type === 'success' ? (
                    <CheckCircle2 size={15} />
                  ) : (
                    <AlertTriangle size={15} />
                  )}
                  <span>{photoStatusMessage.text}</span>
                </div>
              )}

              {/* Add Photos Section */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  padding: '16px',
                }}
              >
                {/* Method Tabs */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setActivePhotoTab('upload')}
                    style={{
                      background: activePhotoTab === 'upload' ? 'var(--accent)' : 'transparent',
                      color: activePhotoTab === 'upload' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 12px',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <UploadCloud size={14} />
                    <span>Upload from Mac / Device</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePhotoTab('url')}
                    style={{
                      background: activePhotoTab === 'url' ? 'var(--accent)' : 'transparent',
                      color: activePhotoTab === 'url' ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 12px',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <LinkIcon size={14} />
                    <span>Add by Web URL</span>
                  </button>
                </div>

                {/* Tab 1: Upload from Device */}
                {activePhotoTab === 'upload' && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                      style={{ display: 'none' }}
                      onChange={(e) => handleUploadFiles(e.target.files)}
                    />

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(true);
                      }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingFile(false);
                        handleUploadFiles(e.dataTransfer.files);
                      }}
                      onClick={() => !isPhotoLoading && fileInputRef.current?.click()}
                      style={{
                        border: isDraggingFile ? '2px dashed var(--accent)' : '2px dashed var(--border-light)',
                        background: isDraggingFile ? 'var(--accent-subtle)' : 'var(--bg-card)',
                        borderRadius: 'var(--radius-md)',
                        padding: '24px 20px',
                        textAlign: 'center',
                        cursor: isPhotoLoading ? 'wait' : 'pointer',
                        transition: 'all 0.18s ease',
                      }}
                    >
                      {isPhotoLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--accent)' }}>
                          <Loader2 size={28} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Uploading and saving photo...</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Updating your store and WhatsApp catalog</div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              width: '44px',
                              height: '44px',
                              borderRadius: '50%',
                              background: 'var(--accent-subtle)',
                              color: 'var(--accent)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <UploadCloud size={22} />
                          </div>
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                              Click to browse photos
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}> or drag and drop files here</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Supports JPG, PNG, WebP, GIF up to 10MB each. Multiple files supported.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Add by URL */}
                {activePhotoTab === 'url' && (
                  <div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="url"
                          placeholder="https://images.unsplash.com/... or paste direct image URL"
                          value={newPhotoUrl}
                          onChange={(e) => setNewPhotoUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddPhotoUrl();
                            }
                          }}
                          className="form-input"
                          style={{ fontSize: '0.8125rem' }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={isPhotoLoading || !newPhotoUrl.trim()}
                        onClick={handleAddPhotoUrl}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {isPhotoLoading ? 'Adding...' : 'Add Photo URL'}
                      </button>
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Tip: You can paste high-res product photos from CDN, Unsplash, Google Cloud, or your web hosting.
                    </div>
                  </div>
                )}
              </div>

              {/* Gallery Section */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      Showcase Gallery ({photoProduct.imageUrls?.length || 0})
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    ★ Cover photo is shown in WhatsApp and online store
                  </span>
                </div>

                {(!photoProduct.imageUrls || photoProduct.imageUrls.length === 0) ? (
                  <div
                    style={{
                      padding: '40px 20px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px dashed var(--border)',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <ImageIcon size={32} style={{ margin: '0 auto 8px', opacity: 0.35 }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      No photos added for this item yet
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '380px', margin: '4px auto 0' }}>
                      Upload images from your device or paste web URLs above so your WhatsApp sales assistant and customers can see this saree.
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                      gap: '14px',
                    }}
                  >
                    {photoProduct.imageUrls.map((url, idx) => {
                      const isCover = idx === 0 || (photoProduct.thumbnailUrl ? photoProduct.thumbnailUrl === url : idx === 0);

                      return (
                        <div
                          key={`${url}-${idx}`}
                          style={{
                            background: 'var(--bg-card)',
                            borderRadius: 'var(--radius-md)',
                            border: isCover ? '2px solid #10B981' : '1px solid var(--border-light)',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: isCover ? '0 0 12px rgba(16, 185, 129, 0.2)' : 'var(--shadow-sm)',
                            position: 'relative',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {/* Image Box */}
                          <div
                            style={{
                              position: 'relative',
                              width: '100%',
                              paddingTop: '80%', // 5:4 aspect ratio
                              background: '#04060A',
                              cursor: 'pointer',
                              overflow: 'hidden',
                            }}
                            onClick={() => setLightboxIndex(idx)}
                            title="Click to view full size"
                          >
                            <img
                              src={url}
                              alt={`${photoProduct.name} photo ${idx + 1}`}
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transition: 'transform 0.2s ease',
                              }}
                              onError={(e) => {
                                (e.target as any).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%23888" stroke-width="1"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                              }}
                            />

                            {/* Cover Badge */}
                            {isCover ? (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  left: '8px',
                                  background: 'rgba(16, 185, 129, 0.95)',
                                  color: '#fff',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: 'var(--radius-xs)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                                  letterSpacing: '0.02em',
                                }}
                              >
                                <Star size={11} fill="#fff" />
                                <span>PRIMARY COVER</span>
                              </div>
                            ) : (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '8px',
                                  left: '8px',
                                  background: 'rgba(0, 0, 0, 0.65)',
                                  color: '#fff',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  padding: '2px 6px',
                                  borderRadius: 'var(--radius-xs)',
                                }}
                              >
                                #{idx + 1}
                              </div>
                            )}

                            {/* Zoom hint on hover */}
                            <div
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: 'rgba(0, 0, 0, 0.65)',
                                color: '#fff',
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              title="Zoom Preview"
                            >
                              <Maximize2 size={13} />
                            </div>
                          </div>

                          {/* Action Toolbar */}
                          <div
                            style={{
                              padding: '10px',
                              background: 'var(--bg-tertiary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '6px',
                              borderTop: '1px solid var(--border)',
                            }}
                          >
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {!isCover ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '3px 8px', fontSize: '0.6875rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  disabled={isPhotoLoading}
                                  onClick={() => handleSetPrimary(url)}
                                  title="Make this photo the primary cover image"
                                >
                                  <Star size={11} />
                                  <span>Set Cover</span>
                                </button>
                              ) : (
                                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#10B981', display: 'flex', alignItems: 'center', gap: '3px', paddingLeft: '4px' }}>
                                  <Check size={12} /> Cover
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              {/* Reorder Left */}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '3px 5px' }}
                                disabled={isPhotoLoading || idx === 0}
                                onClick={() => handleMovePhoto(idx, idx - 1)}
                                title="Move photo left"
                              >
                                <ArrowLeft size={13} />
                              </button>

                              {/* Reorder Right */}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '3px 5px' }}
                                disabled={isPhotoLoading || idx === photoProduct.imageUrls.length - 1}
                                onClick={() => handleMovePhoto(idx, idx + 1)}
                                title="Move photo right"
                              >
                                <ArrowRight size={13} />
                              </button>

                              {/* Copy Link */}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '3px 5px' }}
                                onClick={() => handleCopyUrl(url)}
                                title="Copy photo link"
                              >
                                {copiedUrl === url ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                              </button>

                              {/* Delete Photo */}
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                style={{ padding: '3px 6px' }}
                                disabled={isPhotoLoading}
                                onClick={() => handleRemovePhoto(url)}
                                title="Remove photo"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Changes are automatically saved and synced with store and WhatsApp.
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPhotoProduct(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Lightbox Fullscreen Preview ────────────────────────────── */}
      {lightboxIndex !== null && photoProduct && photoProduct.imageUrls && photoProduct.imageUrls[lightboxIndex] && (
        <div
          className="modal-backdrop"
          style={{ background: 'rgba(0, 0, 0, 0.92)', zIndex: 1200 }}
          onClick={() => setLightboxIndex(null)}
        >
          <div
            style={{
              position: 'relative',
              maxWidth: '920px',
              width: '90%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Toolbar */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                marginBottom: '10px',
                background: 'rgba(15, 18, 28, 0.85)',
                backdropFilter: 'blur(10px)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.875rem' }}>
                  Photo {lightboxIndex + 1} of {photoProduct.imageUrls.length}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  ({photoProduct.name})
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleCopyUrl(photoProduct.imageUrls[lightboxIndex]!)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  {copiedUrl === photoProduct.imageUrls[lightboxIndex] ? (
                    <>
                      <Check size={13} color="#10B981" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
                <a
                  href={photoProduct.imageUrls[lightboxIndex]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <ExternalLink size={13} />
                  <span>Open Full Tab</span>
                </a>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '6px' }}
                  onClick={() => setLightboxIndex(null)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Image Box */}
            <div
              style={{
                position: 'relative',
                maxHeight: '75vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                boxShadow: '0 16px 40px rgba(0, 0, 0, 0.8)',
              }}
            >
              <img
                src={photoProduct.imageUrls[lightboxIndex]}
                alt="Full size preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: '75vh',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-md)',
                }}
              />

              {/* Prev Button */}
              {lightboxIndex > 0 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(lightboxIndex - 1)}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.65)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '38px',
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="Previous Photo"
                >
                  <ArrowLeft size={18} />
                </button>
              )}

              {/* Next Button */}
              {lightboxIndex < photoProduct.imageUrls.length - 1 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(lightboxIndex + 1)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.65)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '38px',
                    height: '38px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  title="Next Photo"
                >
                  <ArrowRight size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
