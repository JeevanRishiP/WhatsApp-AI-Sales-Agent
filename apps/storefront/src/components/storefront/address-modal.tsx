'use client';

import React, { useState, useEffect } from 'react';
import { XIcon, MapPinIcon, CheckIcon } from '@/components/icons';
import { API_BASE_URL } from '@/lib/config';

export interface SavedAddress {
  id: string;
  label?: string | null;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt?: string;
}

interface AddressModalProps {
  isOpen: boolean;
  initialData?: SavedAddress | null;
  onClose: () => void;
  onSaved: (address: SavedAddress) => void;
}

export function AddressModal({
  isOpen,
  initialData,
  onClose,
  onSaved,
}: AddressModalProps) {
  const [formData, setFormData] = useState({
    label: 'Home',
    recipientName: '',
    phone: '',
    line1: '',
    line2: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    isDefault: false,
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setFormData({
        label: initialData.label || 'Home',
        recipientName: initialData.recipientName || '',
        phone: initialData.phone || '',
        line1: initialData.line1 || '',
        line2: initialData.line2 || '',
        landmark: initialData.landmark || '',
        city: initialData.city || '',
        state: initialData.state || '',
        pincode: initialData.pincode || '',
        isDefault: initialData.isDefault || false,
      });
    } else {
      setFormData({
        label: 'Home',
        recipientName: '',
        phone: '',
        line1: '',
        line2: '',
        landmark: '',
        city: '',
        state: '',
        pincode: '',
        isDefault: false,
      });
    }
    setError(null);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const apiBase = API_BASE_URL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem('wcos_customer_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const isEditing = Boolean(initialData?.id);
      const url = isEditing
        ? `${apiBase}/api/v1/customer/addresses/${initialData!.id}`
        : `${apiBase}/api/v1/customer/addresses`;
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers,
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to save address');
      }

      onSaved(data.address);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const labelPresets = ['Home', 'Office', 'Studio', 'Residence', 'Other'];

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
            <span>Delivery Destination Management</span>
          </div>
          <h2 className="text-xl font-serif text-neutral-900 tracking-tight">
            {initialData ? 'Edit Saved Address' : 'Add New Delivery Destination'}
          </h2>
          <p className="text-xs font-mono text-neutral-500 mt-1">
            Saved addresses are instantly available for both WhatsApp concierge orders and web boutique reservations.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono rounded-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          {/* Label Presets */}
          <div>
            <label className="block text-neutral-600 mb-1.5 font-medium">Location Label</label>
            <div className="flex flex-wrap gap-2">
              {labelPresets.map((lbl) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => setFormData({ ...formData, label: lbl })}
                  className={`px-3 py-1.5 rounded-xs border text-xs transition-colors ${
                    formData.label === lbl
                      ? 'bg-neutral-900 text-white border-neutral-900'
                      : 'bg-stone-50 text-neutral-600 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-600 mb-1">Recipient Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Jeevan Rishi P"
                value={formData.recipientName}
                onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Contact Phone *</label>
              <input
                type="tel"
                required
                placeholder="e.g. 9380990565"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-600 mb-1">Street Address (Line 1) *</label>
            <input
              type="text"
              required
              placeholder="House/Flat No., Building name, 1st Cross..."
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
                placeholder="Area, Colony, Sector..."
                value={formData.line2}
                onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Landmark</label>
              <input
                type="text"
                placeholder="e.g. Near Metro Station"
                value={formData.landmark}
                onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
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
                placeholder="Bengaluru"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">State *</label>
              <input
                type="text"
                required
                placeholder="Karnataka"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
            <div>
              <label className="block text-neutral-600 mb-1">Pincode *</label>
              <input
                type="text"
                required
                placeholder="562123"
                value={formData.pincode}
                onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="isDefaultCheckbox"
              checked={formData.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
              className="rounded-xs text-neutral-900 focus:ring-0 cursor-pointer"
            />
            <label htmlFor="isDefaultCheckbox" className="text-neutral-700 cursor-pointer select-none">
              Set as primary default delivery destination
            </label>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-neutral-100">
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
              <span>{isLoading ? 'Saving Address...' : (initialData ? 'Update Address' : 'Save Address')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

