'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useCustomer } from '@/lib/customer-context';
import { ShoppingBagIcon, WhatsAppIcon, CheckIcon, HeartIcon } from '@/components/icons';

interface ProductCardProps {
  product: {
    id: string;
    code: string;
    name: string;
    category: string | null;
    price: number;
    salePrice: number | null;
    availableStock: number;
    imageUrl: string | null;
  };
  storeSlug: string;
  whatsappNumber?: string | null;
}

export function ProductCard({ product, storeSlug, whatsappNumber }: ProductCardProps) {
  const { addItem, isInWishlist, toggleWishlist } = useCustomer();
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const isWishlisted = isInWishlist(product.id) || isInWishlist(product.code);

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleWishlist({
      id: product.id,
      code: product.code,
      name: product.name,
      category: product.category,
      price: product.price,
      salePrice: product.salePrice,
      availableStock: product.availableStock,
      imageUrl: product.imageUrl,
    });
  };

  const effectivePrice = product.salePrice ?? product.price;

  const handleAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsAdding(true);
    await addItem(product.code, 1, 'web');
    setIsAdding(false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const cleanPhone = whatsappNumber?.replace(/[^0-9]/g, '');
  const waInquiryUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
        `Hello, I would like to inquire about the ${product.name} [Code: ${product.code}]. Is it available?`
      )}`
    : '#';

  return (
    <div className="group flex flex-col justify-between">
      <div>
        {/* Image Framing */}
        <Link
          href={`/${storeSlug}/products/${product.id}`}
          className="block aspect-[3/4] bg-stone-100 border border-neutral-200/80 overflow-hidden relative rounded-xs no-underline"
        >
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-neutral-300 font-serif text-lg">
              <span>{product.name.slice(0, 1)}</span>
              <span className="text-[10px] font-mono tracking-widest mt-1 text-neutral-400">BOUTIQUE</span>
            </div>
          )}

          {/* Low Stock Badge */}
          {product.availableStock > 0 && product.availableStock <= 5 && (
            <div className="absolute top-3 left-3 bg-neutral-900/90 backdrop-blur-xs text-white text-[10px] font-mono px-2 py-0.5 uppercase tracking-wider rounded-xs">
              Only {product.availableStock} crafted
            </div>
          )}

          {/* Floating Wishlist Button */}
          <button
            onClick={handleWishlistToggle}
            aria-label={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
            className={`absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
              isWishlisted
                ? 'bg-amber-900 text-amber-100 shadow-md scale-105'
                : 'bg-white/90 backdrop-blur-md text-neutral-600 hover:bg-white hover:text-amber-800 border border-neutral-200/60'
            }`}
          >
            <HeartIcon size={14} filled={isWishlisted} />
          </button>

          {/* Out of stock */}
          {product.availableStock <= 0 && (
            <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] flex items-center justify-center">
              <span className="bg-white text-neutral-900 text-xs font-mono uppercase tracking-widest px-3 py-1">
                Sold Out
              </span>
            </div>
          )}
        </Link>

        {/* Metadata */}
        <div className="mt-4 space-y-1">
          {product.category && (
            <p className="micro-caps text-neutral-400">{product.category}</p>
          )}
          <Link
            href={`/${storeSlug}/products/${product.id}`}
            className="block text-sm font-medium text-neutral-900 hover:text-amber-800 transition-colors no-underline leading-snug"
          >
            {product.name}
          </Link>
          <div className="flex items-center gap-2 pt-1 font-mono text-xs">
            <span className="font-medium text-neutral-900">
              ₹{effectivePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            {product.salePrice && (
              <span className="line-through text-neutral-400 text-[11px]">
                ₹{product.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-2">
        <button
          onClick={handleAdd}
          disabled={product.availableStock <= 0 || isAdding}
          className="flex-1 btn-luxury-primary py-2 text-[11px] flex items-center justify-center gap-1.5"
        >
          {justAdded ? (
            <>
              <CheckIcon size={12} />
              <span>Added to Bag</span>
            </>
          ) : (
            <>
              <ShoppingBagIcon size={12} />
              <span>{product.availableStock <= 0 ? 'Sold Out' : 'Add to Bag'}</span>
            </>
          )}
        </button>

        {cleanPhone && (
          <a
            href={waInquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Inquire with WhatsApp Sales Concierge"
            className="p-2 border border-neutral-200 rounded-xs text-neutral-600 hover:border-emerald-600 hover:text-emerald-700 transition-colors"
          >
            <WhatsAppIcon size={14} />
          </a>
        )}
      </div>
    </div>
  );
}

