'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '@/lib/config';
import {
  MapPinIcon,
  ArrowLeftIcon,
  WhatsAppIcon,
} from '@/components/icons';
import { formatDateTime } from '@/lib/format';

interface TrackingEvent {
  status: string;
  label: string;
  location: string;
  description: string;
  timestamp: string;
  completed: boolean;
  current: boolean;
}

interface ShipmentData {
  orderNumber: string;
  status: string;
  courierPartner: 'DELHIVERY' | string;
  courierName: string;
  awbCode: string;
  trackingUrl?: string;
  dispatchedAt: string;
  estimatedDelivery: string;
  destination: {
    recipientMasked: string;
    city: string;
    state: string;
    pincode: string;
  };
  itemsSummary: Array<{
    productName: string;
    productCode: string;
    quantity: number;
  }>;
  itemCount: number;
  trackingEvents: TrackingEvent[];
  store: {
    name: string;
    slug: string;
    whatsappNumber?: string;
  };
}

export default function PublicTrackingPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const storeSlug = (params['storeSlug'] as string) || 'aura';
  const queryParam = searchParams.get('awb') || searchParams.get('order') || '';

  const [searchInput, setSearchInput] = useState(queryParam);
  const [shipment, setShipment] = useState<ShipmentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchTracking = async (lookupQuery: string) => {
    if (!lookupQuery.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/customer/track/${encodeURIComponent(lookupQuery.trim())}`, {
        headers: {
          'x-tenant-slug': storeSlug,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Shipment not found');
      }

      const data = await res.json();
      setShipment(data.shipment);
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve tracking details');
      setShipment(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (queryParam) {
      setSearchInput(queryParam);
      fetchTracking(queryParam);
    }
  }, [queryParam, storeSlug]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(searchInput);
  };

  const handleCopyAwb = () => {
    if (shipment?.awbCode) {
      navigator.clipboard.writeText(shipment.awbCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isDelhivery = shipment?.courierPartner === 'DELHIVERY';

  return (
    <div className="space-y-10 max-w-4xl mx-auto py-6">
      {/* Back Link */}
      <div>
        <Link
          href={`/${storeSlug}`}
          className="inline-flex items-center gap-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 transition-colors no-underline"
        >
          <ArrowLeftIcon size={14} />
          <span>Back to Boutique</span>
        </Link>
      </div>

      {/* Hero Header & Search Bar */}
      <div className="text-center space-y-3">
        <p className="micro-caps text-neutral-400">Live Logistics & Courier Gateway</p>
        <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 tracking-tight">
          Track Your Delivery
        </h1>
        <p className="text-xs font-mono text-neutral-500 max-w-lg mx-auto">
          Scan the QR code on your printed bill or enter your unique Airway Bill (AWB) / Order Reference number below.
        </p>

        <form onSubmit={handleSearchSubmit} className="max-w-md mx-auto pt-4 flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="e.g. DEL-9842109482 or ORD-MVZ5ADSD"
            className="input-luxury text-xs py-2.5 px-4 font-mono flex-1 uppercase"
          />
          <button
            type="submit"
            disabled={isLoading || !searchInput.trim()}
            className="btn-luxury-primary py-2.5 px-6 text-xs whitespace-nowrap"
          >
            {isLoading ? 'Scanning...' : 'Track'}
          </button>
        </form>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-mono rounded-xs text-center max-w-md mx-auto">
          {error}
        </div>
      )}

      {/* Live Shipment Details Card */}
      {shipment && (
        <div className="swiss-receipt p-6 md:p-10 space-y-8 animate-fadeIn">
          {/* Top Header Grid */}
          <div className="hairline-b pb-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-xs border font-bold ${
                    isDelhivery
                      ? 'bg-teal-50 border-teal-300 text-teal-800'
                      : 'bg-amber-50 border-amber-300 text-amber-800'
                  }`}
                >
                  {shipment.courierName}
                </span>
                <span className="text-[10px] font-mono text-neutral-400">Logistics Sandbox Active</span>
              </div>
              <h2 className="text-2xl font-serif text-neutral-900">
                Order #{shipment.orderNumber}
              </h2>
              <div className="flex items-center gap-2 mt-2 text-xs font-mono text-neutral-600">
                <span>AWB / Tracking ID:</span>
                <code className="font-bold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded-xs">
                  {shipment.awbCode}
                </code>
                <button
                  type="button"
                  onClick={handleCopyAwb}
                  className="text-[10px] text-amber-800 underline hover:text-amber-900 cursor-pointer"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="text-left md:text-right space-y-1">
              <p className="micro-caps text-neutral-400">Current Status</p>
              <div className="inline-block px-3 py-1 bg-neutral-900 text-stone-100 font-mono text-xs uppercase tracking-wider rounded-xs font-bold">
                {shipment.status.replace(/_/g, ' ')}
              </div>
              <p className="text-[11px] font-mono text-neutral-500">
                Estimated Delivery: <strong className="text-neutral-800">{shipment.estimatedDelivery}</strong>
              </p>
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="py-2">
            <p className="micro-caps text-neutral-400 mb-6">Delivery Milestones</p>
            <div className="relative">
              <div className="space-y-6">
                {shipment.trackingEvents.map((evt, idx) => {
                  return (
                    <div key={idx} className="flex items-start gap-4 text-xs font-mono">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                            evt.completed
                              ? 'bg-neutral-900 text-stone-100 border-neutral-900'
                              : evt.current
                              ? 'bg-amber-600 text-white border-amber-600 animate-pulse'
                              : 'bg-stone-100 text-neutral-400 border-neutral-300'
                          }`}
                        >
                          {evt.completed ? '✓' : idx + 1}
                        </div>
                        {idx < shipment.trackingEvents.length - 1 && (
                          <div
                            className={`w-0.5 h-12 my-1 ${
                              evt.completed ? 'bg-neutral-800' : 'bg-neutral-200'
                            }`}
                          />
                        )}
                      </div>

                      <div className="flex-1 pt-0.5 space-y-1">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <span className={`font-medium ${evt.completed || evt.current ? 'text-neutral-900 font-bold' : 'text-neutral-400'}`}>
                            {evt.label}
                          </span>
                          <span className="text-[10px] text-neutral-400" suppressHydrationWarning>
                            {formatDateTime(evt.timestamp)}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-600">{evt.description}</p>
                        <p className="text-[10px] text-neutral-400 flex items-center gap-1">
                          <MapPinIcon size={10} />
                          <span>{evt.location}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Destination & Package Particulars */}
          <div className="hairline-t pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
            <div className="space-y-2">
              <p className="micro-caps text-neutral-400">Destination Details</p>
              <p className="font-bold text-neutral-800">{shipment.destination.recipientMasked}</p>
              <p className="text-neutral-600">
                {shipment.destination.city}, {shipment.destination.state} - {shipment.destination.pincode}
              </p>
            </div>

            <div className="space-y-2">
              <p className="micro-caps text-neutral-400">Shipment Contents ({shipment.itemCount} items)</p>
              <ul className="space-y-1 text-neutral-700">
                {shipment.itemsSummary.map((it, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span>{it.productName} (x{it.quantity})</span>
                    <code className="text-[10px] text-neutral-400">{it.productCode}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Need Assistance Bar */}
          <div className="p-4 bg-stone-100/70 border border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xs text-xs font-mono">
            <div>
              <p className="font-bold text-neutral-800">Have questions about your delivery?</p>
              <p className="text-[11px] text-neutral-500">
                Our luxury boutique AI concierge is ready to assist on WhatsApp 24/7.
              </p>
            </div>
            {shipment.store.whatsappNumber && (
              <a
                href={`https://wa.me/${shipment.store.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                  `Namaste, I am checking the status of my Order #${shipment.orderNumber} (AWB: ${shipment.awbCode}). Can you provide updates?`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-luxury-secondary py-2 px-4 inline-flex items-center gap-2 no-underline text-xs whitespace-nowrap"
              >
                <WhatsAppIcon size={14} className="text-emerald-700" />
                <span>Contact Concierge</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
