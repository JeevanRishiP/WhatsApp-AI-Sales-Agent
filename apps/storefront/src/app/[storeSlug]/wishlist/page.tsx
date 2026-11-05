'use client';

import React from 'react';
import Link from 'next/link';
import { useCustomer, WishlistItem } from '@/lib/customer-context';
import {
  HeartIcon,
  ShoppingBagIcon,
  TrashIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from '@/components/icons';

export default function WishlistPage() {
  const {
    wishlist,
    wishlistCount,
    tenantSlug,
    removeFromWishlist,
    moveToBagFromWishlist,
    moveAllWishlistToBag,
    clearWishlist,
  } = useCustomer();

  return (
    <div className="space-y-10 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/${tenantSlug}`}
          className="inline-flex items-center gap-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 transition-colors no-underline"
        >
          <ArrowLeftIcon size={14} />
          <span>Return to Boutique Collection</span>
        </Link>
      </div>

      {/* Header Banner */}
      <section className="border-b border-neutral-200/70 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-amber-800 micro-caps mb-2">
            <HeartIcon size={14} filled />
            <span>Private Client Vault</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-serif text-neutral-900 font-light tracking-tight">
            Curated Wishlist {wishlistCount > 0 && <span className="text-2xl text-neutral-400 font-mono">({wishlistCount})</span>}
          </h1>
          <p className="text-sm text-neutral-500 mt-2 max-w-lg leading-relaxed">
            Your saved handloom sarees, preserved across sessions and accessible to Meera on WhatsApp.
          </p>
        </div>

        {wishlist.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={clearWishlist}
              className="px-4 py-2.5 border border-neutral-200 rounded-xs text-xs font-mono text-neutral-500 hover:text-neutral-900 hover:border-neutral-400 transition-colors bg-transparent cursor-pointer"
            >
              Clear All
            </button>
            <button
              onClick={moveAllWishlistToBag}
              className="btn-luxury-gold py-2.5 px-6 text-xs flex items-center gap-2"
            >
              <ShoppingBagIcon size={14} />
              <span>Move All to Bag</span>
              <ArrowRightIcon size={14} />
            </button>
          </div>
        )}
      </section>

      {/* Wishlist Grid or Empty State */}
      {wishlist.length === 0 ? (
        <div className="py-24 text-center space-y-6 max-w-md mx-auto">
          <div className="w-20 h-20 rounded-full bg-stone-100 border border-neutral-200 flex items-center justify-center mx-auto text-neutral-400">
            <HeartIcon size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="font-serif text-3xl text-neutral-900">Your Wishlist is Empty</h2>
            <p className="text-sm text-neutral-500 leading-relaxed">
              Explore our handcrafted Banarasi, Kanjeevaram, and Chanderi sarees and tap the heart icon on any piece to save it here.
            </p>
          </div>
          <Link
            href={`/${tenantSlug}`}
            className="inline-block btn-luxury-primary text-xs no-underline py-3 px-8"
          >
            Explore Silk Saree Collection
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {wishlist.map((item: WishlistItem) => {
            const effectivePrice = item.salePrice ?? item.price;
            const isOutOfStock = item.availableStock <= 0;

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between border border-neutral-200/80 rounded-xs bg-white p-4 hover:border-neutral-400 transition-colors"
              >
                <div>
                  {/* Image Framing */}
                  <div className="aspect-[3/4] bg-stone-100 overflow-hidden relative rounded-xs">
                    <Link href={`/${tenantSlug}/products/${item.id}`} className="block w-full h-full">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-300 font-serif text-2xl">
                          {item.name.slice(0, 1)}
                        </div>
                      )}
                    </Link>

                    {/* Remove button */}
                    <button
                      onClick={() => removeFromWishlist(item.id)}
                      className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs text-neutral-500 hover:text-red-700 hover:bg-white flex items-center justify-center transition-colors shadow-xs border border-neutral-200/60"
                      title="Remove from wishlist"
                    >
                      <TrashIcon size={14} />
                    </button>

                    {/* Stock badge */}
                    {item.availableStock > 0 && item.availableStock <= 3 && (
                      <div className="absolute top-3 left-3 bg-neutral-900/90 text-white text-[10px] font-mono px-2 py-0.5 uppercase tracking-wider rounded-xs">
                        Only {item.availableStock} left
                      </div>
                    )}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] flex items-center justify-center">
                        <span className="bg-white text-neutral-900 text-xs font-mono uppercase tracking-widest px-3 py-1">
                          Sold Out
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="mt-4 space-y-1">
                    {item.category && (
                      <p className="micro-caps text-neutral-400">{item.category}</p>
                    )}
                    <Link
                      href={`/${tenantSlug}/products/${item.id}`}
                      className="block text-sm font-medium text-neutral-900 hover:text-amber-800 transition-colors no-underline line-clamp-1"
                    >
                      {item.name}
                    </Link>
                    <div className="flex items-center gap-2 pt-1 font-mono text-xs">
                      <span className="font-semibold text-neutral-900">
                        ₹{effectivePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                      {item.salePrice && (
                        <span className="line-through text-neutral-400 text-[11px]">
                          ₹{item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Move to Bag Action */}
                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-2">
                  <button
                    onClick={() => moveToBagFromWishlist(item)}
                    disabled={isOutOfStock}
                    className="flex-1 btn-luxury-primary py-2 text-xs flex items-center justify-center gap-1.5"
                  >
                    <ShoppingBagIcon size={14} />
                    <span>{isOutOfStock ? 'Sold Out' : 'Move to Bag'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
