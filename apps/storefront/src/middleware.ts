import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE_URL, ROOT_DOMAIN } from '@/lib/config';

const SAFE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Pass static assets and next internals directly
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Hostname handling for verified custom domains / subdomains
  const rawHost = (request.headers.get('host') || '').toLowerCase();
  const hostname = rawHost.split(':')[0] || '';
  const rootHost = ROOT_DOMAIN.toLowerCase().split(':')[0] || '';

  if (
    hostname &&
    hostname !== rootHost &&
    !hostname.startsWith('localhost') &&
    hostname !== '127.0.0.1'
  ) {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/customer/resolve-domain?host=${encodeURIComponent(hostname)}`,
        { signal: AbortSignal.timeout(1500), cache: 'no-store' }
      );
      if (res.ok) {
        const data = (await res.json()) as { slug?: string };
        if (data.slug && SAFE_SLUG_REGEX.test(data.slug)) {
          return NextResponse.rewrite(new URL(`/${data.slug}${pathname}`, request.url));
        }
      }
    } catch {
      // Fall through cleanly if API domain resolver is unreachable
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
