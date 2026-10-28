// ╔═══════════════════════════════════════════════════════════════╗
// ║  Next.js Middleware — Route Protection                        ║
// ║                                                               ║
// ║  Runs on EVERY request. Redirects unauthenticated users      ║
// ║  to /login. This is the first line of defense.                ║
// ╚═══════════════════════════════════════════════════════════════╝

import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE = 'wcos_session';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/api/auth'];

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'wcos-dashboard-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify JWT
  try {
    await jwtVerify(token, getSecretKey());
    return NextResponse.next();
  } catch {
    // Invalid or expired token — clear cookie and redirect
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: [
    // Match all routes except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
