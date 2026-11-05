'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCustomer } from '@/lib/customer-context';
import { ArrowLeftIcon, LockIcon, WhatsAppIcon } from '@/components/icons';
import { API_BASE_URL } from '@/lib/config';

export default function CheckoutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const channel = (searchParams.get('channel') as 'wa' | 'web') || 'web';

  const { customer, isAuthenticated, openAuthModal, dualCart, tenantSlug, refreshCart } = useCustomer();

  const cart = channel === 'wa' ? dualCart.waCart : dualCart.webCart;

  const [address, setAddress] = useState({
    recipientName: customer?.name || '',
    phone: customer?.phone || '',
    line1: '',
    line2: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    instructions: '',
    preferredDeliverySlot: 'Afternoon (13:00 - 18:00)',
  });

  const [paymentMethod, setPaymentMethod] = useState<'RAZORPAY_ONLINE' | 'PHONEPE_ONLINE' | 'COD'>('RAZORPAY_ONLINE');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const apiBase = API_BASE_URL;

  React.useEffect(() => {
    if (isAuthenticated) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wcos_customer_token') : null;
      const headers: Record<string, string> = { 'x-tenant-slug': tenantSlug };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      fetch(`${apiBase}/api/v1/customer/addresses`, {
        credentials: 'include',
        headers,
      })
        .then((res) => (res.ok ? res.json() : { addresses: [] }))
        .then((data) => {
          const addrs = data.addresses || [];
          setSavedAddresses(addrs);
          const defaultAddr = addrs.find((a: any) => a.isDefault) || addrs[0];
          if (defaultAddr) {
            setSelectedAddressId(defaultAddr.id);
            setAddress((prev) => ({
              ...prev,
              recipientName: defaultAddr.recipientName,
              phone: defaultAddr.phone,
              line1: defaultAddr.line1,
              line2: defaultAddr.line2 || '',
              landmark: defaultAddr.landmark || '',
              city: defaultAddr.city,
              state: defaultAddr.state,
              pincode: defaultAddr.pincode,
            }));
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, apiBase, tenantSlug]);

  if (!isAuthenticated) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <p className="font-serif text-2xl text-neutral-900 mb-2">Private Client Sign-In Required</p>
        <p className="text-xs font-mono text-neutral-500 mb-6">
          To complete your bespoke reservation, please authenticate with your WhatsApp mobile number.
        </p>
        <button onClick={openAuthModal} className="btn-luxury-primary py-3 px-6">
          Sign In via WhatsApp OTP
        </button>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <p className="font-serif text-2xl text-neutral-900 mb-2">Your Bag is Empty</p>
        <p className="text-xs font-mono text-neutral-500 mb-6">There are no pieces selected in this cart.</p>
        <Link href={`/${tenantSlug}`} className="btn-luxury-primary py-2.5 px-6 no-underline text-xs">
          Explore Collection
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/v1/customer/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantSlug,
          channel,
          deliveryAddress: address,
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to place order');
      }

      await refreshCart();
      router.push(`/${tenantSlug}/orders/${data.order.orderNumber}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Back Link */}
      <div>
        <Link
          href={`/${tenantSlug}`}
          className="inline-flex items-center gap-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 transition-colors no-underline"
        >
          <ArrowLeftIcon size={14} />
          <span>Continue Exploring</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
        {/* Left: Form */}
        <div className="md:col-span-7 space-y-8">
          <div>
            <p className="micro-caps text-neutral-400 mb-1">
              Checkout Channel: {channel === 'wa' ? 'WhatsApp Concierge Bag' : 'Web Boutique Bag'}
            </p>
            <h1 className="text-2xl font-serif text-neutral-900">Delivery & Destination</h1>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono rounded-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} id="checkout-form" className="space-y-4 text-xs font-mono">
            {savedAddresses.length > 0 && (
              <div className="space-y-2 pb-4 border-b border-neutral-200">
                <label className="block text-neutral-800 font-semibold text-xs">
                  Choose from Saved Addresses
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {savedAddresses.map((sa) => (
                    <div
                      key={sa.id}
                      onClick={() => {
                        setSelectedAddressId(sa.id);
                        setAddress((prev) => ({
                          ...prev,
                          recipientName: sa.recipientName,
                          phone: sa.phone,
                          line1: sa.line1,
                          line2: sa.line2 || '',
                          landmark: sa.landmark || '',
                          city: sa.city,
                          state: sa.state,
                          pincode: sa.pincode,
                        }));
                      }}
                      className={`p-3 border rounded-xs cursor-pointer transition-colors ${
                        selectedAddressId === sa.id
                          ? 'border-neutral-900 bg-stone-50 ring-1 ring-neutral-900'
                          : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-neutral-900">
                          {sa.label || 'Saved Address'}
                        </span>
                        {sa.isDefault && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-xs">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-700 truncate font-medium">{sa.line1}</p>
                      <p className="text-neutral-500 text-[11px]">
                        {sa.city}, {sa.pincode}
                      </p>
                    </div>
                  ))}
                  <div
                    onClick={() => {
                      setSelectedAddressId('new');
                      setAddress((prev) => ({
                        ...prev,
                        line1: '',
                        line2: '',
                        landmark: '',
                        city: '',
                        state: '',
                        pincode: '',
                      }));
                    }}
                    className={`p-3 border rounded-xs cursor-pointer transition-colors flex items-center justify-center text-center ${
                      selectedAddressId === 'new'
                        ? 'border-neutral-900 bg-stone-50 ring-1 ring-neutral-900'
                        : 'border-neutral-200 border-dashed hover:border-neutral-300'
                    }`}
                  >
                    <span className="text-neutral-700 font-medium">+ Enter Different Address</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-600 mb-1">Recipient Name *</label>
                <input
                  type="text"
                  required
                  value={address.recipientName}
                  onChange={(e) => setAddress({ ...address, recipientName: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">WhatsApp Phone *</label>
                <input
                  type="tel"
                  required
                  value={address.phone}
                  onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-600 mb-1">Street Address (Line 1) *</label>
              <input
                type="text"
                required
                placeholder="Building, Street, Area"
                value={address.line1}
                onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-neutral-600 mb-1">Apartment / Suite</label>
                <input
                  type="text"
                  value={address.line2}
                  onChange={(e) => setAddress({ ...address, line2: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Landmark</label>
                <input
                  type="text"
                  value={address.landmark}
                  onChange={(e) => setAddress({ ...address, landmark: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-neutral-600 mb-1">City *</label>
                <input
                  type="text"
                  required
                  value={address.city}
                  onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">State *</label>
                <input
                  type="text"
                  required
                  value={address.state}
                  onChange={(e) => setAddress({ ...address, state: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="block text-neutral-600 mb-1">Pincode *</label>
                <input
                  type="text"
                  required
                  value={address.pincode}
                  onChange={(e) => setAddress({ ...address, pincode: e.target.value })}
                  className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-neutral-600 mb-1">Preferred Delivery Slot</label>
              <select
                value={address.preferredDeliverySlot}
                onChange={(e) => setAddress({ ...address, preferredDeliverySlot: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              >
                <option value="Morning (09:00 - 13:00)">Morning (09:00 - 13:00)</option>
                <option value="Afternoon (13:00 - 18:00)">Afternoon (13:00 - 18:00)</option>
                <option value="Evening (18:00 - 21:00)">Evening (18:00 - 21:00)</option>
              </select>
            </div>

            <div>
              <label className="block text-neutral-600 mb-1">Concierge Delivery Instructions</label>
              <textarea
                rows={2}
                placeholder="e.g. Leave with gate security, call before arrival."
                value={address.instructions}
                onChange={(e) => setAddress({ ...address, instructions: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="pt-4 border-t border-neutral-200">
              <label className="block text-neutral-800 font-medium mb-3">Settlement Method</label>
              <div className="space-y-2">
                {[
                  { id: 'RAZORPAY_ONLINE', label: 'Razorpay Instant UPI / Card', desc: 'Secure settlement via Razorpay' },
                  { id: 'PHONEPE_ONLINE', label: 'PhonePe Direct UPI', desc: 'Instant UPI app intent' },
                  { id: 'COD', label: 'Cash on White-Glove Delivery', desc: 'Settle at your doorstep' },
                ].map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-3 p-3 border rounded-xs cursor-pointer transition-colors ${
                      paymentMethod === m.id ? 'border-neutral-900 bg-stone-50' : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={m.id}
                      checked={paymentMethod === m.id}
                      onChange={() => setPaymentMethod(m.id as any)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="font-medium text-neutral-900">{m.label}</p>
                      <p className="text-[11px] text-neutral-400">{m.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </form>
        </div>

        {/* Right: Order Summary */}
        <div className="md:col-span-5">
          <div className="swiss-receipt p-6 space-y-6 sticky top-24">
            <h2 className="text-lg font-serif text-neutral-900">Summary ({cart.itemCount} Items)</h2>

            <div className="divide-y divide-neutral-200 max-h-60 overflow-y-auto pr-1">
              {cart.items.map((item) => (
                <div key={item.productCode} className="py-3 flex justify-between gap-3 text-xs font-mono">
                  <div>
                    <p className="font-sans font-medium text-neutral-900">{item.productName}</p>
                    <p className="text-neutral-400 text-[11px]">Qty: {item.quantity}</p>
                  </div>
                  <div className="text-right text-neutral-900">
                    ₹{(item.priceAtAdd * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-xs font-mono pt-4 border-t border-neutral-200">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>₹{cart.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>White-Glove Delivery</span>
                <span>COMPLIMENTARY</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-neutral-900 pt-2 border-t border-neutral-200">
                <span>Total Settled</span>
                <span>₹{cart.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <button
              type="submit"
              form="checkout-form"
              disabled={isSubmitting}
              className="w-full btn-luxury-primary py-3.5 flex items-center justify-center gap-2"
            >
              <LockIcon size={14} />
              <span>{isSubmitting ? 'Processing Order...' : 'Complete Reservation & Place Order'}</span>
            </button>

            <div className="text-center pt-1 text-[11px] font-mono text-neutral-400 flex items-center justify-center gap-1.5">
              <WhatsAppIcon size={12} className="text-emerald-600" />
              <span>Instant WhatsApp confirmation will be sent upon completion</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
