'use client';

import React from 'react';
import Link from 'next/link';
import { useCustomer, WishlistItem } from '@/lib/customer-context';
import { XIcon, HeartIcon, ShoppingBagIcon, TrashIcon, WhatsAppIcon, ArrowRightIcon } from '@/components/icons';

interface WishlistDrawerProps {
  storeSlug: string;
  whatsappNumber?: string | null;
}

export function WishlistDrawer({ storeSlug, whatsappNumber }: WishlistDrawerProps) {
  const {
    wishlist,
    wishlistCount,
    isWishlistOpen,
    closeWishlist,
    removeFromWishlist,
    moveToBagFromWishlist,
    moveAllWishlistToBag,
    clearWishlist,
  } = useCustomer();

  if (!isWishlistOpen) return null;

  const cleanPhone = whatsappNumber?.replace(/[^0-9]/g, '');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Dimmed Backdrop */}
      <div
        className="drawer-overlay"
        onClick={closeWishlist}
        aria-hidden="true"
      />

      {/* Slide-over Container */}
      <div className="drawer-content flex flex-col justify-between">
        {/* Header */}
        <div className="p-6 border-b border-neutral-200/80 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-3">
            <HeartIcon size={20} filled className="text-amber-800" />
            <div>
              <h2 className="font-serif text-xl tracking-tight text-neutral-900">
                Curated Wishlist
              </h2>
              <p className="micro-caps text-neutral-400 mt-0.5">
                {wishlistCount} {wishlistCount === 1 ? 'Piece Saved' : 'Pieces Saved'}
              </p>
            </div>
          </div>
          <button
            onClick={closeWishlist}
            className="p-2 text-neutral-500 hover:text-neutral-900 transition-colors rounded-xs hover:bg-neutral-100"
            aria-label="Close Wishlist"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {wishlist.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-4">
              <div className="w-16 h-16 rounded-full bg-stone-100 border border-neutral-200/80 flex items-center justify-center text-neutral-400">
                <HeartIcon size={28} />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif text-2xl text-neutral-900">Your Private Vault is Empty</h3>
                <p className="text-sm text-neutral-500 max-w-xs mx-auto leading-relaxed">
                  Save heritage silk sarees you adore to revisit anytime, or consult Meera on WhatsApp.
                </p>
              </div>
              <button
                onClick={closeWishlist}
                className="btn-luxury-primary text-xs mt-2"
              >
                Explore Saree Collection
              </button>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {wishlist.map((item: WishlistItem) => {
                const effectivePrice = item.salePrice ?? item.price;
                const isOutOfStock = item.availableStock <= 0;
                const waItemInquiry = cleanPhone
                  ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                      `Hello Meera, I have saved ${item.name} [${item.code}] in my Wishlist. Can you tell me more about its zari work and shipping?`
                    )}`
                  : '#';

                return (
                  <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex gap-4 group">
                    {/* Thumbnail */}
                    <Link
                      href={`/${storeSlug}/products/${item.id}`}
                      onClick={closeWishlist}
                      className="w-20 h-24 bg-stone-100 border border-neutral-200 flex-shrink-0 overflow-hidden rounded-xs relative block"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-300 font-serif text-sm">
                          {item.name.slice(0, 1)}
                        </div>
                      )}
                    </Link>

                    {/* Metadata & Actions */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            {item.category && (
                              <p className="micro-caps text-neutral-400 text-[10px]">{item.category}</p>
                            )}
                            <Link
                              href={`/${storeSlug}/products/${item.id}`}
                              onClick={closeWishlist}
                              className="text-sm font-medium text-neutral-900 hover:text-amber-800 transition-colors line-clamp-1 no-underline"
                            >
                              {item.name}
                            </Link>
                          </div>
                          <button
                            onClick={() => removeFromWishlist(item.id)}
                            className="text-neutral-400 hover:text-red-700 p-1 transition-colors"
                            title="Remove from wishlist"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </div>

                        {/* Pricing */}
                        <div className="mt-1 flex items-center gap-2 font-mono text-xs">
                          <span className="font-semibold text-neutral-900">
                            ₹{effectivePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {item.salePrice && (
                            <span className="line-through text-neutral-400 text-[10px]">
                              ₹{item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Bar */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-neutral-100">
                        <button
                          onClick={() => moveToBagFromWishlist(item)}
                          disabled={isOutOfStock}
                          className="flex-1 btn-luxury-primary py-1.5 px-3 text-[10px] flex items-center justify-center gap-1.5"
                        >
                          <ShoppingBagIcon size={12} />
                          <span>{isOutOfStock ? 'Sold Out' : 'Move to Bag'}</span>
                        </button>

                        {cleanPhone && (
                          <a
                            href={waItemInquiry}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 border border-neutral-200 rounded-xs text-neutral-600 hover:border-emerald-600 hover:text-emerald-700 transition-colors"
                            title="Consult WhatsApp concierge"
                          >
                            <WhatsAppIcon size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {wishlist.length > 0 && (
          <div className="p-6 border-t border-neutral-200/80 bg-stone-50/70 space-y-3">
            <button
              onClick={moveAllWishlistToBag}
              className="w-full btn-luxury-gold py-3 text-xs flex items-center justify-center gap-2"
            >
              <ShoppingBagIcon size={14} />
              <span>Move All to Boutique Bag</span>
              <ArrowRightIcon size={14} />
            </button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                onClick={clearWishlist}
                className="text-neutral-400 hover:text-neutral-700 font-mono text-[11px] underline bg-transparent border-none cursor-pointer"
              >
                Clear all saved pieces
              </button>
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                Saved in Your Vault
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

