import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Direct Media Streaming Route Handler                         ║
// ║  GET /api/media/products/[filename]                           ║
// ║  Hardened against prefix-sibling traversal & SVG XSS          ║
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

  // Enforce strict directory boundary with path.sep to prevent sibling-prefix bypass
  if (!filePath.startsWith(baseDir + path.sep)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': fileStat.size.toString(),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };

  // Sandbox SVGs to mitigate stored XSS execution if an SVG ever exists on disk
  if (ext === '.svg') {
    headers['Content-Security-Policy'] = "default-src 'none'; sandbox";
  }

  return new NextResponse(fileStream as any, { headers });
}
