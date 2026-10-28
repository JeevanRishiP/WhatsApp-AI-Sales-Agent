'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  updateOrderStatusAction,
  updateTrackingAction,
  addInternalNoteAction,
  simulateRazorpayPaymentAction,
} from '../../../lib/actions/orders';

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
      return 'badge';
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
          gap: '8px',
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
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => handleFilter('status', tab.value)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Search Bar & Export Action */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search by order number (e.g. ORD-2026-...) or customer phone number..."
            className="form-input"
            defaultValue={currentSearch}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleFilter('search', (e.target as HTMLInputElement).value);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportOrdersCSV}
            style={{ whiteSpace: 'nowrap' }}
            title="Download visible orders as CSV"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Notification Alerts */}
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No orders found matching this filter.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const allowed = VALID_TRANSITIONS[order.status] || [];
                  return (
                    <tr key={order.id}>
                      <td>
                        <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {order.orderNumber}
                        </code>
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {order.customerName || 'Anonymous'}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                        {order.customerPhone}
                      </td>
                      <td>
                        {order.items.length} item{order.items.length === 1 ? '' : 's'}
                      </td>
                      <td style={{ fontWeight: 600 }}>
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
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedOrder(order)}
                          >
                            Details
                          </button>
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
              Page {page} of {totalPages} ({total} total orders)
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

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Order {selectedOrder.orderNumber}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Placed on {new Date(selectedOrder.createdAt).toLocaleString('en-IN')}
                </span>
              </div>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setSelectedOrder(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Customer & Delivery Info */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '16px',
                  background: 'var(--bg-tertiary)',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Customer Details
                  </div>
                  <div style={{ fontWeight: 600, marginTop: '4px' }}>
                    {selectedOrder.customerName || 'Anonymous Customer'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    📞 {selectedOrder.customerPhone}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Status & Payment
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', gap: '6px' }}>
                    <span className={getStatusBadgeClass(selectedOrder.status)}>
                      {selectedOrder.status}
                    </span>
                    <span className="badge badge-info">
                      {selectedOrder.paymentMethod || 'PREPAID'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Razorpay Sandbox Payment Details */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                  border: '1px solid rgba(2, 132, 199, 0.25)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>💳 Razorpay Gateway</span>
                    <span className="badge badge-success" style={{ fontSize: '0.6875rem' }}>Sandbox</span>
                  </div>
                  {selectedOrder.razorpayPaymentId && (
                    <span className="badge badge-success" style={{ fontSize: '0.6875rem' }}>
                      ✓ Paid via Sandbox
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8125rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Razorpay Order ID:</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px', wordBreak: 'break-all' }}>
                      {selectedOrder.razorpayOrderId || <span style={{ color: 'var(--text-muted)' }}>order_test_auto</span>}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Payment ID:</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, marginTop: '2px', wordBreak: 'break-all' }}>
                      {selectedOrder.razorpayPaymentId || <span style={{ color: 'var(--text-muted)' }}>Pending payment</span>}
                    </div>
                  </div>
                </div>

                {selectedOrder.status === 'PENDING_PAYMENT' && (
                  <div
                    style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px dashed var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Customer checkout link generated for WhatsApp:
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href={selectedOrder.trackingUrl || `${apiBaseUrl}/payments/checkout/${selectedOrder.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        Open Sandbox Checkout ↗
                      </a>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={isSimulatingPayment}
                        onClick={() => handleSimulatePayment(selectedOrder.id)}
                      >
                        {isSimulatingPayment ? 'Simulating...' : '⚡ Simulate Instant Payment'}
                      </button>
                    </div>
                    {paymentSimMessage && (
                      <div style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '4px' }}>
                        {paymentSimMessage}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Delivery Address */}
              {selectedOrder.deliveryAddress && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '4px' }}>
                    Delivery Address:
                  </div>
                  <div
                    style={{
                      background: 'var(--bg-tertiary)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {typeof selectedOrder.deliveryAddress === 'string'
                      ? selectedOrder.deliveryAddress
                      : JSON.stringify(selectedOrder.deliveryAddress, null, 2)}
                  </div>
                </div>
              )}

              {/* Tracking Info */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--bg-tertiary)',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Courier Tracking:
                  </span>
                  <div style={{ fontWeight: 500, marginTop: '2px' }}>
                    {selectedOrder.trackingNumber ? (
                      <code style={{ fontFamily: 'var(--font-mono)' }}>{selectedOrder.trackingNumber}</code>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>No tracking info provided yet</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setTrackingModalOrder(selectedOrder);
                    setSelectedOrder(null);
                  }}
                >
                  {selectedOrder.trackingNumber ? 'Edit Tracking' : '+ Add Tracking'}
                </button>
              </div>

              {/* Ordered Items Breakdown */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '8px' }}>
                  Order Items ({selectedOrder.items.length})
                </div>
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Code</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((it) => (
                        <tr key={it.id}>
                          <td style={{ fontWeight: 500 }}>{it.productName}</td>
                          <td>
                            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                              {it.productCode}
                            </code>
                          </td>
                          <td>{it.quantity}</td>
                          <td>₹{it.priceAtOrder.toLocaleString('en-IN')}</td>
                          <td style={{ fontWeight: 600 }}>
                            ₹{it.totalAtOrder.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order Financial Totals */}
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Subtotal</span>
                  <span>₹{selectedOrder.subtotal.toLocaleString('en-IN')}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success)' }}>
                    <span>Discount</span>
                    <span>-₹{selectedOrder.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {selectedOrder.shippingCharge > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>Shipping</span>
                    <span>₹{selectedOrder.shippingCharge.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    marginTop: '4px',
                    borderTop: '1px solid var(--border)',
                    paddingTop: '8px',
                  }}
                >
                  <span>Grand Total</span>
                  <span style={{ color: 'var(--accent)' }}>
                    ₹{selectedOrder.total.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Internal Notes */}
              {selectedOrder.notes && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Internal Merchant Notes:
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {selectedOrder.notes}
                  </p>
                </div>
              )}
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
                📝 Add Note
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
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Update Status: {statusModalOrder.orderNumber}</h2>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setStatusModalOrder(null)}
              >
                ✕
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
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  Current status: <strong>{statusModalOrder.status}</strong>
                </p>

                <div className="form-group">
                  <label className="form-label">Select New Allowed Status *</label>
                  <select name="status" className="form-select" required defaultValue="">
                    <option value="" disabled>Choose transition...</option>
                    {(VALID_TRANSITIONS[statusModalOrder.status] || []).map((st) => (
                      <option key={st} value={st}>
                        {st.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Status Change Note (Optional)</label>
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="e.g. Dispatched via BlueDart, courier pickup completed."
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
                  {isPending ? 'Updating...' : 'Confirm Transition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {trackingModalOrder && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Shipment Tracking Details</h2>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setTrackingModalOrder(null)}
              >
                ✕
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
                    setSuccessMessage('Tracking details updated and sent to customer');
                    router.refresh();
                  }
                });
              }}
            >
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Tracking Number / AWB *</label>
                  <input
                    name="trackingNumber"
                    required
                    defaultValue={trackingModalOrder.trackingNumber || ''}
                    placeholder="e.g. BD987654321IN"
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">Tracking URL (Optional)</label>
                  <input
                    name="trackingUrl"
                    type="url"
                    defaultValue={trackingModalOrder.trackingUrl || ''}
                    placeholder="https://track.bluedart.com/..."
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
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Add Note to {noteModalOrder.orderNumber}</h2>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                onClick={() => setNoteModalOrder(null)}
              >
                ✕
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
                  <label className="form-label">Merchant Note *</label>
                  <textarea
                    name="note"
                    required
                    rows={4}
                    placeholder="Internal remarks for your warehouse/fulfillment team..."
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
