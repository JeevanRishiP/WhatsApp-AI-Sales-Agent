'use client';

import React, { useState } from 'react';
import { useCustomer } from '@/lib/customer-context';
import { ShoppingBagIcon, WhatsAppIcon, PlusIcon, MinusIcon, CheckIcon, HeartIcon } from '@/components/icons';

interface ProductDetailActionsProps {
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
  waInquiryUrl: string;
}

export function ProductDetailActions({
  product,
  waInquiryUrl,
}: ProductDetailActionsProps) {
  const { addItem, isInWishlist, toggleWishlist } = useCustomer();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  const isWishlisted = isInWishlist(product.id) || isInWishlist(product.code);

  const handleAdd = async () => {
    setIsAdding(true);
    await addItem(product.code, quantity, 'web');
    setIsAdding(false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const handleWishlistToggle = () => {
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

  if (product.availableStock <= 0) {
    return (
      <div className="space-y-4">
        <div className="p-3 bg-stone-100 text-neutral-600 font-mono text-xs text-center border border-neutral-200">
          This heritage piece is currently unavailable in the boutique.
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleWishlistToggle}
            className="flex-1 btn-luxury-secondary py-3.5 flex items-center justify-center gap-2 text-xs"
          >
            <HeartIcon size={16} filled={isWishlisted} className={isWishlisted ? 'text-amber-800' : ''} />
            <span>{isWishlisted ? 'Saved in Wishlist' : 'Save to Wishlist'}</span>
          </button>
          <a
            href={waInquiryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 btn-luxury-secondary py-3.5 flex items-center justify-center gap-2 no-underline text-xs"
          >
            <WhatsAppIcon size={16} className="text-emerald-700" />
            <span>Notify Me on WhatsApp</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quantity Stepper */}
      <div className="flex items-center gap-4">
        <span className="text-xs font-mono text-neutral-500 uppercase tracking-wider">Quantity:</span>
        <div className="flex items-center border border-neutral-300 rounded-xs">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <MinusIcon size={12} />
          </button>
          <span className="px-4 text-xs font-mono font-medium text-neutral-900">{quantity}</span>
          <button
            onClick={() => setQuantity(Math.min(product.availableStock, quantity + 1))}
            className="p-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <PlusIcon size={12} />
          </button>
        </div>
      </div>

      {/* Primary Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
        <button
          onClick={handleAdd}
          disabled={isAdding}
          className="w-full sm:flex-1 btn-luxury-primary py-3.5 flex items-center justify-center gap-2"
        >
          {justAdded ? (
            <>
              <CheckIcon size={16} />
              <span>Added to Your Boutique Bag</span>
            </>
          ) : (
            <>
              <ShoppingBagIcon size={16} />
              <span>Add to Boutique Bag</span>
            </>
          )}
        </button>

        {/* Wishlist Button */}
        <button
          onClick={handleWishlistToggle}
          title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          className={`w-full sm:w-auto p-3.5 border rounded-xs transition-colors flex items-center justify-center gap-2 text-xs font-mono uppercase tracking-wider cursor-pointer ${
            isWishlisted
              ? 'border-amber-800 bg-amber-50 text-amber-900'
              : 'border-neutral-300 hover:border-neutral-900 text-neutral-800'
          }`}
        >
          <HeartIcon size={16} filled={isWishlisted} className={isWishlisted ? 'text-amber-800' : 'text-neutral-600'} />
          <span className="sm:hidden">{isWishlisted ? 'Wishlisted' : 'Wishlist'}</span>
        </button>

        <a
          href={waInquiryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full sm:w-auto btn-luxury-secondary py-3.5 px-6 flex items-center justify-center gap-2 no-underline text-xs"
        >
          <WhatsAppIcon size={16} className="text-emerald-700" />
          <span>Inquire on WhatsApp</span>
        </a>
      </div>
    </div>
  );
}

