'use client';

import React from 'react';
import Link from 'next/link';
import { useCustomer } from '@/lib/customer-context';
import { XIcon, PlusIcon, MinusIcon, ShoppingBagIcon, WhatsAppIcon, ArrowRightIcon } from '@/components/icons';

export function CartDrawer() {
  const {
    isCartOpen,
    closeCart,
    dualCart,
    activeCartTab,
    setActiveCartTab,
    updateQuantity,
    removeItem,
    mergeCarts,
    tenantSlug,
    isAuthenticated,
    openAuthModal,
  } = useCustomer();

  if (!isCartOpen) return null;

  const currentCart = activeCartTab === 'wa' ? dualCart.waCart : dualCart.webCart;
  const otherCart = activeCartTab === 'wa' ? dualCart.webCart : dualCart.waCart;

  return (
    <>
      {/* Backdrop */}
      <div className="drawer-overlay" onClick={closeCart} />

      {/* Slide-over Content */}
      <div className="drawer-content">
        {/* Header */}
        <div className="p-6 hairline-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBagIcon size={18} />
            <h2 className="text-lg font-serif tracking-tight text-neutral-900">Your Selection</h2>
          </div>
          <button
            onClick={closeCart}
            className="text-neutral-400 hover:text-neutral-900 transition-colors p-1"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Dual-Cart Segmented Switcher */}
        <div className="p-4 bg-stone-100 hairline-b flex items-center justify-between">
          <div className="segmented-control w-full flex">
            <button
              onClick={() => setActiveCartTab('web')}
              className={`segmented-tab flex-1 flex items-center justify-center gap-2 ${
                activeCartTab === 'web' ? 'active' : ''
              }`}
            >
              <span>Web Boutique</span>
              <span className="text-[10px] bg-neutral-200 px-1.5 py-0.2 rounded-full">
                {dualCart.webCart.itemCount}
              </span>
            </button>
            <button
              onClick={() => setActiveCartTab('wa')}
              className={`segmented-tab flex-1 flex items-center justify-center gap-2 ${
                activeCartTab === 'wa' ? 'active' : ''
              }`}
            >
              <WhatsAppIcon size={12} />
              <span>WhatsApp Concierge</span>
              <span className="text-[10px] bg-neutral-200 px-1.5 py-0.2 rounded-full">
                {dualCart.waCart.itemCount}
              </span>
            </button>
          </div>
        </div>

        {/* Channel Note Banner */}
        <div className="px-6 py-2.5 bg-stone-50 hairline-b text-xs text-neutral-500 font-mono">
          {activeCartTab === 'wa' ? (
            <p className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
              Items discussed and reserved through your WhatsApp AI Concierge.
            </p>
          ) : (
            <p className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-700 inline-block" />
              Curated items selected while exploring the online boutique.
            </p>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-6 divide-y divide-neutral-200/60">
          {currentCart.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-neutral-400 py-16">
              <ShoppingBagIcon size={36} strokeWidth={1} className="mb-4 text-neutral-300" />
              <p className="font-serif text-lg text-neutral-600">Your bag is currently empty</p>
              <p className="text-xs font-mono mt-1 text-neutral-400">
                Explore the collection to add bespoke pieces.
              </p>
            </div>
          ) : (
            currentCart.items.map((item) => (
              <div key={item.productCode} className="py-4 flex gap-4 first:pt-0 last:pb-0">
                {/* Thumbnail */}
                <div className="w-20 h-24 bg-stone-100 border border-neutral-200 flex-shrink-0 overflow-hidden relative rounded-xs">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-300 text-xs font-mono">
                      PIECE
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm font-medium text-neutral-900 leading-snug">
                        {item.productName}
                      </h3>
                      <button
                        onClick={() => removeItem(item.productCode, activeCartTab)}
                        className="text-neutral-400 hover:text-neutral-900 transition-colors ml-2"
                        title="Remove item"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                    <p className="text-[11px] font-mono text-neutral-400 mt-0.5">SKU: {item.productCode}</p>
                    <div className="mt-1">
                      <span className="inline-block text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 bg-stone-100 text-neutral-600 rounded-xs">
                        {item.source === 'whatsapp' ? 'WhatsApp Concierge' : 'Web Boutique'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    {/* Quantity Stepper */}
                    <div className="flex items-center border border-neutral-200 rounded-xs">
                      <button
                        onClick={() => updateQuantity(item.productCode, item.quantity - 1, activeCartTab)}
                        className="p-1.5 text-neutral-500 hover:text-neutral-900 transition-colors"
                      >
                        <MinusIcon size={12} />
                      </button>
                      <span className="px-2.5 text-xs font-mono text-neutral-800">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productCode, item.quantity + 1, activeCartTab)}
                        className="p-1.5 text-neutral-500 hover:text-neutral-900 transition-colors"
                      >
                        <PlusIcon size={12} />
                      </button>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <span className="text-xs font-mono font-medium text-neutral-900">
                        ₹{(item.priceAtAdd * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        {currentCart.items.length > 0 && (
          <div className="p-6 hairline-t bg-stone-50/80 space-y-4">
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>₹{currentCart.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>White-Glove Shipping</span>
                <span>COMPLIMENTARY</span>
              </div>
              <div className="flex justify-between text-sm font-medium text-neutral-900 pt-2 hairline-t">
                <span>Total</span>
                <span>₹{currentCart.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Combine Carts option if other cart has items */}
            {otherCart.items.length > 0 && (
              <button
                type="button"
                onClick={mergeCarts}
                className="w-full btn-luxury-secondary py-2.5 text-xs flex items-center justify-center gap-2"
              >
                <span>Combine Both Carts ({dualCart.totalItemCount} Pieces)</span>
              </button>
            )}

            {/* Primary Checkout Button */}
            {isAuthenticated ? (
              <Link
                href={`/${tenantSlug}/checkout?channel=${activeCartTab}`}
                onClick={closeCart}
                className="w-full btn-luxury-primary py-3 flex items-center justify-center gap-2 no-underline"
              >
                <span>Proceed to Checkout</span>
                <ArrowRightIcon size={14} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  closeCart();
                  openAuthModal();
                }}
                className="w-full btn-luxury-primary py-3 flex items-center justify-center gap-2"
              >
                <WhatsAppIcon size={16} />
                <span>Sign In via WhatsApp to Checkout</span>
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

