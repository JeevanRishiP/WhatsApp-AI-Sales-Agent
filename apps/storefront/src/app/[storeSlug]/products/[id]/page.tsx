import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon } from '@/components/icons';
import { ProductDetailActions } from '@/components/storefront/product-detail-actions';
import { getStoreTenant, getStoreProductById } from '@/lib/store-service';

export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: { storeSlug: string; id: string };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { storeSlug, id } = params;

  const tenant = await getStoreTenant(storeSlug);
  if (!tenant) notFound();

  const product = await getStoreProductById(tenant.id, id);
  if (!product) notFound();

  const availableStock = product.availableStock;
  const effectivePrice = product.salePrice ? Number(product.salePrice) : Number(product.price);

  const cleanPhone = tenant.whatsappPhoneNumber?.replace(/[^0-9]/g, '');
  const waInquiryUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
        `Hi! I would like to inquire about the ${product.name} [Code: ${product.code}]. Could you share more details?`
      )}`
    : '#';

  const attributes = product.attributes || {};

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div>
        <Link
          href={`/${tenant.slug}`}
          className="inline-flex items-center gap-2 text-xs font-mono text-neutral-500 hover:text-neutral-900 transition-colors no-underline"
        >
          <ArrowLeftIcon size={14} />
          <span>Return to Storefront</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-start">
        {/* Left: Product Photography Gallery */}
        <div className="space-y-4">
          <div className="aspect-[3/4] bg-stone-100 border border-neutral-200/80 rounded-xs overflow-hidden relative">
            {product.imageUrls[0] || product.thumbnailUrl ? (
              <img
                src={product.imageUrls[0] || product.thumbnailUrl || ''}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-neutral-300 font-serif text-2xl">
                <span>{product.name.slice(0, 1)}</span>
                <span className="text-xs font-mono text-neutral-400 mt-2 tracking-widest uppercase">
                  {tenant.name}
                </span>
              </div>
            )}

            {availableStock > 0 && availableStock <= 3 && (
              <div className="absolute top-4 left-4 bg-neutral-900/90 text-white text-[10px] font-mono px-3 py-1 uppercase tracking-wider rounded-xs">
                Only {availableStock} pieces remaining
              </div>
            )}
          </div>

          {/* Additional detail views */}
          {product.imageUrls.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.imageUrls.map((url: string, idx: number) => (
                <div key={idx} className="aspect-square bg-stone-100 border border-neutral-200 rounded-xs overflow-hidden">
                  <img src={url} alt={`Detail ${idx + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Specifications & Order Actions */}
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="micro-caps text-neutral-400">
              {product.subcategory ? `${product.subcategory} • ${product.category}` : product.category} • SKU: {product.code}
            </p>
            <h1 className="text-3xl md:text-4xl font-serif text-neutral-900 font-normal leading-tight">
              {product.name}
            </h1>
            <div className="flex items-center gap-3 pt-2 font-mono text-lg">
              <span className="text-neutral-900 font-medium">
                ₹{effectivePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              {product.salePrice && product.salePrice < product.price && (
                <span className="line-through text-neutral-400 text-sm">
                  ₹{Number(product.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div className="text-sm text-neutral-600 leading-relaxed font-sans border-t border-neutral-200/60 pt-6">
              {product.description}
            </div>
          )}

          {/* Handwoven Textile Specifications */}
          {Object.keys(attributes).length > 0 && (
            <div className="border-t border-b border-neutral-200/60 py-4 space-y-2 text-xs font-mono">
              <p className="micro-caps text-neutral-400 mb-2">Artisan Specifications</p>
              <div className="grid grid-cols-2 gap-y-2 text-neutral-700">
                {attributes['fabric'] && (
                  <div>
                    <span className="text-neutral-400">Fabric: </span>
                    <span>{attributes['fabric']}</span>
                  </div>
                )}
                {attributes['zariType'] && (
                  <div>
                    <span className="text-neutral-400">Zari: </span>
                    <span>{attributes['zariType']}</span>
                  </div>
                )}
                {attributes['primaryColor'] && (
                  <div>
                    <span className="text-neutral-400">Color: </span>
                    <span>{attributes['primaryColor']}</span>
                  </div>
                )}
                {attributes['occasion'] && (
                  <div>
                    <span className="text-neutral-400">Occasion: </span>
                    <span>{attributes['occasion']}</span>
                  </div>
                )}
                {attributes['careInstructions'] && (
                  <div className="col-span-2 text-[11px] text-neutral-500 pt-1">
                    <span className="text-neutral-400">Care: </span>
                    <span>{attributes['careInstructions']}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Client Actions */}
          <ProductDetailActions
            product={{
              id: product.id,
              code: product.code,
              name: product.name,
              category: product.category,
              price: Number(product.price),
              salePrice: product.salePrice ? Number(product.salePrice) : null,
              availableStock,
              imageUrl: product.imageUrls[0] || product.thumbnailUrl || null,
            }}
            waInquiryUrl={waInquiryUrl}
          />

          {/* Concierge Guarantees */}
          <div className="space-y-3 pt-6 text-xs font-mono text-neutral-500">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              <span>WhatsApp Concierge: {tenant.botName} is available to assist with product inquiries</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
              <span>Insured doorstep shipping & real-time tracking</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
              <span>Verified quality guarantee from {tenant.name}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
