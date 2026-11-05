import { NextResponse, type NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { verifyApiKey } from '@/lib/dal/settings';

const SESSION_COOKIE = 'wcos_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'wcos-dashboard-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tenantKey = searchParams.get('key') || 'sk_live_aura_8f92jkl2309x';

  try {
    const tenant = await verifyApiKey(tenantKey);
    if (!tenant) {
      const errorUrl = new URL('/login?error=invalid_key', request.url);
      return NextResponse.redirect(errorUrl);
    }

    // Find Owner staff record
    const { prisma } = await import('@wcos/db');
    const staff = await prisma.staffUser.findFirst({
      where: { tenantId: tenant.id, role: 'OWNER' },
    });

    const token = await new SignJWT({
      tenantId: tenant.id,
      tenantName: tenant.name,
      email: staff?.email || tenant.ownerEmail,
      staffId: staff?.id,
      staffName: staff?.fullName || tenant.ownerName || 'Jeevan Rishi P',
      role: 'OWNER',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE}s`)
      .sign(getSecretKey());

    const redirectPath = searchParams.get('redirect') || '/';
    const redirectUrl = new URL(redirectPath, request.url);
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[demo-login error]', err);
    const errorUrl = new URL(`/login?error=auth_failed&msg=${encodeURIComponent(err.message || 'unknown')}`, request.url);
    return NextResponse.redirect(errorUrl);
  }
}
