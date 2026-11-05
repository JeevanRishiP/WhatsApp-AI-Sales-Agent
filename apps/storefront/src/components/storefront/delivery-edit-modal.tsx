'use client';

import React, { useState } from 'react';
import { XIcon, MapPinIcon, CheckIcon } from '@/components/icons';
import { API_BASE_URL } from '@/lib/config';

interface DeliveryEditModalProps {
  orderId: string;
  orderNumber: string;
  currentAddress: any;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedOrder: any) => void;
}

export function DeliveryEditModal({
  orderId,
  orderNumber,
  currentAddress,
  isOpen,
  onClose,
  onUpdated,
}: DeliveryEditModalProps) {
  const [formData, setFormData] = useState({
    recipientName: currentAddress?.recipientName || '',
    phone: currentAddress?.phone || '',
    line1: currentAddress?.line1 || '',
    line2: currentAddress?.line2 || '',
    landmark: currentAddress?.landmark || '',
    city: currentAddress?.city || '',
    state: currentAddress?.state || '',
    pincode: currentAddress?.pincode || '',
    instructions: currentAddress?.instructions || '',
    preferredDeliverySlot: currentAddress?.preferredDeliverySlot || 'Afternoon (13:00 - 18:00)',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const apiBase = API_BASE_URL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/v1/customer/orders/${orderId}/delivery`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to update delivery destination');
      }

      onUpdated(data.order);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-white border border-neutral-200 rounded-sm p-8 shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors"
        >
          <XIcon size={18} />
        </button>

        <div className="mb-6">
          <div className="flex items-center gap-2 text-amber-700 micro-caps mb-1">
            <MapPinIcon size={14} />
            <span>Self-Service Order Management</span>
          </div>
          <h2 className="text-xl font-serif text-neutral-900 tracking-tight">
            Modify Delivery Destination
          </h2>
          <p className="text-xs font-mono text-neutral-500 mt-1">
            Order #{orderNumber} • Changes will be synchronized and confirmed on WhatsApp immediately.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono rounded-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-600 mb-1">Recipient Name</label>
              <input
                type="text"
                required
                value={formData.recipientName}
                onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Contact Phone</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-600 mb-1">Street Address (Line 1)</label>
            <input
              type="text"
              required
              value={formData.line1}
              onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-600 mb-1">Apartment / Suite (Line 2)</label>
              <input
                type="text"
                value={formData.line2}
                onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Landmark</label>
              <input
                type="text"
                value={formData.landmark}
                onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-neutral-600 mb-1">City</label>
              <input
                type="text"
                required
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">State</label>
              <input
                type="text"
                required
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Pincode</label>
              <input
                type="text"
                required
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-600 mb-1">Preferred Delivery Time Window</label>
            <select
              value={formData.preferredDeliverySlot}
              onChange={(e) => setFormData({ ...formData, preferredDeliverySlot: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
            >
              <option value="Morning (09:00 - 13:00)">Morning (09:00 - 13:00)</option>
              <option value="Afternoon (13:00 - 18:00)">Afternoon (13:00 - 18:00)</option>
              <option value="Evening (18:00 - 21:00)">Evening (18:00 - 21:00)</option>
            </select>
          </div>

          <div>
            <label className="block text-neutral-600 mb-1">Special Concierge Instructions</label>
            <textarea
              rows={2}
              placeholder="e.g. Leave with front desk concierge, do not ring bell."
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-luxury-secondary py-2.5 px-4"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-luxury-primary py-2.5 px-6 flex items-center gap-2"
            >
              <CheckIcon size={14} />
              <span>{isLoading ? 'Updating & Syncing...' : 'Save & Confirm on WhatsApp'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
