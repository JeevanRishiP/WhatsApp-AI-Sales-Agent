import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Direct Media Streaming Route Handler                         ║
// ║  GET /api/media/products/[filename]                           ║
// ║  Reliably streams uploaded product images from disk           ║
// ╚═══════════════════════════════════════════════════════════════╝

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  if (!params.path || params.path.length === 0) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  const baseDir = path.resolve(process.cwd(), 'public', 'uploads');
  const filePath = path.resolve(baseDir, ...params.path);

  // Security: prevent path traversal attacks
  if (!filePath.startsWith(baseDir)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return new NextResponse('Image Not Found', { status: 404 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const fileStat = fs.statSync(filePath);
  const fileStream = fs.createReadStream(filePath);

  return new NextResponse(fileStream as any, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileStat.size.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

