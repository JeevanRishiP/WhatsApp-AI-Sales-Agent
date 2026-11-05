'use client';

import React, { useState } from 'react';
import { XIcon } from '@/components/icons';
import { API_BASE_URL } from '@/lib/config';

interface CancelOrderModalProps {
  orderId: string;
  orderNumber: string;
  isOpen: boolean;
  onClose: () => void;
  onCancelled: (updatedOrder: any) => void;
}

export function CancelOrderModal({
  orderId,
  orderNumber,
  isOpen,
  onClose,
  onCancelled,
}: CancelOrderModalProps) {
  const [reason, setReason] = useState('Changed delivery address / placed by mistake');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const apiBase = API_BASE_URL;

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${apiBase}/api/v1/customer/orders/${orderId}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel order');
      }

      onCancelled(data.order);
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

      <div className="relative w-full max-w-md bg-white border border-neutral-200 rounded-sm p-8 shadow-2xl z-10">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors"
        >
          <XIcon size={18} />
        </button>

        <div className="mb-6">
          <p className="micro-caps text-red-700 mb-1">Cancellation Request</p>
          <h2 className="text-xl font-serif text-neutral-900 tracking-tight">
            Cancel Order #{orderNumber}
          </h2>
          <p className="text-xs font-mono text-neutral-500 mt-1">
            Once cancelled, reserved inventory will be released and our boutique concierge will process any refund.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-mono rounded-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleCancel} className="space-y-4 text-xs font-mono">
          <div>
            <label className="block text-neutral-600 mb-1">Reason for cancellation</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-neutral-300 rounded-xs text-neutral-900 focus:outline-none focus:border-neutral-900"
            >
              <option value="Changed delivery address / placed by mistake">Changed delivery address / placed by mistake</option>
              <option value="Found alternative piece">Found alternative piece</option>
              <option value="Delivery timing conflict">Delivery timing conflict</option>
              <option value="Other reason">Other reason</option>
            </select>
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="btn-luxury-secondary py-2.5 px-4"
            >
              Keep Order
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2.5 bg-red-800 text-white rounded-xs font-mono text-xs uppercase tracking-wider hover:bg-red-900 transition-colors"
            >
              {isLoading ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
