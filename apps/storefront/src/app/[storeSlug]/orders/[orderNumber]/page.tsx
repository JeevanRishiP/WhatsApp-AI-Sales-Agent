'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCustomer } from '@/lib/customer-context';
import { DeliveryEditModal } from '@/components/storefront/delivery-edit-modal';
import { CancelOrderModal } from '@/components/storefront/cancel-order-modal';
import { API_BASE_URL } from '@/lib/config';
import {
  ArrowLeftIcon,
  MapPinIcon,
  ClockIcon,
  WhatsAppIcon,
  TruckIcon,
} from '@/components/icons';

export default function OrderDetailPage() {
  const params = useParams();
  const orderNumber = params['orderNumber'] as string;
  const storeSlug = params['storeSlug'] as string;

  const { isAuthenticated, openAuthModal } = useCustomer();
  const [order, setOrder] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const apiBase = API_BASE_URL;

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('wcos_customer_token') : null;
    const headers: Record<string, string> = {
      'x-tenant-slug': storeSlug,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch(`${apiBase}/api/v1/customer/orders/${orderNumber}`, {
      credentials: 'include',
      headers,
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to load order details');
        }
        return res.json();
      })
      .then((data) => setOrder(data.order))
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [orderNumber, isAuthenticated, apiBase, storeSlug]);

  if (!isAuthenticated) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <p className="font-serif text-2xl text-neutral-900 mb-2">Authentication Required</p>
        <p className="text-xs font-mono text-neutral-500 mb-6">
          Please verify your WhatsApp mobile number to review order #{orderNumber}.
        </p>
        <button onClick={openAuthModal} className="btn-luxury-primary py-3 px-6">
          Sign In via WhatsApp OTP
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-24 text-center font-mono text-xs text-neutral-400">
        Retrieving order #{orderNumber}...
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <p className="font-serif text-2xl text-red-800 mb-2">Order Not Found</p>
        <p className="text-xs font-mono text-neutral-500 mb-6">{error || 'Unable to locate order records.'}</p>
        <Link href={`/${storeSlug}/account`} className="btn-luxury-secondary py-2.5 px-6 no-underline">
          Return to My Orders
        </Link>
      </div>
    );
  }

  const deliveryAddress = order.deliveryAddress || {};
  const isEditable = order.isEditable;
  const isCancellable = order.isCancellable;

  const waConciergeUrl = order.tenant?.whatsappPhoneNumber
    ? `https://wa.me/${order.tenant.whatsappPhoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `Hello Concierge, I have an inquiry regarding my Order #${order.orderNumber}.`
      )}`
    : '#';

  // Compute status step index
  let currentStepIdx = 1;
  if (order.status === 'SHIPPED') currentStepIdx = 3;
  if (order.status === 'DELIVERED') currentStepIdx = 4;
  if (order.status === 'PROCESSING') currentStepIdx = 2;
  if (order.status === 'CANCELLED') currentStepIdx = -1;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Back Link */}
      <div>
        <Link
          href={`/${storeSlug}/account`}
          className="inline-flex items-center gap-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 transition-colors no-underline"
        >
          <ArrowLeftIcon size={14} />
          <span>Back to My Orders</span>
        </Link>
      </div>

      {/* Swiss Invoice Card Container */}
      <div className="swiss-receipt p-8 md:p-12 space-y-10">
        {/* Top Header */}
        <div className="hairline-b pb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <p className="micro-caps text-neutral-400 mb-1">Official Boutique Receipt</p>
            <h1 className="text-3xl font-serif text-neutral-900">Order #{order.orderNumber}</h1>
            <p className="text-xs font-mono text-neutral-500 mt-1">
              Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3 py-1 bg-stone-100 border border-neutral-300 text-xs font-mono uppercase tracking-wider rounded-xs text-neutral-800">
              Status: {order.status.replace(/_/g, ' ')}
            </span>

            {order.trackingNumber && (
              <Link
                href={`/${storeSlug}/track?awb=${encodeURIComponent(order.trackingNumber)}`}
                className="btn-luxury-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 no-underline"
              >
                <TruckIcon size={12} />
                <span>Track Courier ({order.trackingNumber})</span>
              </Link>
            )}
          </div>
        </div>

        {/* Status Timeline Bar */}
        {order.status !== 'CANCELLED' ? (
          <div className="py-4">
            <p className="micro-caps text-neutral-400 mb-4">Fulfillment Timeline</p>
            <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
              {[
                { label: 'Confirmed', desc: 'Order Placed' },
                { label: 'Crafting', desc: 'In Preparation' },
                { label: 'Dispatched', desc: 'With Courier' },
                { label: 'Delivered', desc: 'At Destination' },
              ].map((step, idx) => {
                const isCompleted = idx <= currentStepIdx;
                const isCurrent = idx === currentStepIdx;
                return (
                  <div key={idx} className="space-y-2">
                    <div
                      className={`h-1 w-full rounded-full transition-colors ${
                        isCompleted ? 'bg-amber-600' : 'bg-neutral-200'
                      }`}
                    />
                    <p className={`font-medium ${isCurrent ? 'text-amber-800 font-bold' : isCompleted ? 'text-neutral-800' : 'text-neutral-400'}`}>
                      {step.label}
                    </p>
                    <p className="text-[10px] text-neutral-400 hidden sm:block">{step.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-mono rounded-xs">
            This order has been cancelled. Reason: {order.cancelReason || 'Customer requested'}.
          </div>
        )}

        {/* Destination & Delivery Slot (Self-Service Editable!) */}
        <div className="hairline-t hairline-b py-8 grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-mono">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="micro-caps text-neutral-400 flex items-center gap-1.5">
                <MapPinIcon size={12} />
                <span>Delivery Destination</span>
              </span>
              {isEditable && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-amber-800 font-semibold underline underline-offset-4 hover:text-amber-900 transition-colors"
                >
                  Edit Address
                </button>
              )}
            </div>
            <p className="font-sans text-sm font-medium text-neutral-900">
              {deliveryAddress.recipientName || order.customerName}
            </p>
            <p className="text-neutral-600 mt-0.5">{deliveryAddress.phone || order.customerPhone}</p>
            <p className="text-neutral-600 mt-1">
              {deliveryAddress.line1}
              {deliveryAddress.line2 ? `, ${deliveryAddress.line2}` : ''}
            </p>
            <p className="text-neutral-600">
              {deliveryAddress.city}, {deliveryAddress.state} - {deliveryAddress.pincode}
            </p>
            {deliveryAddress.landmark && (
              <p className="text-neutral-400 text-[11px] mt-1">Landmark: {deliveryAddress.landmark}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="micro-caps text-neutral-400 flex items-center gap-1.5">
                <ClockIcon size={12} />
                <span>Schedule & Concierge Notes</span>
              </span>
              {isEditable && (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="text-amber-800 font-semibold underline underline-offset-4 hover:text-amber-900 transition-colors"
                >
                  Change Slot
                </button>
              )}
            </div>
            <p className="text-neutral-800">
              <span className="text-neutral-400">Preferred Slot: </span>
              {deliveryAddress.preferredDeliverySlot || 'Standard Delivery (10:00 - 18:00)'}
            </p>
            <p className="text-neutral-800 mt-2">
              <span className="text-neutral-400">Special Note: </span>
              {deliveryAddress.instructions ? `"${deliveryAddress.instructions}"` : 'None specified'}
            </p>
            <div className="mt-4 p-2.5 bg-stone-50 border border-neutral-200/80 rounded-xs text-[11px] text-neutral-500">
              {isEditable ? (
                <span>● Address and delivery slot can be updated self-service until dispatch.</span>
              ) : (
                <span>● Delivery locked for carrier dispatch. For urgent changes, contact concierge.</span>
              )}
            </div>
          </div>
        </div>

        {/* Curated Items Breakdown */}
        <div className="space-y-4">
          <p className="micro-caps text-neutral-400">Curated Items ({order.items?.length || 0})</p>
          <div className="divide-y divide-neutral-200">
            {order.items?.map((item: any) => (
              <div key={item.id} className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-4">
                  {item.productImageUrl ? (
                    <img
                      src={item.productImageUrl}
                      alt={item.productName}
                      className="w-14 h-16 object-cover rounded-xs border border-neutral-200 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-16 bg-stone-100 border border-neutral-200 flex items-center justify-center text-[10px] font-mono text-neutral-400">
                      PIECE
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-neutral-900">{item.productName}</h3>
                    <p className="text-xs font-mono text-neutral-400 mt-0.5">
                      Code: {item.productCode} • Qty: {item.quantity} × ₹{Number(item.priceAtOrder).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono text-sm text-neutral-900 font-medium">
                  ₹{Number(item.totalAtOrder).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Settlement Breakdown */}
        <div className="hairline-t pt-6 max-w-sm ml-auto space-y-2 text-xs font-mono">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotal</span>
            <span>₹{order.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>White-Glove Shipping</span>
            <span>COMPLIMENTARY</span>
          </div>
          {order.tax > 0 && (
            <div className="flex justify-between text-neutral-400">
              <span>Taxes</span>
              <span>₹{order.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-neutral-900 pt-2 hairline-t">
            <span>Total Settled</span>
            <span>₹{order.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
          <p className="text-[10px] text-neutral-400 text-right">
            Payment Method: {order.paymentMethod?.replace(/_/g, ' ') || 'ONLINE'}
          </p>
        </div>

        {/* Actions Bar */}
        <div className="hairline-t pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isCancellable && (
              <button
                onClick={() => setIsCancelModalOpen(true)}
                className="text-xs font-mono text-red-800 hover:text-red-950 underline underline-offset-4"
              >
                Cancel Order
              </button>
            )}
          </div>

          <div className="flex items-center gap-4">
            <a
              href={waConciergeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-luxury-secondary py-2.5 px-4 text-xs flex items-center gap-2 no-underline"
            >
              <WhatsAppIcon size={14} />
              <span>Inquire on WhatsApp</span>
            </a>
          </div>
        </div>
      </div>

      {/* Edit Delivery Modal */}
      <DeliveryEditModal
        orderId={order.id}
        orderNumber={order.orderNumber}
        currentAddress={deliveryAddress}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onUpdated={(updatedOrder) => setOrder(updatedOrder)}
      />

      {/* Cancel Order Modal */}
      <CancelOrderModal
        orderId={order.id}
        orderNumber={order.orderNumber}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onCancelled={(cancelledOrder) => setOrder(cancelledOrder)}
      />
    </div>
  );
}
