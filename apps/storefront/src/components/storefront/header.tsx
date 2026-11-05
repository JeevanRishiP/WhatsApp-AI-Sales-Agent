'use client';

import React from 'react';
import Link from 'next/link';
import { useCustomer } from '@/lib/customer-context';
import { ShoppingBagIcon, UserIcon, WhatsAppIcon, HeartIcon } from '@/components/icons';

interface HeaderProps {
  storeName: string;
  storeSlug: string;
  whatsappPhone?: string | null;
}

export function StorefrontHeader({ storeName, storeSlug, whatsappPhone }: HeaderProps) {
  const { customer, isAuthenticated, dualCart, wishlistCount, openCart, openWishlist, openAuthModal } = useCustomer();

  return (
    <header className="sticky top-0 z-50 glass-header px-6 md:px-12 py-4 flex items-center justify-between">
      {/* Brand Monogram / Title */}
      <div className="flex items-center gap-8">
        <Link href={`/${storeSlug}`} className="text-xl md:text-2xl font-serif tracking-tight text-neutral-900 no-underline hover:opacity-80 transition-opacity">
          {storeName}
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link href={`/${storeSlug}`} className="micro-caps text-neutral-600 hover:text-neutral-900 transition-colors">
            Collections
          </Link>
          <Link href={`/${storeSlug}/wishlist`} className="micro-caps text-neutral-600 hover:text-neutral-900 transition-colors flex items-center gap-1.5">
            <span>Wishlist</span>
            {wishlistCount > 0 && (
              <span className="font-mono text-[10px] bg-neutral-200 text-neutral-800 px-1.5 py-0.2 rounded-full">
                {wishlistCount}
              </span>
            )}
          </Link>
          <Link href={`/${storeSlug}/account`} className="micro-caps text-neutral-600 hover:text-neutral-900 transition-colors">
            My Orders
          </Link>
        </nav>
      </div>

      {/* Right Controls: WhatsApp Live Sync Pill, Account, Wishlist, and Dual Cart */}
      <div className="flex items-center gap-3">
        {/* WhatsApp Omnichannel Live Sync Pill */}
        <div className="hidden sm:flex wa-live-pill cursor-help" title={`Live sync with WhatsApp: ${whatsappPhone || 'Active'}`}>
          <div className="pulse-dot" />
          <span>Synced with WhatsApp</span>
        </div>

        {/* Customer Account Trigger */}
        {isAuthenticated && customer ? (
          <Link
            href={`/${storeSlug}/account`}
            className="flex items-center gap-2 px-3 py-1.5 border border-neutral-200 rounded-sm text-xs font-mono text-neutral-800 hover:border-neutral-800 transition-colors"
          >
            <UserIcon size={14} />
            <span>+{customer.phone.slice(-4)}</span>
          </Link>
        ) : (
          <button
            onClick={openAuthModal}
            className="flex items-center gap-2 px-3 py-1.5 border border-neutral-300 rounded-sm text-xs font-mono uppercase tracking-wider text-neutral-800 hover:border-neutral-900 transition-colors bg-transparent cursor-pointer"
          >
            <WhatsAppIcon size={14} />
            <span>Sign In</span>
          </button>
        )}

        {/* Wishlist Trigger Button */}
        <button
          onClick={openWishlist}
          title="Open Curated Wishlist"
          className="relative p-2 border border-neutral-300 rounded-xs text-neutral-800 hover:border-neutral-900 transition-colors bg-transparent cursor-pointer flex items-center justify-center"
        >
          <HeartIcon size={16} filled={wishlistCount > 0} className={wishlistCount > 0 ? 'text-amber-800' : 'text-neutral-800'} />
          {wishlistCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-amber-800 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center font-mono">
              {wishlistCount}
            </span>
          )}
        </button>

        {/* Dual Cart Bag Button */}
        <button
          onClick={() => openCart()}
          className="btn-luxury-primary relative py-2 px-4 flex items-center gap-2"
        >
          <ShoppingBagIcon size={16} />
          <span>Bag</span>
          {dualCart.totalItemCount > 0 && (
            <span className="ml-1 bg-amber-400 text-neutral-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full font-mono">
              {dualCart.totalItemCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

