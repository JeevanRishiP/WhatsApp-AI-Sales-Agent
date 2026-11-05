'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  updateOrderStatusAction,
  updateTrackingAction,
  addInternalNoteAction,
  simulateRazorpayPaymentAction,
  generateBillAndAwbAction,
} from '../../../lib/actions/orders';
import {
  Search,
  Download,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  AlertCircle,
  X,
  CreditCard,
  Phone,
  MapPin,
  User,
  ExternalLink,
  FileText,
  ChevronRight,
  Shield,
  Zap,
  ShoppingBag,
  ArrowUpRight,
  Send,
  Printer,
  Ban,
} from 'lucide-react';

interface OrderItemData {
  id: string;
  productCode: string;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  priceAtOrder: number;
  totalAtOrder: number;
}

interface OrderRecord {
  id: string;
  orderNumber: string;
  customerPhone: string;
  customerName: string | null;
  deliveryAddress?: any;
  subtotal: number;
  discount: number;
  shippingCharge: number;
  tax: number;
  total: number;
  status: string;
  paymentMethod?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  courierPartner?: string | null;
  awbCode?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  cancelReason?: string | null;
  createdAt: any;
  items: OrderItemData[];
}

interface OrdersClientProps {
  orders: OrderRecord[];
  total: number;
  page: number;
  totalPages: number;
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_PAYMENT: ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED: ['PROCESSING', 'CANCELLED', 'REFUND_INITIATED'],
  PROCESSING: ['SHIPPED', 'CANCELLED', 'REFUND_INITIATED'],
  SHIPPED: ['DELIVERED', 'REFUND_INITIATED'],
  DELIVERED: ['REFUND_INITIATED'],
  CANCELLED: [],
  REFUND_INITIATED: ['REFUNDED'],
  REFUNDED: [],
};

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'DELIVERED':
    case 'PAYMENT_CONFIRMED':
      return 'badge badge-success';
    case 'SHIPPED':
      return 'badge badge-info';
    case 'PROCESSING':
    case 'PENDING_PAYMENT':
      return 'badge badge-warning';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'badge badge-danger';
    default:
      return 'badge badge-neutral';
  }
}

export function OrdersClient({ orders, total, page, totalPages }: OrdersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const apiBaseUrl = (
    process.env['NEXT_PUBLIC_APP_BASE_URL'] ||
    process.env['NEXT_PUBLIC_API_URL'] ||
    'http://localhost:3002'
  ).replace(/\/+$/, '');

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [statusModalOrder, setStatusModalOrder] = useState<OrderRecord | null>(null);
  const [trackingModalOrder, setTrackingModalOrder] = useState<OrderRecord | null>(null);
  const [noteModalOrder, setNoteModalOrder] = useState<OrderRecord | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [paymentSimMessage, setPaymentSimMessage] = useState<string | null>(null);
  const [selectedCourierPartner, setSelectedCourierPartner] = useState<'DELHIVERY' | 'DTDC'>('DELHIVERY');
  const [isGeneratingAwb, setIsGeneratingAwb] = useState(false);

  const handleGenerateBillAndAwb = async (orderId: string, courier: 'DELHIVERY' | 'DTDC') => {
    if (selectedOrder && (selectedOrder.status === 'CANCELLED' || selectedOrder.status === 'REFUNDED')) {
      setErrorMessage('Cannot generate shipping bill or AWB for a cancelled order.');
      return;
    }
    setIsGeneratingAwb(true);
    setErrorMessage(null);
    startTransition(async () => {
      const res = await generateBillAndAwbAction(orderId, courier);
      setIsGeneratingAwb(false);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setSuccessMessage(`✓ AWB ${res.awbCode} generated with ${courier}. Order updated to SHIPPED.`);
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder({
            ...selectedOrder,
            status: 'SHIPPED',
            trackingNumber: res.awbCode,
            trackingUrl: res.trackingUrl,
            courierPartner: courier,
            awbCode: res.awbCode,
          });
        }
        window.open(`/orders/${orderId}/bill`, '_blank');
        router.refresh();
      }
    });
  };

  const handleSimulatePayment = (orderId: string) => {
    setIsSimulatingPayment(true);
    setPaymentSimMessage(null);
    startTransition(async () => {
      const res = await simulateRazorpayPaymentAction(orderId);
      setIsSimulatingPayment(false);
      if (res.error) {
        setErrorMessage(res.error);
      } else {
        setPaymentSimMessage('✓ Payment confirmed! Order transitioned to PAYMENT_CONFIRMED & stock decremented.');
        if (selectedOrder && selectedOrder.id === orderId) {
          setSelectedOrder({
            ...selectedOrder,
            status: 'PAYMENT_CONFIRMED',
            paymentMethod: 'RAZORPAY_ONLINE',
            razorpayPaymentId: `pay_test_${Date.now().toString(36)}`,
          });
        }
        router.refresh();
      }
    });
  };

  const currentStatus = searchParams.get('status') || '';
  const currentSearch = searchParams.get('search') || '';

  const handleFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`/orders?${params.toString()}`);
  };

  const handleExportOrdersCSV = () => {
    const headers = ['OrderNumber', 'CustomerName', 'Phone', 'Total', 'Status', 'PaymentMethod', 'TrackingNumber', 'Date'];
    const rows = orders.map((o) => [
      `"${o.orderNumber}"`,
      `"${(o.customerName || 'Anonymous').replace(/"/g, '""')}"`,
      `"${o.customerPhone}"`,
      o.total,
      o.status,
      `"${o.paymentMethod || 'PREPAID'}"`,
      `"${o.trackingNumber || ''}"`,
      `"${new Date(o.createdAt).toISOString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `orders_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const statusTabs = [
    { label: 'All Orders', value: '' },
    { label: 'Pending Payment', value: 'PENDING_PAYMENT' },
    { label: 'Confirmed', value: 'PAYMENT_CONFIRMED' },
    { label: 'Processing', value: 'PROCESSING' },
    { label: 'Shipped', value: 'SHIPPED' },
    { label: 'Delivered', value: 'DELIVERED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  return (
    <div>
      {/* Pipeline Status Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          marginBottom: '20px',
          paddingBottom: '4px',
        }}
      >
        {statusTabs.map((tab) => {
          const isActive = currentStatus === tab.value;
          return (
            <button
              key={tab.label}
              type="button"
              className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '6px 14px',
                fontSize: '0.8125rem',
                whiteSpace: 'nowrap',
              }}
              onClick={() => handleFilter('status', tab.value)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search Bar & Export Action */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search-input-wrapper" style={{ flex: '1 1 320px', maxWidth: 'none' }}>
            <span className="search-icon">
              <Search size={15} />
            </span>
            <input
              type="text"
              placeholder="Search by order number (e.g. ORD-2026-...) or customer phone..."
              className="search-input"
              defaultValue={currentSearch}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleFilter('search', (e.target as HTMLInputElement).value);
                }
              }}
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportOrdersCSV}
            style={{ whiteSpace: 'nowrap' }}
            title="Download visible orders as CSV"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Notification Alerts */}
      {errorMessage && (
        <div className="alert alert-error">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Orders Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                    <ShoppingBag size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>No orders found matching this filter</p>
                    <p style={{ fontSize: '0.75rem', marginTop: '2px' }}>Try selecting a different status tab or clearing search.</p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const allowed = VALID_TRANSITIONS[order.status] || [];
                  const initial = (order.customerName || 'Customer').charAt(0).toUpperCase();

                  return (
                    <tr key={order.id}>
                      <td>
                        <code
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          {order.orderNumber}
                        </code>
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
                          <span style={{ fontWeight: 500 }}>{order.customerName || 'Anonymous'}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                        {order.customerPhone}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {order.items.length} item{order.items.length === 1 ? '' : 's'}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        ₹{order.total.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            order.status === 'PAYMENT_CONFIRMED' || order.status === 'DELIVERED'
                              ? 'badge-success'
                              : order.status === 'CANCELLED' || order.status === 'REFUNDED'
                              ? 'badge-danger'
                              : 'badge-warning'
                          }`}
                        >
                          {order.paymentMethod || 'PREPAID'}
                        </span>
                      </td>
                      <td>
                        <span className={getStatusBadgeClass(order.status)}>
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedOrder(order)}
                          >
                            Details
                          </button>
                          {['PAYMENT_CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status) && (
                            <Link
                              href={`/orders/${order.id}/bill`}
                              target="_blank"
                              className="btn btn-secondary btn-sm"
                              title="Print Shipping Bill & Invoice"
                              style={{ gap: '4px', padding: '6px 9px' }}
                            >
                              <Printer size={13} />
                              <span>Bill</span>
                            </Link>
                          )}
                          {allowed.length > 0 && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setStatusModalOrder(order)}
                            >
                              Status ▾
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
              Page {page} of {totalPages} ({total} total orders)
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

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="modal-content" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Order {selectedOrder.orderNumber}</span>
                  <span className={getStatusBadgeClass(selectedOrder.status)} style={{ fontSize: '0.6875rem' }}>
                    {selectedOrder.status}
                  </span>
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                  Placed on {new Date(selectedOrder.createdAt).toLocaleString('en-IN')}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setSelectedOrder(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Customer & Delivery Summary Card */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  background: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '18px',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Customer Details
                  </div>
                  <div style={{ fontWeight: 600, marginTop: '6px', fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
                    {selectedOrder.customerName || 'Anonymous Customer'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Phone size={13} style={{ color: 'var(--whatsapp)' }} />
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedOrder.customerPhone}</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Payment Mode
                  </div>
                  <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={15} style={{ color: 'var(--accent)' }} />
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {selectedOrder.paymentMethod || 'PREPAID ONLINE'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Gateway Box */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '18px',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Zap size={14} style={{ color: '#818CF8' }} />
                    <span>Payment Gateway</span>
                    <span className="badge badge-info" style={{ fontSize: '0.625rem' }}>Sandbox Ready</span>
                  </div>
                  {selectedOrder.razorpayPaymentId && (
                    <span className="badge badge-success" style={{ fontSize: '0.6875rem' }}>
                      <CheckCircle2 size={11} />
                      <span>Paid</span>
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.8125rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Gateway Order ID:</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px', wordBreak: 'break-all', color: 'var(--text-primary)' }}>
                      {selectedOrder.razorpayOrderId || <span style={{ color: 'var(--text-muted)' }}>order_test_auto</span>}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Payment ID:</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px', wordBreak: 'break-all', color: 'var(--text-primary)' }}>
                      {selectedOrder.razorpayPaymentId || <span style={{ color: 'var(--text-muted)' }}>Pending payment</span>}
                    </div>
                  </div>
                </div>

                {selectedOrder.status === 'PENDING_PAYMENT' && (
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px dashed var(--border-light)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      WhatsApp checkout link generated for customer:
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={selectedOrder.trackingUrl || `${apiBaseUrl}/payments/checkout/${selectedOrder.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        <span>Open Sandbox Checkout</span>
                        <ArrowUpRight size={13} />
                      </a>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={isSimulatingPayment}
                        onClick={() => handleSimulatePayment(selectedOrder.id)}
                      >
                        <Zap size={13} />
                        <span>{isSimulatingPayment ? 'Simulating...' : 'Simulate Instant Payment'}</span>
                      </button>
                    </div>
                    {paymentSimMessage && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '4px' }}>
                        {paymentSimMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery Address */}
              {selectedOrder.deliveryAddress && (() => {
                const addr = typeof selectedOrder.deliveryAddress === 'string'
                  ? (() => {
                      try { return JSON.parse(selectedOrder.deliveryAddress); }
                      catch { return { address: selectedOrder.deliveryAddress }; }
                    })()
                  : selectedOrder.deliveryAddress;
                const line1 = addr.line1 || addr.addressLine1 || addr.street || addr.address;
                const line2 = addr.line2 || addr.addressLine2 || addr.area;
                const recipient = addr.recipientName || addr.name || selectedOrder.customerName;
                const phone = addr.phone || selectedOrder.customerPhone;

                return (
                  <div style={{ marginBottom: '18px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <MapPin size={13} />
                      <span>Delivery Address</span>
                    </div>
                    <div
                      style={{
                        background: 'var(--bg-tertiary)',
                        padding: '14px 16px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                        {recipient} {phone && <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>({phone})</span>}
                      </div>
                      {line1 && <div style={{ color: 'var(--text-primary)' }}>{line1}</div>}
                      {line2 && <div style={{ color: 'var(--text-secondary)' }}>{line2}</div>}
                      {addr.landmark && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                          Landmark: {addr.landmark}
                        </div>
                      )}
                      {(addr.city || addr.pincode) && (
                        <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                          {[addr.city, addr.state].filter(Boolean).join(', ')}{' '}
                          {addr.pincode && <strong>- {addr.pincode}</strong>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Logistics, Delivery Partner & Bill Printing */}
              {selectedOrder.status === 'CANCELLED' || selectedOrder.status === 'REFUNDED' ? (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '18px',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444', fontWeight: 600, fontSize: '0.875rem' }}>
                      <Ban size={15} />
                      <span>Order {selectedOrder.status} — Fulfillment & Logistics Locked</span>
                    </div>
                    <span className="badge badge-danger">LOCKED</span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                    This order was cancelled. Bill printing, delivery partner dispatch, and AWB generation are permanently disabled to prevent accidental consignment packing.
                  </p>
                  {selectedOrder.trackingNumber && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Previously assigned AWB:</span>
                      <code style={{ textDecoration: 'line-through', color: '#EF4444', fontFamily: 'var(--font-mono)' }}>
                        {selectedOrder.trackingNumber} ({selectedOrder.courierPartner || 'Courier'})
                      </code>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Voided)</span>
                    </div>
                  )}
                </div>
              ) : selectedOrder.status === 'PENDING_PAYMENT' ? (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '18px',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#F59E0B', fontWeight: 600, fontSize: '0.875rem' }}>
                      <Clock size={15} />
                      <span>Awaiting Customer Payment — Dispatch Locked</span>
                    </div>
                    <span className="badge badge-warning">UNPAID</span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                    Packaging and shipping label generation will unlock as soon as customer payment is verified.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: 'var(--bg-tertiary)',
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '18px',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Truck size={13} />
                        <span>Logistics & Delivery Partner</span>
                      </span>
                      <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {selectedOrder.trackingNumber ? (
                          <>
                            <span
                              className="badge"
                              style={{
                                background: selectedOrder.courierPartner === 'DTDC' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                color: selectedOrder.courierPartner === 'DTDC' ? '#F59E0B' : '#10B981',
                                border: `1px solid ${selectedOrder.courierPartner === 'DTDC' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                                fontWeight: 700,
                                fontSize: '0.75rem',
                              }}
                            >
                              {selectedOrder.courierPartner || 'DELHIVERY'}
                            </span>
                            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontSize: '0.875rem', fontWeight: 700 }}>
                              {selectedOrder.trackingNumber}
                            </code>
                          </>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Partner:</span>
                            <select
                              value={selectedCourierPartner}
                              onChange={(e) => setSelectedCourierPartner(e.target.value as any)}
                              className="form-input"
                              style={{ padding: '3px 8px', fontSize: '0.75rem', width: 'auto', height: '28px' }}
                            >
                              <option value="DELHIVERY">Delhivery Express</option>
                              <option value="DTDC">DTDC Priority Air</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Link
                        href={`/orders/${selectedOrder.id}/bill`}
                        target="_blank"
                        className="btn btn-secondary btn-sm"
                        style={{ gap: '6px' }}
                      >
                        <Printer size={13} />
                        <span>{selectedOrder.trackingNumber ? 'Print Bill & Label' : 'Preview Bill'}</span>
                      </Link>

                      {!selectedOrder.trackingNumber ? (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={isGeneratingAwb}
                          onClick={() => handleGenerateBillAndAwb(selectedOrder.id, selectedCourierPartner)}
                          style={{ gap: '6px' }}
                        >
                          <Truck size={13} />
                          <span>{isGeneratingAwb ? 'Connecting...' : 'Pack & Generate AWB'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setTrackingModalOrder(selectedOrder);
                            setSelectedOrder(null);
                          }}
                        >
                          <Truck size={13} />
                          <span>Edit AWB</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Items Breakdown */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>
                  Ordered Items ({selectedOrder.items.length})
                </div>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Code</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((it) => (
                        <tr key={it.id}>
                          <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{it.productName}</td>
                          <td>
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                              {it.productCode}
                            </code>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{it.quantity}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>₹{it.priceAtOrder.toLocaleString('en-IN')}</td>
                          <td style={{ fontWeight: 700, textAlign: 'right', color: 'var(--text-primary)' }}>
                            ₹{it.totalAtOrder.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals */}
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Subtotal</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>₹{selectedOrder.subtotal.toLocaleString('en-IN')}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                    <span>Discount</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>-₹{selectedOrder.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {selectedOrder.shippingCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>Shipping</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>₹{selectedOrder.shippingCharge.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    marginTop: '6px',
                    borderTop: '1px solid var(--border)',
                    paddingTop: '10px',
                  }}
                >
                  <span>Grand Total</span>
                  <span style={{ color: '#818CF8', fontFamily: 'var(--font-mono)' }}>
                    ₹{selectedOrder.total.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setNoteModalOrder(selectedOrder);
                  setSelectedOrder(null);
                }}
              >
                <FileText size={13} />
                <span>Internal Note</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Transition Modal */}
      {statusModalOrder && (
        <div className="modal-backdrop" onClick={() => setStatusModalOrder(null)}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Update Status: {statusModalOrder.orderNumber}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setStatusModalOrder(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setErrorMessage(null);
                startTransition(async () => {
                  const res = await updateOrderStatusAction(statusModalOrder.id, {}, formData);
                  if (res?.error) {
                    setErrorMessage(res.error);
                  } else {
                    setStatusModalOrder(null);
                    setSuccessMessage(`Order ${statusModalOrder.orderNumber} status updated`);
                    router.refresh();
                  }
                });
              }}
            >
              <div className="modal-body">
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Current status: <strong style={{ color: 'var(--text-primary)' }}>{statusModalOrder.status}</strong>
                </p>

                <div className="form-group">
                  <label className="form-label">Select Target Status *</label>
                  <select name="status" className="form-select" required defaultValue="">
                    <option value="" disabled>Choose transition...</option>
                    {(VALID_TRANSITIONS[statusModalOrder.status] || []).map((st) => (
                      <option key={st} value={st}>
                        {st.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Audit Justification *</span>
                    <span style={{ fontSize: '10px', color: '#F59E0B', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Shield size={11} /> Required
                    </span>
                  </label>
                  <textarea
                    name="reason"
                    required
                    rows={2}
                    placeholder="Enter explicit reason for this status change (recorded in tamper-evident audit ledger)..."
                    className="form-textarea"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setStatusModalOrder(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Updating...' : 'Confirm Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {trackingModalOrder && (
        <div className="modal-backdrop" onClick={() => setTrackingModalOrder(null)}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Shipment Tracking</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setTrackingModalOrder(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setErrorMessage(null);
                startTransition(async () => {
                  const res = await updateTrackingAction(trackingModalOrder.id, {}, formData);
                  if (res?.error) {
                    setErrorMessage(res.error);
                  } else {
                    setTrackingModalOrder(null);
                    setSuccessMessage('Tracking details saved and synced');
                    router.refresh();
                  }
                });
              }}
            >
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Courier Logistics Partner</label>
                  <select name="courier" className="form-select">
                    <option value="Bluedart Express">Bluedart Express (Air Priority)</option>
                    <option value="Delhivery">Delhivery Surface/Air</option>
                    <option value="DTDC Express">DTDC Express Gold</option>
                    <option value="Shiprocket">Shiprocket Automated</option>
                    <option value="India Post SpeedPost">India Post SpeedPost</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Tracking Number / AWB Code *</label>
                  <input
                    name="trackingNumber"
                    required
                    defaultValue={trackingModalOrder.trackingNumber || ''}
                    placeholder="e.g. BD-987654321-IN"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Live Tracking URL (Optional)</label>
                  <input
                    name="trackingUrl"
                    type="url"
                    defaultValue={trackingModalOrder.trackingUrl || ''}
                    placeholder="https://track.bluedart.com/..."
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Audit Reason *</label>
                  <input
                    name="reason"
                    required
                    defaultValue="Airway bill generated, package picked up by courier"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setTrackingModalOrder(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Saving...' : 'Save Tracking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Internal Note Modal */}
      {noteModalOrder && (
        <div className="modal-backdrop" onClick={() => setNoteModalOrder(null)}>
          <div className="modal-content" style={{ maxWidth: '460px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Internal Note: {noteModalOrder.orderNumber}</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '6px' }}
                onClick={() => setNoteModalOrder(null)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              action={async (formData) => {
                setErrorMessage(null);
                startTransition(async () => {
                  const res = await addInternalNoteAction(noteModalOrder.id, {}, formData);
                  if (res?.error) {
                    setErrorMessage(res.error);
                  } else {
                    setNoteModalOrder(null);
                    setSuccessMessage('Internal note added');
                    router.refresh();
                  }
                });
              }}
            >
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Note Content *</label>
                  <textarea
                    name="note"
                    required
                    rows={4}
                    placeholder="Add fulfillment instructions or remarks for your team..."
                    className="form-textarea"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setNoteModalOrder(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isPending}
                >
                  {isPending ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
