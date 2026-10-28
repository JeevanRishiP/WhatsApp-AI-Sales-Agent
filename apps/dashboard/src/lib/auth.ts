// ╔═══════════════════════════════════════════════════════════════╗
// ║  Auth Library — Session Management                           ║
// ║                                                               ║
// ║  All tenant identification flows through here.                ║
// ║  The tenantId is NEVER taken from user input — it is          ║
// ║  always extracted from the verified JWT session cookie.       ║
// ╚═══════════════════════════════════════════════════════════════╝

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_COOKIE = 'wcos_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds

// Secret key for JWT signing — must be at least 32 bytes
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || 'wcos-dashboard-secret-change-in-production';
  return new TextEncoder().encode(secret);
}

// ─── Session Payload ──────────────────────────────────────────────

export interface SessionPayload extends JWTPayload {
  tenantId: string;
  tenantName: string;
  email: string;
}

// ─── Create Session ───────────────────────────────────────────────

export async function createSession(payload: {
  tenantId: string;
  tenantName: string;
  email: string;
}): Promise<void> {
  const token = await new SignJWT({
    tenantId: payload.tenantId,
    tenantName: payload.tenantName,
    email: payload.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

// ─── Verify Session ───────────────────────────────────────────────

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.tenantId || typeof payload.tenantId !== 'string') {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

// ─── Get Session (throws if not authenticated) ────────────────────

export async function getSession(): Promise<SessionPayload> {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

// ─── Get Tenant ID (convenience — the most used function) ─────────

export async function getTenantId(): Promise<string> {
  const session = await getSession();
  return session.tenantId;
}

// ─── Destroy Session ──────────────────────────────────────────────

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
