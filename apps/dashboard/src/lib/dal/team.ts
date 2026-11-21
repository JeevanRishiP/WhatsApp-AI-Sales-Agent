import crypto from 'node:crypto';
import { hash } from 'bcryptjs';
import { prisma, type StaffRole, type StaffStatus } from '@wcos/db';

const BCRYPT_ROUNDS = 12;

export interface TeamMember {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  status: StaffStatus;
  avatarUrl: string | null;
  lastLoginAt: Date | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  _count?: {
    revisions: number;
    notes: number;
    assignedOrders: number;
  };
}

/**
 * List all staff members for a tenant with activity counts (explicitly omits passwordHash).
 */
export async function listTeamMembers(tenantId: string): Promise<TeamMember[]> {
  const staff = await prisma.staffUser.findMany({
    where: { tenantId },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      tenantId: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      avatarUrl: true,
      lastLoginAt: true,
      lastActiveAt: true,
      createdAt: true,
      _count: {
        select: {
          revisions: true,
          notes: true,
          assignedOrders: true,
        },
      },
    },
  });

  return staff;
}

/**
 * Create/invite a new staff member with a real bcrypt password hash.
 */
export async function createTeamMember(params: {
  tenantId: string;
  fullName: string;
  email: string;
  phone?: string;
  role: StaffRole;
  password?: string;
  avatarUrl?: string;
}): Promise<{ member: TeamMember; temporaryPassword: string }> {
  const temporaryPassword =
    params.password && params.password.length >= 8
      ? params.password
      : crypto.randomBytes(12).toString('base64url');
  const passwordHash = await hash(temporaryPassword, BCRYPT_ROUNDS);

  const member = await prisma.staffUser.create({
    data: {
      tenantId: params.tenantId,
      fullName: params.fullName.trim(),
      email: params.email.toLowerCase().trim(),
      phone: params.phone?.trim() || null,
      passwordHash,
      role: params.role,
      status: 'ACTIVE',
      avatarUrl: params.avatarUrl || null,
    },
    select: {
      id: true,
      tenantId: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      avatarUrl: true,
      lastLoginAt: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });

  return { member, temporaryPassword };
}

/**
 * Update a staff member's role (strictly scoped to tenantId).
 */
export async function updateStaffRole(tenantId: string, staffId: string, role: StaffRole) {
  return prisma.staffUser.update({
    where: { id: staffId, tenantId },
    data: { role },
    select: { id: true, fullName: true, role: true },
  });
}

/**
 * Update staff active/suspended status (strictly scoped to tenantId).
 */
export async function updateStaffStatus(tenantId: string, staffId: string, status: StaffStatus) {
  return prisma.staffUser.update({
    where: { id: staffId, tenantId },
    data: { status },
    select: { id: true, fullName: true, status: true },
  });
}
