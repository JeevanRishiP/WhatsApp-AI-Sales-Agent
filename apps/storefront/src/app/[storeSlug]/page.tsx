import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/storefront/product-card';
import { getStoreTenant, getStoreProducts } from '@/lib/store-service';

export const dynamic = 'force-dynamic';

interface StorefrontPageProps {
  params: { storeSlug: string };
  searchParams: { category?: string; search?: string };
}

export default async function StorefrontPage({ params, searchParams }: StorefrontPageProps) {
  const { storeSlug } = params;
  const { category, search } = searchParams;

  const tenant = await getStoreTenant(storeSlug);
  if (!tenant) notFound();

  const { products, categories } = await getStoreProducts(tenant.id, category, search);

  return (
    <div className="space-y-12">
      {/* Editorial Hero Header for Aura Luxe Boutique */}
      <section className="text-center py-12 md:py-16 border-b border-neutral-200/60 max-w-3xl mx-auto">
        <p className="micro-caps text-neutral-400 mb-3 tracking-widest">
          {tenant.name} • {tenant.businessCategory}
        </p>
        <h1 className="text-4xl md:text-5xl font-serif font-light text-neutral-900 tracking-tight leading-tight">
          Handcrafted Heritage & Pure Silk Sarees
        </h1>
        <p className="text-sm text-neutral-600 mt-4 font-normal max-w-xl mx-auto leading-relaxed">
          Discover our curated collection of authentic Banarasi, Kanjeevaram, and Chanderi silks. Order online or consult Meera, your personal styling concierge, directly on WhatsApp.
        </p>
      </section>

      {/* Saree Weave Categories & Filter Controls */}
      <section className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-neutral-200/60">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${tenant.slug}`}
            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-xs border transition-colors ${
              !category || category === 'all'
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-400 bg-transparent'
            }`}
          >
            All Sarees ({products.length})
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`/${tenant.slug}?category=${encodeURIComponent(cat)}`}
              className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider rounded-xs border transition-colors ${
                category?.toLowerCase() === cat.toLowerCase()
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'border-neutral-200 text-neutral-600 hover:border-neutral-400 bg-transparent'
              }`}
            >
              {cat}
            </Link>
          ))}
        </div>

        <p className="text-xs font-mono text-neutral-400">
          Showing {products.length} Curated Saree{products.length === 1 ? '' : 's'}
        </p>
      </section>

      {/* Saree Lookbook Grid */}
      <section>
        {products.length === 0 ? (
          <div className="py-24 text-center">
            <p className="font-serif text-2xl text-neutral-500">No sarees available in this weave</p>
            <p className="text-xs font-mono text-neutral-400 mt-2">
              Please choose another weave or consult Meera on WhatsApp.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 md:gap-10">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={{
                  id: product.id,
                  code: product.code,
                  name: product.name,
                  category: product.subcategory || product.category,
                  price: product.price,
                  salePrice: product.salePrice,
                  availableStock: product.availableStock,
                  imageUrl: product.thumbnailUrl,
                }}
                storeSlug={tenant.slug}
                whatsappNumber={tenant.whatsappPhoneNumber}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
