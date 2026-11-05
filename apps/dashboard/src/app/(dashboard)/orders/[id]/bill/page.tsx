import { getSession } from '@/lib/auth';
import { getOrderForBill } from '@/lib/dal/orders';
import { notFound } from 'next/navigation';
import {
  generateBarcodeSvg,
  generateQrCodeSvg,
  generateAwbNumber,
  type CourierPartner,
} from '@/lib/shipping/logistics-service';
import { OrderBillClient } from './OrderBillClient';

interface BillPageProps {
  params: {
    id: string;
  };
  searchParams: {
    courier?: string;
    format?: string;
  };
}

export default async function OrderBillPage({ params, searchParams }: BillPageProps) {
  const session = await getSession();
  const order = await getOrderForBill(session.tenantId, params.id);

  if (!order) {
    notFound();
  }

  // Cancelled or Refunded orders must never have active shipping labels or invoices
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg-canvas, #090B10)',
          fontFamily: 'var(--font-sans, system-ui)',
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--bg-card, #0F121C)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: '16px',
            padding: '36px 32px',
            textAlign: 'center',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.12)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
              marginBottom: '16px',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#F1F5F9', marginBottom: '8px' }}>
            Order {order.status} — Shipping Bill Voided
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '20px' }}>
            Order <strong>{order.orderNumber}</strong> was {order.status.toLowerCase()}. To protect against accidental consignment packaging or unauthorized courier dispatch, tax invoices and shipping bills are permanently locked.
          </p>
          <div
            style={{
              background: '#151926',
              borderRadius: '8px',
              padding: '14px',
              marginBottom: '24px',
              fontSize: '0.8125rem',
              color: '#94A3B8',
              textAlign: 'left',
              border: '1px solid #1E2333',
            }}
          >
            <div>Customer: <strong style={{ color: '#E2E8F0' }}>{order.customerName || 'Customer'}</strong> ({order.customerPhone})</div>
            <div style={{ marginTop: '4px' }}>Amount: <strong style={{ color: '#E2E8F0' }}>₹{Number(order.total).toLocaleString('en-IN')}</strong></div>
            {order.trackingNumber && (
              <div style={{ marginTop: '4px' }}>
                Assigned AWB: <span style={{ textDecoration: 'line-through', color: '#EF4444' }}>{order.trackingNumber}</span> (Voided)
              </div>
            )}
          </div>
          <a
            href="/orders"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#6366F1',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            ← Return to Orders & Fulfillment
          </a>
        </div>
      </div>
    );
  }

  // Unpaid orders cannot be dispatched
  if (order.status === 'PENDING_PAYMENT') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: 'var(--bg-canvas, #090B10)',
          fontFamily: 'var(--font-sans, system-ui)',
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            background: 'var(--bg-card, #0F121C)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '16px',
            padding: '36px 32px',
            textAlign: 'center',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.12)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F59E0B',
              marginBottom: '16px',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#F1F5F9', marginBottom: '8px' }}>
            Payment Pending — Bill Locked
          </h1>
          <p style={{ color: '#94A3B8', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '24px' }}>
            Order <strong>{order.orderNumber}</strong> has not been paid yet. Bills and shipping labels can only be created after payment is confirmed.
          </p>
          <a
            href="/orders"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              background: '#6366F1',
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.875rem',
              textDecoration: 'none',
            }}
          >
            ← Return to Orders & Fulfillment
          </a>
        </div>
      </div>
    );
  }

  const requestedCourier = (searchParams.courier?.toUpperCase() === 'DTDC'
    ? 'DTDC'
    : 'DELHIVERY') as CourierPartner;

  // Use existing AWB or generate realistic AWB for bill preview
  const courierPartner: CourierPartner =
    (order.courierPartner as CourierPartner) || requestedCourier;

  const awbCode =
    order.awbCode ||
    order.trackingNumber ||
    generateAwbNumber(courierPartner, `${order.orderNumber}-${order.customerPhone}`);

  const storefrontBase =
    process.env['NEXT_PUBLIC_STOREFRONT_URL'] ||
    process.env['STOREFRONT_URL'] ||
    'http://localhost:3005';

  const slug = order.tenant?.slug || 'aura';
  const trackingUrl =
    order.trackingUrl || `${storefrontBase}/${slug}/track?awb=${awbCode}`;

  // Generate crisp SVGs for printing
  const barcodeSvg = generateBarcodeSvg(awbCode, 48);
  const qrCodeSvg = await generateQrCodeSvg(trackingUrl, 120);

  const deliveryAddress = (order.deliveryAddress as any) || {};

  return (
    <OrderBillClient
      order={{
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        customerName: order.customerName || 'Customer',
        customerPhone: order.customerPhone,
        paymentMethod: order.paymentMethod || 'PREPAID',
        razorpayPaymentId: order.razorpayPaymentId,
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        tax: Number(order.tax),
        shippingCharge: Number(order.shippingCharge),
        total: Number(order.total),
        status: order.status,
        courierPartner,
        awbCode,
        trackingUrl,
        dispatchedAt: order.dispatchedAt?.toISOString() || new Date().toISOString(),
        deliveryAddress: {
          addressLine1: deliveryAddress.addressLine1 || deliveryAddress.line1 || 'Indiranagar 100ft Road',
          addressLine2: deliveryAddress.addressLine2 || deliveryAddress.line2 || '',
          city: deliveryAddress.city || 'Bengaluru',
          state: deliveryAddress.state || 'Karnataka',
          pincode: deliveryAddress.pincode || deliveryAddress.postalCode || '560038',
          landmark: deliveryAddress.landmark || '',
        },
        items: order.items.map((it) => ({
          id: it.id,
          productName: it.productName,
          productCode: it.productCode,
          quantity: it.quantity,
          price: Number(it.priceAtOrder),
          total: Number(it.totalAtOrder),
        })),
        tenant: {
          name: order.tenant.name,
          slug: order.tenant.slug || 'aura',
          ownerEmail: order.tenant.ownerEmail,
          ownerPhone: order.tenant.ownerPhone,
          whatsappPhoneNumber: order.tenant.whatsappPhoneNumber,
        },
        assignedStaff: order.assignedStaff
          ? {
              fullName: order.assignedStaff.fullName,
              role: order.assignedStaff.role,
            }
          : {
              fullName: session.staffName || 'Priya Nair',
              role: 'FULFILLMENT_LEAD',
            },
      }}
      barcodeSvg={barcodeSvg}
      qrCodeSvg={qrCodeSvg}
      initialFormat={searchParams.format === 'label' ? 'label' : 'invoice'}
    />
  );
}
