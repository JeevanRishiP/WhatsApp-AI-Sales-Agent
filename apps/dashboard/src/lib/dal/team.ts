import { prisma, type StaffRole, type StaffStatus } from '@wcos/db';

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
 * List all staff members for a tenant with activity counts.
 */
export async function listTeamMembers(tenantId: string): Promise<TeamMember[]> {
  const staff = await prisma.staffUser.findMany({
    where: { tenantId },
    orderBy: [
      { role: 'asc' },
      { createdAt: 'asc' },
    ],
    include: {
      _count: {
        select: {
          revisions: true,
          notes: true,
          assignedOrders: true,
        },
      },
    },
  });

  return staff as any;
}

/**
 * Create/invite a new staff member.
 */
export async function createTeamMember(params: {
  tenantId: string;
  fullName: string;
  email: string;
  phone?: string;
  role: StaffRole;
  avatarUrl?: string;
}) {
  return prisma.staffUser.create({
    data: {
      tenantId: params.tenantId,
      fullName: params.fullName,
      email: params.email.toLowerCase().trim(),
      phone: params.phone,
      passwordHash: '$2a$10$demoDefaultPasswordHashForStaff2026',
      role: params.role,
      status: 'ACTIVE',
      avatarUrl: params.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    },
  });
}

/**
 * Update a staff member's role.
 */
export async function updateStaffRole(tenantId: string, staffId: string, role: StaffRole) {
  return prisma.staffUser.update({
    where: { id: staffId, tenantId },
    data: { role },
  });
}

/**
 * Update staff active/suspended status.
 */
export async function updateStaffStatus(tenantId: string, staffId: string, status: StaffStatus) {
  return prisma.staffUser.update({
    where: { id: staffId, tenantId },
    data: { status },
  });
}

