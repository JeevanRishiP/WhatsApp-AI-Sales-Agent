import { NextRequest, NextResponse } from 'next/server';
import { verifySession, hasRole } from '@/lib/auth';
import { getProduct, updateProductImages } from '@/lib/dal/products';
import { uploadProductMedia, deleteLocalProductMedia } from '@/lib/storage/media-storage';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Product Photos API Route (RBAC + Durable R2/Local Adapter)   ║
// ║  /api/inventory/[id]/photos                                   ║
// ╚═══════════════════════════════════════════════════════════════╝

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAllowedImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/api/media/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const product = await getProduct(session.tenantId, params.id);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  return NextResponse.json({
    imageUrls: product.imageUrls || [],
    thumbnailUrl: product.thumbnailUrl || (product.imageUrls?.[0] ?? null),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!UUID_REGEX.test(params.id)) {
    return NextResponse.json({ error: 'Invalid product ID' }, { status: 400 });
  }

  const product = await getProduct(session.tenantId, params.id);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const contentType = req.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    try {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file || typeof file === 'string' || file.size === 0) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: 'Unsupported format. Allowed: JPG, PNG, WebP, GIF, AVIF' },
          { status: 400 }
        );
      }

      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const uploaded = await uploadProductMedia({
        tenantId: session.tenantId,
        productId: params.id,
        buffer,
        mimeType: file.type,
        originalFilename: file.name,
      });

      const nextUrls = [...(product.imageUrls || []), uploaded.url];
      const updated = await updateProductImages(session.tenantId, params.id, nextUrls);

      return NextResponse.json({
        success: true,
        url: uploaded.url,
        storageProvider: uploaded.storageProvider,
        imageUrls: updated.imageUrls,
        thumbnailUrl: updated.thumbnailUrl,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
    }
  }

  try {
    const body = await req.json();
    const newUrl = typeof body.url === 'string' ? body.url.trim() : '';

    if (!newUrl || !isAllowedImageUrl(newUrl)) {
      return NextResponse.json({ error: 'Valid HTTP(S) or /uploads/ image URL is required' }, { status: 400 });
    }

    const nextUrls = [...(product.imageUrls || []), newUrl];
    const updated = await updateProductImages(session.tenantId, params.id, nextUrls);

    return NextResponse.json({
      success: true,
      url: newUrl,
      imageUrls: updated.imageUrls,
      thumbnailUrl: updated.thumbnailUrl,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request body' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const product = await getProduct(session.tenantId, params.id);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const targetUrl = body.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return NextResponse.json({ error: 'Target image URL required' }, { status: 400 });
  }

  const nextUrls = (product.imageUrls || []).filter((u) => u !== targetUrl);
  const nextThumb = product.thumbnailUrl === targetUrl
    ? (nextUrls[0] || null)
    : (product.thumbnailUrl || nextUrls[0] || null);

  const updated = await updateProductImages(session.tenantId, params.id, nextUrls, nextThumb);

  await deleteLocalProductMedia(session.tenantId, targetUrl);

  return NextResponse.json({
    success: true,
    imageUrls: updated.imageUrls,
    thumbnailUrl: updated.thumbnailUrl,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await verifySession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const product = await getProduct(session.tenantId, params.id);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { action, url, imageUrls } = body;

  if (action === 'set-primary' && typeof url === 'string') {
    if (!isAllowedImageUrl(url)) {
      return NextResponse.json({ error: 'Invalid image URL protocol' }, { status: 400 });
    }
    const remaining = (product.imageUrls || []).filter((u) => u !== url);
    const reordered = [url, ...remaining];
    const updated = await updateProductImages(session.tenantId, params.id, reordered, url);
    return NextResponse.json({
      success: true,
      imageUrls: updated.imageUrls,
      thumbnailUrl: updated.thumbnailUrl,
    });
  }

  if (action === 'reorder' && Array.isArray(imageUrls)) {
    const cleanUrls = imageUrls.filter(
      (u): u is string => typeof u === 'string' && isAllowedImageUrl(u)
    );
    if (cleanUrls.length !== imageUrls.length) {
      return NextResponse.json({ error: 'One or more image URLs are invalid' }, { status: 400 });
    }
    const updated = await updateProductImages(
      session.tenantId,
      params.id,
      cleanUrls,
      cleanUrls[0] || null
    );
    return NextResponse.json({
      success: true,
      imageUrls: updated.imageUrls,
      thumbnailUrl: updated.thumbnailUrl,
    });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
