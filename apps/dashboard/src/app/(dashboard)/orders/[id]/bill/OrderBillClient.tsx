'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Printer,
  ArrowLeft,
  Truck,
  CheckCircle2,
  QrCode,
  Package,
  ShieldCheck,
  FileText,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { generateBillAndAwbAction } from '@/lib/actions/orders';

interface BillItem {
  id: string;
  productName: string;
  productCode: string;
  quantity: number;
  price: number;
  total: number;
}

interface OrderBillData {
  id: string;
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: string;
  razorpayPaymentId?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  shippingCharge: number;
  total: number;
  status: string;
  courierPartner: 'DELHIVERY' | 'DTDC';
  awbCode: string;
  trackingUrl: string;
  dispatchedAt: string;
  deliveryAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    landmark?: string;
  };
  items: BillItem[];
  tenant: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerPhone?: string | null;
    whatsappPhoneNumber?: string | null;
  };
  assignedStaff: {
    fullName: string;
    role: string;
  };
}

interface OrderBillClientProps {
  order: OrderBillData;
  barcodeSvg: string;
  qrCodeSvg: string;
  initialFormat?: 'invoice' | 'label';
}

export function OrderBillClient({
  order,
  barcodeSvg,
  qrCodeSvg,
  initialFormat = 'invoice',
}: OrderBillClientProps) {
  const router = useRouter();
  const [format, setFormat] = useState<'invoice' | 'label'>(initialFormat);
  const [selectedCourier, setSelectedCourier] = useState<'DELHIVERY' | 'DTDC'>(
    order.courierPartner || 'DELHIVERY'
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleCopyAwb = () => {
    navigator.clipboard.writeText(order.awbCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCourierChange = async (courier: 'DELHIVERY' | 'DTDC') => {
    if (courier === selectedCourier) return;
    setIsSwitching(true);
    setSelectedCourier(courier);
    await generateBillAndAwbAction(order.id, courier);
    router.refresh();
    setIsSwitching(false);
  };

  const isDelhivery = selectedCourier === 'DELHIVERY';
  const courierDisplayName = isDelhivery ? 'Delhivery Express Surface' : 'DTDC Express Priority';

  return (
    <div className="bill-screen-container">
      {/* ─── Top Floating Action Bar (Hidden on Print) ─────────────── */}
      <div className="bill-action-bar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/orders" className="btn btn-secondary btn-sm" style={{ gap: '6px' }}>
            <ArrowLeft size={14} />
            <span>Orders</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Format:</span>
            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setFormat('invoice')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: format === 'invoice' ? 'var(--accent)' : 'transparent',
                  color: format === 'invoice' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                A4 Tax Invoice
              </button>
              <button
                type="button"
                onClick={() => setFormat('label')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: format === 'label' ? 'var(--accent)' : 'transparent',
                  color: format === 'label' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                4x6 Shipping Label
              </button>
            </div>
          </div>

          {/* Courier Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Courier Sandbox:</span>
            <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => handleCourierChange('DELHIVERY')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: selectedCourier === 'DELHIVERY' ? '#0F766E' : 'transparent',
                  color: selectedCourier === 'DELHIVERY' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Delhivery
              </button>
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => handleCourierChange('DTDC')}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: selectedCourier === 'DTDC' ? '#B45309' : 'transparent',
                  color: selectedCourier === 'DTDC' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                DTDC
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            onClick={handleCopyAwb}
            className="btn btn-secondary btn-sm"
            style={{ gap: '6px' }}
          >
            <Copy size={13} />
            <span>{copied ? 'Copied AWB!' : `AWB: ${order.awbCode}`}</span>
          </button>

          <a
            href={order.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ gap: '6px' }}
          >
            <ExternalLink size={13} />
            <span>Live Customer Tracking</span>
          </a>

          <button
            type="button"
            onClick={handlePrint}
            className="btn btn-primary btn-sm"
            style={{ gap: '6px', padding: '6px 16px' }}
          >
            <Printer size={15} />
            <span>Print Document</span>
          </button>
        </div>
      </div>

      {/* ─── Printable Document Canvas ─────────────────────────────── */}
      <div className="printable-canvas-wrapper">
        {format === 'invoice' ? (
          /* ═══════════════════════════════════════════════════════════
             FORMAT A: Full A4 Luxury Boutique Tax Invoice & Consignment Bill
             ═══════════════════════════════════════════════════════════ */
          <div className="printable-page a4-invoice">
            {/* Header: Store Identity & Document Type */}
            <div className="invoice-header">
              <div>
                <h1 className="brand-title">{order.tenant.name}</h1>
                <p className="brand-subtitle">Haute Couture & Handcrafted Luxury Apparel</p>
                <div className="brand-meta">
                  <p>100ft Road, Indiranagar, Bengaluru, KA 560038</p>
                  <p>GSTIN: 29AAACH7409R1ZX | CIN: U74999KA2024PTC188201</p>
                  <p>Support: {order.tenant.ownerEmail} | WhatsApp: {order.tenant.whatsappPhoneNumber || '+91 90634 37772'}</p>
                </div>
              </div>

              <div className="invoice-badge-box">
                <div className="invoice-type-pill">TAX INVOICE & SHIPPING BILL</div>
                <div className="invoice-number-highlight">INV-2026-{order.orderNumber.replace(/[^A-Za-z0-9]/g, '')}</div>
                <div className="invoice-date-text">
                  Date: {new Date(order.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>

            <div className="divider-line" />

            {/* Delivery Partner & AWB Highlight Box */}
            <div className="courier-highlight-card">
              <div className="courier-badge-section">
                <div className="courier-carrier-tag">
                  <Truck size={16} />
                  <span>{courierDisplayName}</span>
                  <span className="sandbox-chip">Logistics Sandbox Active</span>
                </div>
                <div className="awb-label-row">
                  <span className="awb-label">Airway Bill (AWB) / Tracking ID:</span>
                  <span className="awb-number-strong">{order.awbCode}</span>
                </div>
                <div className="barcode-render" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
                <div className="barcode-caption">Scannable Handheld Courier Pickup Barcode (Code 128)</div>
              </div>

              <div className="qr-scan-section">
                <div className="qr-render" dangerouslySetInnerHTML={{ __html: qrCodeSvg }} />
                <div className="qr-caption">
                  <QrCode size={12} />
                  <span>Scan to Track Online</span>
                </div>
              </div>
            </div>

            {/* Address & Order Metadata Grid */}
            <div className="parties-grid">
              <div className="party-box">
                <div className="party-title">SHIP TO (CUSTOMER)</div>
                <div className="party-name">{order.customerName}</div>
                <div className="party-address">
                  {order.deliveryAddress.addressLine1}
                  {order.deliveryAddress.addressLine2 && `, ${order.deliveryAddress.addressLine2}`}
                </div>
                <div className="party-city">
                  {order.deliveryAddress.city}, {order.deliveryAddress.state} - {order.deliveryAddress.pincode}
                </div>
                {order.deliveryAddress.landmark && (
                  <div className="party-landmark">Landmark: {order.deliveryAddress.landmark}</div>
                )}
                <div className="party-phone">Phone: {order.customerPhone}</div>
              </div>

              <div className="party-box">
                <div className="party-title">DISPATCH & PAYMENT PARTICULARS</div>
                <div className="meta-row">
                  <span className="meta-key">Order Reference:</span>
                  <span className="meta-val">{order.orderNumber}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-key">Payment Status:</span>
                  <span className="meta-val meta-success">
                    {order.paymentMethod === 'COD' ? 'CASH ON DELIVERY (COLLECT)' : 'PAID IN FULL (PREPAID ONLINE)'}
                  </span>
                </div>
                {order.razorpayPaymentId && (
                  <div className="meta-row">
                    <span className="meta-key">Transaction Ref:</span>
                    <span className="meta-val">{order.razorpayPaymentId}</span>
                  </div>
                )}
                <div className="meta-row">
                  <span className="meta-key">Dispatched On:</span>
                  <span className="meta-val">
                    {new Date(order.dispatchedAt).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="meta-row">
                  <span className="meta-key">Packed & Audited By:</span>
                  <span className="meta-val">{order.assignedStaff.fullName} ({order.assignedStaff.role.replace(/_/g, ' ')})</span>
                </div>
              </div>
            </div>

            {/* Itemized Table */}
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Item Description</th>
                  <th style={{ width: '120px' }}>SKU Code</th>
                  <th style={{ width: '60px', textAlign: 'center' }}>Qty</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Unit Price</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Total (INR)</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <div className="item-name">{item.productName}</div>
                      <div className="item-sub">HSN: 6204 • Handcrafted 100% Authentic Silk</div>
                    </td>
                    <td>
                      <code className="sku-tag">{item.productCode}</code>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right' }}>₹{item.price.toLocaleString('en-IN')}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      ₹{item.total.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Calculations & Totals */}
            <div className="totals-section">
              <div className="terms-col">
                <div className="declaration-title">Declaration & Return Policy:</div>
                <p className="declaration-text">
                  1. We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.<br />
                  2. 7-Day luxury boutique exchange window for unworn items with tags intact.<br />
                  3. Scan the QR code or visit <span style={{ textDecoration: 'underline' }}>{order.trackingUrl}</span> for real-time live delivery updates.
                </p>
                <div className="signature-box">
                  <div className="signature-line" />
                  <div className="signature-label">Authorized Packing & Dispatch Officer Signature</div>
                  <div className="signature-sub">{order.assignedStaff.fullName} • Aura Luxe Fulfillment Center</div>
                </div>
              </div>

              <div className="amounts-col">
                <div className="amount-line">
                  <span>Subtotal</span>
                  <span>₹{order.subtotal.toLocaleString('en-IN')}</span>
                </div>
                {order.discount > 0 && (
                  <div className="amount-line discount-text">
                    <span>Loyalty / Special Discount</span>
                    <span>-₹{order.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="amount-line">
                  <span>Integrated GST (5%)</span>
                  <span>{order.tax > 0 ? `₹${order.tax.toLocaleString('en-IN')}` : 'Included in price'}</span>
                </div>
                <div className="amount-line">
                  <span>Shipping & Handling</span>
                  <span>{order.shippingCharge === 0 ? 'FREE (VIP Tier)' : `₹${order.shippingCharge.toLocaleString('en-IN')}`}</span>
                </div>
                <div className="grand-total-line">
                  <span>Grand Total</span>
                  <span className="total-val">₹{order.total.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="invoice-footer">
              <span>This is a computer-generated tax invoice & shipping manifest. No physical signature required.</span>
              <span>Aura Luxe Boutique Commerce OS • Powered by AI Sales Agent</span>
            </div>
          </div>
        ) : (
          /* ═══════════════════════════════════════════════════════════
             FORMAT B: 4x6 Thermal Shipping Box Label
             ═══════════════════════════════════════════════════════════ */
          <div className="printable-page thermal-label">
            {/* Top Carrier Header */}
            <div className="label-carrier-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Truck size={20} />
                <span className="carrier-name">{isDelhivery ? 'DELHIVERY EXPRESS' : 'DTDC PRIORITY AIR'}</span>
              </div>
              <span className="carrier-badge">SURFACE ROUTE</span>
            </div>

            {/* Huge Barcode & AWB */}
            <div className="label-awb-box">
              <div className="label-awb-text">{order.awbCode}</div>
              <div className="label-barcode" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
              <div className="label-routing">ROUTING: BLR / IND / 560038 • ORDER: {order.orderNumber}</div>
            </div>

            {/* To & QR Box */}
            <div className="label-destination-grid">
              <div className="label-to-address">
                <div className="to-heading">SHIP TO:</div>
                <div className="to-name">{order.customerName}</div>
                <div className="to-lines">
                  {order.deliveryAddress.addressLine1}
                  {order.deliveryAddress.addressLine2 && `, ${order.deliveryAddress.addressLine2}`}
                </div>
                <div className="to-city">
                  {order.deliveryAddress.city}, {order.deliveryAddress.state}
                </div>
                <div className="to-pin">PIN: {order.deliveryAddress.pincode}</div>
                <div className="to-phone">📞 TEL: {order.customerPhone}</div>
              </div>

              <div className="label-qr-box">
                <div dangerouslySetInnerHTML={{ __html: qrCodeSvg }} />
                <div className="qr-mini-sub">SCAN TO TRACK</div>
              </div>
            </div>

            {/* Return Address & Details */}
            <div className="label-shipper-row">
              <div className="shipper-text">
                <strong>RETURN IF UNDELIVERED TO:</strong><br />
                {order.tenant.name}, 100ft Road, Indiranagar, Bengaluru, KA 560038 • Ph: {order.tenant.ownerPhone || '9063437772'}
              </div>
              <div className="cod-status-box">
                <div className="payment-type-label">PAYMENT</div>
                <div className="payment-type-val">{order.paymentMethod === 'COD' ? `COLLECT ₹${order.total}` : 'PREPAID'}</div>
              </div>
            </div>

            {/* Package Contents Checklist */}
            <div className="label-items-summary">
              <span style={{ fontWeight: 700 }}>CONTENTS ({order.items.length} items): </span>
              {order.items.map((it) => `${it.productName} (x${it.quantity})`).join(', ')}
            </div>

            {/* Bottom Security Strip */}
            <div className="label-footer-strip">
              <span>SECURITY SEALED BY: {order.assignedStaff.fullName}</span>
              <span>VERIFIED LUXURY PACKAGING</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Embedded Print Styles ─────────────────────────────────── */}
      <style jsx global>{`
        .bill-screen-container {
          min-height: 100vh;
          background: #090b10;
          padding: 20px 24px 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .bill-action-bar {
          width: 100%;
          max-width: 900px;
          background: #0f121c;
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 12px 18px;
          margin-bottom: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          box-shadow: var(--shadow-md);
        }

        .printable-canvas-wrapper {
          width: 100%;
          display: flex;
          justify-content: center;
        }

        /* ─── A4 Invoice Styles ────────────────────────────────────── */
        .a4-invoice {
          width: 100%;
          max-width: 820px;
          background: #ffffff;
          color: #0f172a;
          border-radius: 8px;
          padding: 36px 40px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          box-sizing: border-box;
        }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
        }

        .brand-title {
          font-size: 1.6rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #090b10;
          text-transform: uppercase;
        }

        .brand-subtitle {
          font-size: 0.8125rem;
          font-weight: 500;
          color: #64748b;
          margin-top: 2px;
        }

        .brand-meta {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 8px;
          line-height: 1.45;
        }

        .invoice-badge-box {
          text-align: right;
        }

        .invoice-type-pill {
          display: inline-block;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 3px 8px;
          background: #0f172a;
          color: #f8fafc;
          border-radius: 4px;
        }

        .invoice-number-highlight {
          font-size: 1.15rem;
          font-weight: 700;
          color: #090b10;
          margin-top: 6px;
          font-family: monospace;
        }

        .invoice-date-text {
          font-size: 0.75rem;
          color: #64748b;
          margin-top: 2px;
        }

        .divider-line {
          height: 1.5px;
          background: #e2e8f0;
          margin: 18px 0;
        }

        /* Courier Highlight Card */
        .courier-highlight-card {
          border: 1.5px solid #cbd5e1;
          border-radius: 8px;
          padding: 14px 18px;
          display: grid;
          grid-template-columns: 1fr 140px;
          gap: 16px;
          background: #f8fafc;
          margin-bottom: 20px;
        }

        .courier-carrier-tag {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 700;
          font-size: 0.9375rem;
          color: #0f172a;
        }

        .sandbox-chip {
          font-size: 0.625rem;
          font-weight: 600;
          background: #dbeafe;
          color: #1e40af;
          padding: 2px 6px;
          border-radius: 9999px;
          text-transform: uppercase;
        }

        .awb-label-row {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8125rem;
        }

        .awb-label {
          color: #475569;
        }

        .awb-number-strong {
          font-family: monospace;
          font-size: 1.05rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #090b10;
        }

        .barcode-render {
          margin-top: 8px;
          max-width: 380px;
        }

        .barcode-caption {
          font-size: 0.6875rem;
          color: #64748b;
          margin-top: 4px;
        }

        .qr-scan-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-left: 1px dashed #cbd5e1;
          padding-left: 16px;
        }

        .qr-render {
          width: 100px;
          height: 100px;
        }

        .qr-caption {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.6875rem;
          color: #475569;
          font-weight: 600;
          margin-top: 4px;
        }

        /* Parties Grid */
        .parties-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 22px;
        }

        .party-box {
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px 14px;
          font-size: 0.8125rem;
        }

        .party-title {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #64748b;
          margin-bottom: 6px;
        }

        .party-name {
          font-weight: 700;
          font-size: 0.9375rem;
          color: #0f172a;
        }

        .party-address, .party-city, .party-landmark, .party-phone {
          color: #334155;
          margin-top: 2px;
          line-height: 1.4;
        }

        .party-phone {
          font-weight: 600;
          margin-top: 4px;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.78125rem;
          margin-bottom: 4px;
        }

        .meta-key {
          color: #64748b;
        }

        .meta-val {
          font-weight: 600;
          color: #0f172a;
        }

        .meta-success {
          color: #15803d;
        }

        /* Table */
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 0.8125rem;
        }

        .items-table th {
          background: #0f172a;
          color: #f8fafc;
          padding: 8px 10px;
          font-size: 0.75rem;
          text-align: left;
          letter-spacing: 0.04em;
        }

        .items-table td {
          padding: 10px 10px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
        }

        .item-name {
          font-weight: 600;
          color: #0f172a;
        }

        .item-sub {
          font-size: 0.6875rem;
          color: #64748b;
          margin-top: 2px;
        }

        .sku-tag {
          font-size: 0.75rem;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          color: #475569;
        }

        /* Totals & Signature */
        .totals-section {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 24px;
          margin-top: 14px;
        }

        .declaration-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
        }

        .declaration-text {
          font-size: 0.6875rem;
          color: #64748b;
          margin-top: 4px;
          line-height: 1.45;
        }

        .signature-box {
          margin-top: 28px;
        }

        .signature-line {
          width: 220px;
          height: 1px;
          background: #94a3b8;
          margin-bottom: 4px;
        }

        .signature-label {
          font-size: 0.6875rem;
          font-weight: 700;
          color: #334155;
        }

        .signature-sub {
          font-size: 0.625rem;
          color: #64748b;
        }

        .amount-line {
          display: flex;
          justify-content: space-between;
          font-size: 0.8125rem;
          margin-bottom: 6px;
          color: #475569;
        }

        .discount-text {
          color: #16a34a;
        }

        .grand-total-line {
          display: flex;
          justify-content: space-between;
          padding-top: 10px;
          border-top: 2px solid #0f172a;
          margin-top: 8px;
          font-size: 1rem;
          font-weight: 800;
          color: #0f172a;
        }

        .total-val {
          color: #4338ca;
        }

        .invoice-footer {
          margin-top: 36px;
          padding-top: 12px;
          border-top: 1px dashed #cbd5e1;
          display: flex;
          justify-content: space-between;
          font-size: 0.6875rem;
          color: #94a3b8;
        }

        /* ─── 4x6 Thermal Label Styles ─────────────────────────────── */
        .thermal-label {
          width: 400px;
          background: #ffffff;
          color: #000000;
          border: 2px solid #000000;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace;
          box-sizing: border-box;
          border-radius: 4px;
        }

        .label-carrier-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
        }

        .carrier-name {
          font-weight: 900;
          font-size: 1.1rem;
          letter-spacing: -0.02em;
        }

        .carrier-badge {
          font-size: 0.625rem;
          font-weight: 800;
          border: 1px solid #000;
          padding: 2px 6px;
        }

        .label-awb-box {
          text-align: center;
          padding: 10px 0;
          border-bottom: 2px solid #000;
        }

        .label-awb-text {
          font-size: 1.15rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          font-family: monospace;
        }

        .label-barcode {
          margin: 6px auto;
          width: 90%;
        }

        .label-routing {
          font-size: 0.6875rem;
          font-weight: 700;
        }

        .label-destination-grid {
          display: grid;
          grid-template-columns: 1fr 100px;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 2px solid #000;
        }

        .to-heading {
          font-size: 0.6875rem;
          font-weight: 800;
        }

        .to-name {
          font-size: 1rem;
          font-weight: 900;
          margin-top: 2px;
        }

        .to-lines, .to-city {
          font-size: 0.75rem;
          line-height: 1.3;
        }

        .to-pin {
          font-size: 0.875rem;
          font-weight: 900;
          margin-top: 3px;
        }

        .to-phone {
          font-size: 0.75rem;
          font-weight: 800;
          margin-top: 3px;
        }

        .label-qr-box {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-left: 1px solid #000;
          padding-left: 8px;
        }

        .qr-mini-sub {
          font-size: 0.5625rem;
          font-weight: 800;
          margin-top: 2px;
        }

        .label-shipper-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #000;
          font-size: 0.6875rem;
        }

        .shipper-text {
          width: 68%;
          line-height: 1.3;
        }

        .cod-status-box {
          border: 1px solid #000;
          padding: 4px 6px;
          text-align: center;
          min-width: 80px;
        }

        .payment-type-label {
          font-size: 0.5625rem;
          font-weight: 700;
        }

        .payment-type-val {
          font-size: 0.8125rem;
          font-weight: 900;
        }

        .label-items-summary {
          font-size: 0.6875rem;
          padding: 6px 0;
          border-bottom: 1px solid #000;
          line-height: 1.35;
        }

        .label-footer-strip {
          display: flex;
          justify-content: space-between;
          font-size: 0.5625rem;
          font-weight: 800;
          padding-top: 6px;
        }

        /* ─── Media Print Overrides ────────────────────────────────── */
        @media print {
          body, html {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .no-print,
          .dashboard-header,
          .sidebar,
          aside,
          header {
            display: none !important;
          }

          .bill-screen-container {
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: auto !important;
          }

          .printable-canvas-wrapper {
            width: 100% !important;
          }

          .a4-invoice {
            max-width: 100% !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          .thermal-label {
            border: 2px solid #000 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}

