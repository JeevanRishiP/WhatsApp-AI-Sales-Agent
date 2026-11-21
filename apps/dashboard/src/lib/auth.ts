// ╔═══════════════════════════════════════════════════════════════╗
// ║  Auth Library — Session & RBAC Management                    ║
// ║                                                               ║
// ║  All tenant identification flows through here.                ║
// ║  The tenantId is NEVER taken from user input — it is          ║
// ║  always extracted from the verified JWT session cookie.       ║
// ╚═══════════════════════════════════════════════════════════════╝

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@wcos/db';

const SESSION_COOKIE = 'wcos_session';
const SESSION_MAX_AGE = 60 * 60 * 24; // 24 hours in seconds
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Secret key for JWT signing — fail closed in production
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32 || secret === 'wcos-dashboard-secret-change-in-production') {
      throw new Error('FATAL: JWT_SECRET must be set to a strong secret (>= 32 chars) in production.');
    }
  }
  return new TextEncoder().encode(secret || 'wcos-dashboard-dev-only-secret-change-me');
}

export type StaffRole = 'OWNER' | 'STORE_MANAGER' | 'FULFILLMENT_LEAD' | 'SUPPORT_CONCIERGE';

export interface SessionPayload extends JWTPayload {
  tenantId: string;
  tenantName: string;
  email: string;
  staffId?: string;
  staffName?: string;
  role: StaffRole;
  avatarUrl?: string;
}

export function hasRole(session: SessionPayload, allowedRoles: readonly StaffRole[]): boolean {
  return allowedRoles.includes(session.role);
}

export async function createSession(payload: {
  tenantId: string;
  tenantName: string;
  email: string;
  staffId?: string;
  staffName?: string;
  role?: StaffRole;
  avatarUrl?: string;
}): Promise<void> {
  const token = await new SignJWT({
    tenantId: payload.tenantId,
    tenantName: payload.tenantName,
    email: payload.email,
    staffId: payload.staffId,
    staffName: payload.staffName || 'Owner',
    role: payload.role || 'OWNER',
    avatarUrl: payload.avatarUrl,
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

export async function verifySession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      !payload.tenantId ||
      typeof payload.tenantId !== 'string' ||
      !UUID_REGEX.test(payload.tenantId)
    ) {
      return null;
    }

    // Verify tenant is still ACTIVE in database
    const tenant = await prisma.tenant.findUnique({
      where: { id: payload.tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!tenant || (tenant.status !== 'ACTIVE' && tenant.status !== 'ONBOARDING')) {
      return null;
    }

    let resolvedRole: StaffRole = (payload.role as StaffRole) || 'SUPPORT_CONCIERGE';
    let resolvedStaffName = typeof payload.staffName === 'string' ? payload.staffName : undefined;

    // If session belongs to a StaffUser, verify active status and authoritative role from DB
    if (typeof payload.staffId === 'string' && payload.staffId) {
      if (!UUID_REGEX.test(payload.staffId)) {
        return null;
      }
      const staff = await prisma.staffUser.findFirst({
        where: {
          id: payload.staffId,
          tenantId: tenant.id,
          status: 'ACTIVE',
        },
        select: { id: true, role: true, fullName: true },
      });
      if (!staff) {
        return null;
      }
      resolvedRole = staff.role as StaffRole;
      resolvedStaffName = staff.fullName;
    } else if (payload.role && payload.role !== 'OWNER') {
      // Sessions without a staffId are only valid as OWNER sessions
      return null;
    }

    return {
      ...(payload as SessionPayload),
      tenantId: tenant.id,
      tenantName: tenant.name,
      role: resolvedRole,
      staffName: resolvedStaffName,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload> {
  const session = await verifySession();
  if (!session) {
    redirect('/login');
  }
  return session;
}

export async function requireRole(allowedRoles: readonly StaffRole[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!allowedRoles.includes(session.role)) {
    throw new Error('Access denied: Insufficient role permissions');
  }
  return session;
}

export async function getTenantId(): Promise<string> {
  const session = await getSession();
  return session.tenantId;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
