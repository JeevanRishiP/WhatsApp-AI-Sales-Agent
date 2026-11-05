import { NextResponse, type NextRequest } from 'next/server';
import { ROOT_DOMAIN } from '@/lib/config';

export function middleware(request: NextRequest) {
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

  // Hostname handling for custom domains / subdomains
  const hostname = request.headers.get('host') || '';
  const currentHost = ROOT_DOMAIN;

  // If custom domain is used (e.g. boutique.com instead of localhost:3005)
  if (hostname && !hostname.includes(currentHost) && !hostname.startsWith('localhost')) {
    const subdomain = hostname.split('.')[0];
    if (subdomain && subdomain !== 'www') {
      return NextResponse.rewrite(new URL(`/${subdomain}${pathname}`, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
