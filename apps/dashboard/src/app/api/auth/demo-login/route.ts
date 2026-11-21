import { NextResponse, type NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { verifyApiKey } from '@/lib/dal/settings';

const SESSION_COOKIE = 'wcos_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || process.env.NODE_ENV === 'production') {
    throw new Error('Demo login JWT signing is disabled outside explicit development mode.');
  }
  return new TextEncoder().encode(secret);
}

function sanitizeRelativeRedirect(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/';
  }
  return raw;
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_DEMO_LOGIN !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const tenantKey = searchParams.get('key');
  if (!tenantKey) {
    return NextResponse.redirect(new URL('/login?error=missing_key', request.url));
  }

  try {
    const tenant = await verifyApiKey(tenantKey);
    if (!tenant) {
      return NextResponse.redirect(new URL('/login?error=invalid_key', request.url));
    }

    const { prisma } = await import('@wcos/db');
    const staff = await prisma.staffUser.findFirst({
      where: { tenantId: tenant.id, role: 'OWNER', status: 'ACTIVE' },
    });

    const token = await new SignJWT({
      tenantId: tenant.id,
      tenantName: tenant.name,
      email: staff?.email || tenant.ownerEmail,
      staffId: staff?.id,
      staffName: staff?.fullName || tenant.ownerName || 'Owner',
      role: 'OWNER',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${SESSION_MAX_AGE}s`)
      .sign(getSecretKey());

    const redirectPath = sanitizeRelativeRedirect(searchParams.get('redirect'));
    const redirectUrl = new URL(redirectPath, request.url);
    const response = NextResponse.redirect(redirectUrl);

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    return response;
  } catch (err) {
    console.error('[demo-login error]', err);
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
  }
}
