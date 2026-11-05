'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { CustomerProfile, DualCart, Cart } from '@wcos/types';
import { API_BASE_URL } from '@/lib/config';

export interface WishlistItem {
  id: string;
  code: string;
  name: string;
  category: string | null;
  price: number;
  salePrice: number | null;
  availableStock: number;
  imageUrl: string | null;
  addedAt: string;
}

interface CustomerContextType {
  customer: CustomerProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  dualCart: DualCart;
  isCartOpen: boolean;
  activeCartTab: 'wa' | 'web';
  isAuthModalOpen: boolean;
  tenantSlug: string;
  wishlist: WishlistItem[];
  wishlistCount: number;
  isWishlistOpen: boolean;
  openCart: (tab?: 'wa' | 'web') => void;
  closeCart: () => void;
  openWishlist: () => void;
  closeWishlist: () => void;
  toggleWishlist: (product: Omit<WishlistItem, 'addedAt'>) => void;
  isInWishlist: (productIdOrCode: string) => boolean;
  removeFromWishlist: (productIdOrCode: string) => void;
  moveToBagFromWishlist: (item: WishlistItem) => Promise<void>;
  moveAllWishlistToBag: () => Promise<void>;
  clearWishlist: () => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  setActiveCartTab: (tab: 'wa' | 'web') => void;
  refreshCustomer: () => Promise<void>;
  refreshCart: () => Promise<void>;
  addItem: (productCode: string, quantity?: number, channel?: 'wa' | 'web') => Promise<void>;
  updateQuantity: (productCode: string, quantity: number, channel?: 'wa' | 'web') => Promise<void>;
  removeItem: (productCode: string, channel?: 'wa' | 'web') => Promise<void>;
  mergeCarts: () => Promise<void>;
  logout: () => Promise<void>;
}

const emptyCart = (channel: 'wa' | 'web'): Cart => ({
  id: '',
  tenantId: '',
  customerPhone: '',
  channel,
  items: [],
  subtotal: 0,
  currency: 'INR',
  itemCount: 0,
  createdAt: new Date(),
  lastActivityAt: new Date(),
  expiresAt: new Date(),
});

const defaultDualCart: DualCart = {
  waCart: emptyCart('wa'),
  webCart: emptyCart('web'),
  totalItemCount: 0,
  combinedSubtotal: 0,
};

const CustomerContext = createContext<CustomerContextType | undefined>(undefined);

export function CustomerProvider({
  children,
  tenantSlug,
}: {
  children: React.ReactNode;
  tenantSlug: string;
}) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dualCart, setDualCart] = useState<DualCart>(defaultDualCart);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [activeCartTab, setActiveCartTab] = useState<'wa' | 'web'>('web');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  // Load wishlist from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`wcos_wishlist_${tenantSlug}`);
      if (stored) {
        setWishlist(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Could not load wishlist from storage:', e);
    }
  }, [tenantSlug]);

  const saveWishlist = useCallback((items: WishlistItem[]) => {
    setWishlist(items);
    try {
      localStorage.setItem(`wcos_wishlist_${tenantSlug}`, JSON.stringify(items));
    } catch (e) {
      console.warn('Could not save wishlist to storage:', e);
    }
  }, [tenantSlug]);

  const toggleWishlist = (product: Omit<WishlistItem, 'addedAt'>) => {
    const exists = wishlist.some(i => i.id === product.id || i.code === product.code);
    if (exists) {
      saveWishlist(wishlist.filter(i => i.id !== product.id && i.code !== product.code));
    } else {
      saveWishlist([...wishlist, { ...product, addedAt: new Date().toISOString() }]);
    }
  };

  const isInWishlist = (productIdOrCode: string) => {
    return wishlist.some(i => i.id === productIdOrCode || i.code === productIdOrCode);
  };

  const removeFromWishlist = (productIdOrCode: string) => {
    saveWishlist(wishlist.filter(i => i.id !== productIdOrCode && i.code !== productIdOrCode));
  };

  const clearWishlist = () => {
    saveWishlist([]);
  };

  const moveToBagFromWishlist = async (item: WishlistItem) => {
    await addItem(item.code, 1, 'web');
    removeFromWishlist(item.id);
  };

  const moveAllWishlistToBag = async () => {
    for (const item of wishlist) {
      if (item.availableStock > 0) {
        await addItem(item.code, 1, 'web');
      }
    }
    clearWishlist();
    openCart('web');
  };

  const openWishlist = () => setIsWishlistOpen(true);
  const closeWishlist = () => setIsWishlistOpen(false);

  const apiBase = API_BASE_URL;

  const getAuthHeaders = useCallback((extra: Record<string, string> = {}): Record<string, string> => {
    const headers: Record<string, string> = {
      'x-tenant-slug': tenantSlug,
      ...extra,
    };
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('wcos_customer_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return headers;
  }, [tenantSlug]);

  // Fetch current authenticated customer
  const refreshCustomer = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/customer/auth/me`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setCustomer(data.customer);
      } else {
        setCustomer(null);
      }
    } catch {
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, getAuthHeaders]);

  // Fetch dual cart (WhatsApp and Web carts)
  const refreshCart = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/customer/cart?tenantSlug=${tenantSlug}`, {
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setDualCart({
          waCart: data.waCart || emptyCart('wa'),
          webCart: data.webCart || emptyCart('web'),
          totalItemCount: data.totalItemCount || 0,
          combinedSubtotal: data.combinedSubtotal || 0,
        });
      }
    } catch (err) {
      console.warn('Failed to load cart:', err);
    }
  }, [apiBase, tenantSlug, getAuthHeaders]);

  useEffect(() => {
    refreshCustomer();
    refreshCart();
  }, [refreshCustomer, refreshCart]);

  const openCart = (tab?: 'wa' | 'web') => {
    if (tab) setActiveCartTab(tab);
    setIsCartOpen(true);
  };

  const closeCart = () => setIsCartOpen(false);
  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const addItem = async (productCode: string, quantity = 1, channel: 'wa' | 'web' = 'web') => {
    try {
      const res = await fetch(`${apiBase}/api/v1/customer/cart/item`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          tenantSlug,
          productCode,
          quantity,
          channel,
        }),
      });
      if (res.ok) {
        await refreshCart();
        openCart(channel);
      }
    } catch (err) {
      console.error('Error adding to cart:', err);
    }
  };

  const updateQuantity = async (productCode: string, quantity: number, channel: 'wa' | 'web' = 'web') => {
    try {
      const res = await fetch(`${apiBase}/api/v1/customer/cart/item`, {
        method: 'PATCH',
        credentials: 'include',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          tenantSlug,
          productCode,
          quantity,
          channel,
        }),
      });
      if (res.ok) {
        await refreshCart();
      }
    } catch (err) {
      console.error('Error updating quantity:', err);
    }
  };

  const removeItem = async (productCode: string, channel: 'wa' | 'web' = 'web') => {
    try {
      const res = await fetch(
        `${apiBase}/api/v1/customer/cart/item/${productCode}?tenantSlug=${tenantSlug}&channel=${channel}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: getAuthHeaders(),
        }
      );
      if (res.ok) {
        await refreshCart();
      }
    } catch (err) {
      console.error('Error removing item:', err);
    }
  };

  const mergeCarts = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/customer/cart/merge`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          tenantSlug,
          sourceChannel: 'wa',
          targetChannel: 'web',
        }),
      });
      if (res.ok) {
        await refreshCart();
        setActiveCartTab('web');
      }
    } catch (err) {
      console.error('Error merging carts:', err);
    }
  };

  const logout = async () => {
    try {
      await fetch(`${apiBase}/api/v1/customer/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
      });
      if (typeof window !== 'undefined') {
        localStorage.removeItem('wcos_customer_token');
      }
      setCustomer(null);
      await refreshCart();
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  return (
    <CustomerContext.Provider
      value={{
        customer,
        isAuthenticated: Boolean(customer),
        isLoading,
        dualCart,
        isCartOpen,
        activeCartTab,
        isAuthModalOpen,
        tenantSlug,
        wishlist,
        wishlistCount: wishlist.length,
        isWishlistOpen,
        openCart,
        closeCart,
        openWishlist,
        closeWishlist,
        toggleWishlist,
        isInWishlist,
        removeFromWishlist,
        moveToBagFromWishlist,
        moveAllWishlistToBag,
        clearWishlist,
        openAuthModal,
        closeAuthModal,
        setActiveCartTab,
        refreshCustomer,
        refreshCart,
        addItem,
        updateQuantity,
        removeItem,
        mergeCarts,
        logout,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const context = useContext(CustomerContext);
  if (!context) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return context;
}
