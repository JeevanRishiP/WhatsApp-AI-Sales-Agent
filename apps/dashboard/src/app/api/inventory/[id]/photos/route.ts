import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getProduct, updateProductImages } from '@/lib/dal/products';
import fs from 'node:fs';
import path from 'node:path';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Product Photos API Route                                     ║
// ║  /api/inventory/[id]/photos                                    ║
// ╚═══════════════════════════════════════════════════════════════╝

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  let session;
  try {
    session = await getSession();
  } catch {
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
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const product = await getProduct(session.tenantId, params.id);
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const contentType = req.headers.get('content-type') || '';

  // 1. Multipart Form Upload (file from device)
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

      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products');
      await fs.promises.mkdir(uploadDir, { recursive: true });

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext) ? ext : 'jpg';
      const uniqueId = Math.random().toString(36).substring(2, 9);
      const filename = `item-${params.id.slice(0, 8)}-${Date.now()}-${uniqueId}.${safeExt}`;
      const filePath = path.join(uploadDir, filename);

      await fs.promises.writeFile(filePath, buffer);

      const publicUrl = `/uploads/products/${filename}`;
      const nextUrls = [...(product.imageUrls || []), publicUrl];
      const updated = await updateProductImages(session.tenantId, params.id, nextUrls);

      return NextResponse.json({
        success: true,
        url: publicUrl,
        imageUrls: updated.imageUrls,
        thumbnailUrl: updated.thumbnailUrl,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
    }
  }

  // 2. JSON Body (URL input)
  try {
    const body = await req.json();
    const newUrl = typeof body.url === 'string' ? body.url.trim() : '';

    if (!newUrl || (!newUrl.startsWith('http') && !newUrl.startsWith('/'))) {
      return NextResponse.json({ error: 'Valid image URL is required' }, { status: 400 });
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
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  if (!targetUrl) {
    return NextResponse.json({ error: 'Target image URL required' }, { status: 400 });
  }

  const nextUrls = (product.imageUrls || []).filter((u) => u !== targetUrl);
  const nextThumb = product.thumbnailUrl === targetUrl
    ? (nextUrls[0] || null)
    : (product.thumbnailUrl || nextUrls[0] || null);

  const updated = await updateProductImages(session.tenantId, params.id, nextUrls, nextThumb);

  if (targetUrl.startsWith('/uploads/products/')) {
    const filename = path.basename(targetUrl);
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'products', filename);
    fs.promises.unlink(filePath).catch(() => {});
  }

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
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  if (action === 'set-primary' && url) {
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
    const updated = await updateProductImages(session.tenantId, params.id, imageUrls, imageUrls[0] || null);
    return NextResponse.json({
      success: true,
      imageUrls: updated.imageUrls,
      thumbnailUrl: updated.thumbnailUrl,
    });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}

