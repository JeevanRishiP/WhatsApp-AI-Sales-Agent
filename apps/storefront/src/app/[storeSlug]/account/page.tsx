'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCustomer } from '@/lib/customer-context';
import {
  ShoppingBagIcon,
  UserIcon,
  WhatsAppIcon,
  ArrowRightIcon,
  MapPinIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
} from '@/components/icons';
import { API_BASE_URL } from '@/lib/config';
import { AddressModal, type SavedAddress } from '@/components/storefront/address-modal';

interface OrderItemSummary {
  id: string;
  productName: string;
  quantity: number;
  totalAtOrder: number;
}

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  deliveryAddress: any;
  createdAt: string;
  items: OrderItemSummary[];
  isEditable: boolean;
}

export default function CustomerAccountPage() {
  const { customer, isAuthenticated, isLoading, openAuthModal, tenantSlug, logout } = useCustomer();
  const [activeTab, setActiveTab] = useState<'orders' | 'addresses'>('orders');
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [isFetchingOrders, setIsFetchingOrders] = useState(false);

  // Address state
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isFetchingAddresses, setIsFetchingAddresses] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [addressNotice, setAddressNotice] = useState<string | null>(null);

  const apiBase = API_BASE_URL;

  // Fetch orders and saved addresses
  useEffect(() => {
    if (isAuthenticated) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('wcos_customer_token') : null;
      const headers: Record<string, string> = {
        'x-tenant-slug': tenantSlug,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      setIsFetchingOrders(true);
      fetch(`${apiBase}/api/v1/customer/orders`, {
        credentials: 'include',
        headers,
      })
        .then((res) => (res.ok ? res.json() : { orders: [] }))
        .then((data) => setOrders(data.orders || []))
        .catch(() => setOrders([]))
        .finally(() => setIsFetchingOrders(false));

      setIsFetchingAddresses(true);
      fetch(`${apiBase}/api/v1/customer/addresses`, {
        credentials: 'include',
        headers,
      })
        .then((res) => (res.ok ? res.json() : { addresses: [] }))
        .then((data) => setAddresses(data.addresses || []))
        .catch(() => setAddresses([]))
        .finally(() => setIsFetchingAddresses(false));
    }
  }, [isAuthenticated, apiBase, tenantSlug]);

  const handleSetDefaultAddress = async (id: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('wcos_customer_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-slug': tenantSlug,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${apiBase}/api/v1/customer/addresses/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ isDefault: true }),
      });
      if (res.ok) {
        setAddresses((prev) =>
          prev.map((a) => ({
            ...a,
            isDefault: a.id === id,
          }))
        );
        setAddressNotice('Primary default delivery destination updated.');
        setTimeout(() => setAddressNotice(null), 3000);
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteAddress = async (id: string) => {
    if (!confirm('Are you sure you wish to remove this saved delivery address?')) return;

    const token = typeof window !== 'undefined' ? localStorage.getItem('wcos_customer_token') : null;
    const headers: Record<string, string> = {
      'x-tenant-slug': tenantSlug,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${apiBase}/api/v1/customer/addresses/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers,
      });
      if (res.ok) {
        setAddresses((prev) => prev.filter((a) => a.id !== id));
        setAddressNotice('Delivery address removed successfully.');
        setTimeout(() => setAddressNotice(null), 3000);
      }
    } catch {
      // ignore
    }
  };

  const handleAddressSaved = (saved: SavedAddress) => {
    setAddresses((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      let updated: SavedAddress[];
      if (exists) {
        updated = prev.map((a) => (a.id === saved.id ? saved : a));
      } else {
        updated = [saved, ...prev];
      }

      if (saved.isDefault) {
        updated = updated.map((a) => ({
          ...a,
          isDefault: a.id === saved.id,
        }));
      }
      return updated;
    });

    setAddressNotice('Delivery destination saved and synchronized.');
    setTimeout(() => setAddressNotice(null), 3000);
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center font-mono text-xs text-neutral-400">
        Loading private client records...
      </div>
    );
  }

  if (!isAuthenticated || !customer) {
    return (
      <div className="py-20 max-w-lg mx-auto text-center border border-neutral-200/80 rounded-sm p-10 bg-white">
        <UserIcon size={36} strokeWidth={1} className="mx-auto text-neutral-300 mb-4" />
        <h1 className="text-2xl font-serif font-light text-neutral-900 tracking-tight">
          Private Client Identification
        </h1>
        <p className="text-xs font-mono text-neutral-500 mt-2 mb-8 leading-relaxed">
          Access your personal orders, saved delivery addresses, and concierge bag. Authentication is completed securely via WhatsApp OTP.
        </p>
        <button
          onClick={openAuthModal}
          className="w-full btn-luxury-primary py-3 flex items-center justify-center gap-2"
        >
          <WhatsAppIcon size={16} />
          <span>Sign In with WhatsApp</span>
        </button>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'SHIPPED':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'PROCESSING':
      case 'PAYMENT_CONFIRMED':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'CANCELLED':
        return 'bg-red-50 text-red-800 border-red-200';
      default:
        return 'bg-stone-100 text-stone-700 border-stone-200';
    }
  };

  return (
    <div className="space-y-10">
      {/* Client Profile Header */}
      <section className="hairline-b pb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <p className="micro-caps text-neutral-400 mb-1">Authenticated Client Session</p>
          <h1 className="text-3xl font-serif font-normal text-neutral-900">
            {customer.name || `Client +${customer.phone}`}
          </h1>
          <p className="text-xs font-mono text-neutral-500 mt-1 flex items-center gap-2">
            <WhatsAppIcon size={12} className="text-emerald-600" />
            <span>Verified Phone: +{customer.phone}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={logout}
            className="btn-luxury-secondary py-2 px-4 text-xs"
          >
            Sign Out
          </button>
        </div>
      </section>

      {/* Notice Banner */}
      {addressNotice && (
        <div className="p-3 bg-stone-900 text-white text-xs font-mono rounded-xs flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckIcon size={14} className="text-emerald-400" />
            <span>{addressNotice}</span>
          </div>
          <button onClick={() => setAddressNotice(null)} className="text-neutral-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-neutral-200 text-xs font-mono">
        <button
          onClick={() => setActiveTab('orders')}
          className={`py-3 px-4 border-b-2 font-medium transition-colors ${
            activeTab === 'orders'
              ? 'border-neutral-900 text-neutral-900'
              : 'border-transparent text-neutral-400 hover:text-neutral-700'
          }`}
        >
          Order History ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('addresses')}
          className={`py-3 px-4 border-b-2 font-medium transition-colors ${
            activeTab === 'addresses'
              ? 'border-neutral-900 text-neutral-900'
              : 'border-transparent text-neutral-400 hover:text-neutral-700'
          }`}
        >
          Saved Delivery Destinations ({addresses.length})
        </button>
      </div>

      {/* ─── TAB 1: ORDERS & DELIVERIES ─────────────────────────────────── */}
      {activeTab === 'orders' && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-serif text-neutral-900">Order History & Deliveries</h2>
              <p className="text-xs font-mono text-neutral-400 mt-0.5">
                Review progress, download invoices, or modify delivery destinations in real-time.
              </p>
            </div>
            <span className="micro-caps text-neutral-400">
              {orders.length} Order{orders.length === 1 ? '' : 's'} Total
            </span>
          </div>

          {isFetchingOrders ? (
            <div className="py-12 text-center text-xs font-mono text-neutral-400">
              Retrieving order history...
            </div>
          ) : orders.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-neutral-200 rounded-sm p-8 bg-stone-50">
              <ShoppingBagIcon size={32} strokeWidth={1} className="mx-auto text-neutral-300 mb-3" />
              <p className="font-serif text-lg text-neutral-700">No Orders Found</p>
              <p className="text-xs font-mono text-neutral-400 mt-1 mb-6">
                You haven't placed an order via WhatsApp or our web boutique yet.
              </p>
              <Link
                href={`/${tenantSlug}`}
                className="btn-luxury-primary py-2.5 px-6 inline-flex no-underline text-xs"
              >
                Explore Collection
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="swiss-receipt p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  {/* Left: Number & Status */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-semibold tracking-wider text-neutral-900">
                        #{order.orderNumber}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-xs border ${getStatusBadge(order.status)}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                      {order.isEditable && (
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded-xs">
                          Delivery Editable
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-mono text-neutral-400">
                      Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>

                    <div className="text-xs text-neutral-600 font-sans">
                      {order.items.map((i) => `${i.productName} (×${i.quantity})`).join(', ')}
                    </div>

                    {order.deliveryAddress && (
                      <div className="text-[11px] font-mono text-neutral-500 pt-1">
                        📍 Deliver to: {order.deliveryAddress.recipientName || order.deliveryAddress.name} •{' '}
                        {order.deliveryAddress.line1 || order.deliveryAddress.addressLine1 || order.deliveryAddress.address}, {order.deliveryAddress.city} - {order.deliveryAddress.pincode}
                      </div>
                    )}
                  </div>

                  {/* Right: Total & Action Link */}
                  <div className="flex flex-col md:items-end justify-between gap-4 pt-4 md:pt-0 border-t md:border-t-0 border-neutral-100">
                    <div className="text-left md:text-right">
                      <p className="micro-caps text-neutral-400">Total Settled</p>
                      <p className="text-base font-mono font-medium text-neutral-900">
                        ₹{order.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <Link
                      href={`/${tenantSlug}/orders/${order.orderNumber}`}
                      className="btn-luxury-secondary py-2 px-4 text-xs flex items-center gap-2 no-underline"
                    >
                      <span>Manage Order & Delivery</span>
                      <ArrowRightIcon size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── TAB 2: SAVED DELIVERY DESTINATIONS ─────────────────────────── */}
      {activeTab === 'addresses' && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-serif text-neutral-900">Saved Delivery Destinations</h2>
              <p className="text-xs font-mono text-neutral-400 mt-0.5">
                Manage multiple residences, studios, or corporate addresses. The WhatsApp concierge can deliver to any saved destination upon request.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingAddress(null);
                setIsAddressModalOpen(true);
              }}
              className="btn-luxury-primary py-2.5 px-4 text-xs inline-flex items-center gap-2 self-start sm:self-auto"
            >
              <PlusIcon size={14} />
              <span>Add New Address</span>
            </button>
          </div>

          {isFetchingAddresses ? (
            <div className="py-12 text-center text-xs font-mono text-neutral-400">
              Retrieving saved delivery destinations...
            </div>
          ) : addresses.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-neutral-200 rounded-sm p-8 bg-stone-50">
              <MapPinIcon size={32} strokeWidth={1} className="mx-auto text-neutral-300 mb-3" />
              <p className="font-serif text-lg text-neutral-700">No Saved Delivery Destinations</p>
              <p className="text-xs font-mono text-neutral-400 mt-1 mb-6">
                Add your home or office address to enable 1-click checkout on WhatsApp and web.
              </p>
              <button
                onClick={() => {
                  setEditingAddress(null);
                  setIsAddressModalOpen(true);
                }}
                className="btn-luxury-primary py-2.5 px-6 inline-flex text-xs items-center gap-2"
              >
                <PlusIcon size={14} />
                <span>Add Your First Address</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  className={`p-6 border rounded-sm transition-shadow relative flex flex-col justify-between ${
                    addr.isDefault
                      ? 'border-neutral-900 bg-white shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-neutral-300'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header: Label & Default badge */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base">
                          {addr.label?.toLowerCase().includes('office') || addr.label?.toLowerCase().includes('work')
                            ? '🏢'
                            : '🏡'}
                        </span>
                        <span className="font-mono text-xs uppercase tracking-wider font-semibold text-neutral-900">
                          {addr.label || 'Destination'}
                        </span>
                      </div>

                      {addr.isDefault && (
                        <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-xs bg-amber-50 text-amber-800 border border-amber-200">
                          Primary Default
                        </span>
                      )}
                    </div>

                    {/* Recipient Details */}
                    <div>
                      <h4 className="font-sans text-sm font-semibold text-neutral-900">
                        {addr.recipientName}
                      </h4>
                      <p className="text-xs font-mono text-neutral-500">
                        📞 {addr.phone}
                      </p>
                    </div>

                    {/* Address Lines */}
                    <div className="text-xs font-mono text-neutral-700 space-y-0.5 leading-relaxed">
                      <p className="font-medium text-neutral-900">{addr.line1}</p>
                      {addr.line2 && <p className="text-neutral-600">{addr.line2}</p>}
                      {addr.landmark && (
                        <p className="text-neutral-400 text-[11px]">
                          Landmark: {addr.landmark}
                        </p>
                      )}
                      <p>
                        {addr.city}, {addr.state} <strong className="text-neutral-900">- {addr.pincode}</strong>
                      </p>
                      <p className="text-[11px] text-neutral-400">India</p>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-5 mt-5 border-t border-neutral-100 flex items-center justify-between gap-2 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingAddress(addr);
                          setIsAddressModalOpen(true);
                        }}
                        className="text-neutral-700 hover:text-neutral-900 underline underline-offset-4"
                      >
                        Edit
                      </button>

                      {!addr.isDefault && (
                        <>
                          <span className="text-neutral-300">•</span>
                          <button
                            onClick={() => handleSetDefaultAddress(addr.id)}
                            className="text-neutral-500 hover:text-neutral-900"
                          >
                            Set Default
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteAddress(addr.id)}
                      className="text-neutral-400 hover:text-red-600 p-1 transition-colors"
                      title="Remove Address"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Address Create / Edit Modal */}
      <AddressModal
        isOpen={isAddressModalOpen}
        initialData={editingAddress}
        onClose={() => {
          setIsAddressModalOpen(false);
          setEditingAddress(null);
        }}
        onSaved={handleAddressSaved}
      />
    </div>
  );
}
