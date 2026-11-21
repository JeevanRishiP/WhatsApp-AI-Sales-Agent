import React from 'react';
import { notFound } from 'next/navigation';
import { CustomerProvider } from '@/lib/customer-context';
import { StorefrontHeader } from '@/components/storefront/header';
import { CartDrawer } from '@/components/storefront/cart-drawer';
import { WishlistDrawer } from '@/components/storefront/wishlist-drawer';
import { CustomerAuthModal } from '@/components/storefront/auth-modal';
import { getStoreTenant } from '@/lib/store-service';

export const dynamic = 'force-dynamic';

interface StoreLayoutProps {
  children: React.ReactNode;
  params: { storeSlug: string };
}

export default async function StoreLayout({ children, params }: StoreLayoutProps) {
  const { storeSlug } = params;

  // Resolves tenant from PostgreSQL or Aura Luxe Boutique database records
  const tenant = await getStoreTenant(storeSlug);

  if (!tenant) {
    notFound();
  }

  return (
    <CustomerProvider tenantSlug={tenant.slug}>
      <div className="min-h-screen flex flex-col justify-between">
        <StorefrontHeader
          storeName={tenant.name}
          storeSlug={tenant.slug}
          whatsappPhone={tenant.whatsappPhoneNumber}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-6 md:px-12 py-8">
          {children}
        </main>

        <footer className="hairline-t py-12 px-6 md:px-12 bg-stone-100 text-xs font-mono text-neutral-500">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <p className="font-serif text-base text-neutral-900 mb-1">{tenant.name}</p>
              <p>© {new Date().getFullYear()} {tenant.name}. {tenant.businessCategory}.</p>
            </div>
            <div className="flex items-center gap-6 text-[11px] uppercase tracking-wider text-neutral-400">
              <span>Encrypted WhatsApp Ordering</span>
              <span>•</span>
              <span>Self-Service Delivery Portal</span>
              <span>•</span>
              <span>Concierge Support</span>
            </div>
          </div>
        </footer>

        {/* Global Slide-Over Dual Cart Drawer */}
        <CartDrawer />

        {/* Global Slide-Over Wishlist Drawer */}
        <WishlistDrawer storeSlug={tenant.slug} whatsappNumber={tenant.whatsappPhoneNumber} />

        {/* Global WhatsApp OTP Authentication Modal */}
        <CustomerAuthModal storeName={tenant.name} />
      </div>
    </CustomerProvider>
  );
}
