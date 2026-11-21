'use server';

import { revalidatePath } from 'next/cache';
import { getSession, createSession, type StaffRole } from '@/lib/auth';
import { createTeamMember, updateStaffRole, updateStaffStatus } from '@/lib/dal/team';
import { prisma, type StaffStatus } from '@wcos/db';
import { z } from 'zod';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TeamActionState {
  error?: string;
  success?: boolean;
  message?: string;
  temporaryPassword?: string;
}

const InviteMemberSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(100),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  role: z.enum(['STORE_MANAGER', 'FULFILLMENT_LEAD', 'SUPPORT_CONCIERGE']),
  password: z.string().min(8).max(128).optional(),
});

export async function inviteTeamMemberAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const session = await getSession();

  if (session.role !== 'OWNER') {
    return { error: 'Access denied: Only the store Owner can invite or manage team members' };
  }

  const rawPassword = formData.get('password');
  const parsed = InviteMemberSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    role: formData.get('role'),
    password: typeof rawPassword === 'string' && rawPassword.trim() ? rawPassword.trim() : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    const normalizedEmail = parsed.data.email.toLowerCase().trim();
    const existing = await prisma.staffUser.findFirst({
      where: { tenantId: session.tenantId, email: normalizedEmail },
    });

    if (existing) {
      return { error: `A staff member with email ${normalizedEmail} already exists.` };
    }

    const { member, temporaryPassword } = await createTeamMember({
      tenantId: session.tenantId,
      fullName: parsed.data.fullName,
      email: normalizedEmail,
      phone: parsed.data.phone,
      role: parsed.data.role as StaffRole,
      password: parsed.data.password,
    });

    await prisma.dataRevisionLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'POLICY',
        entityId: member.id,
        action: 'NOTE_ADDED',
        staffId: session.staffId,
        staffName: session.staffName || 'Owner',
        staffRole: 'OWNER',
        reason: `Owner invited new staff member ${member.fullName} with role ${member.role}`,
      },
    });

    revalidatePath('/team');
    revalidatePath('/audit');
    return {
      success: true,
      message: `Invited ${member.fullName} successfully.`,
      temporaryPassword,
    };
  } catch (err: any) {
    return { error: err.message || 'Failed to create team member' };
  }
}

export async function updateStaffRoleAction(
  staffId: string,
  newRole: StaffRole
): Promise<TeamActionState> {
  const session = await getSession();

  if (session.role !== 'OWNER') {
    return { error: 'Access denied: Only Owner can modify roles' };
  }
  if (!UUID_REGEX.test(staffId)) {
    return { error: 'Invalid staff ID' };
  }
  if (session.staffId && staffId === session.staffId) {
    return { error: 'You cannot modify your own role' };
  }

  try {
    const updated = await updateStaffRole(session.tenantId, staffId, newRole);

    await prisma.dataRevisionLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'POLICY',
        entityId: staffId,
        action: 'NOTE_ADDED',
        staffId: session.staffId,
        staffName: session.staffName || 'Owner',
        staffRole: 'OWNER',
        reason: `Owner changed role of ${updated.fullName} to ${newRole}`,
      },
    });

    revalidatePath('/team');
    revalidatePath('/audit');
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to update role' };
  }
}

export async function updateStaffStatusAction(
  staffId: string,
  status: StaffStatus
): Promise<TeamActionState> {
  const session = await getSession();

  if (session.role !== 'OWNER') {
    return { error: 'Access denied: Only Owner can change staff status' };
  }
  if (!UUID_REGEX.test(staffId)) {
    return { error: 'Invalid staff ID' };
  }
  if (session.staffId && staffId === session.staffId) {
    return { error: 'You cannot suspend or deactivate your own account' };
  }

  try {
    const updated = await updateStaffStatus(session.tenantId, staffId, status);

    await prisma.dataRevisionLog.create({
      data: {
        tenantId: session.tenantId,
        entityType: 'POLICY',
        entityId: staffId,
        action: 'NOTE_ADDED',
        staffId: session.staffId,
        staffName: session.staffName || 'Owner',
        staffRole: 'OWNER',
        reason: `Owner set status of ${updated.fullName} to ${status}`,
      },
    });

    revalidatePath('/team');
    revalidatePath('/audit');
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to update status' };
  }
}

/**
 * Strictly dev-only Role View Simulator (requires OWNER role + explicit env flag + tenantId match).
 */
export async function switchActiveStaffAction(staffId: string): Promise<TeamActionState> {
  if (process.env.NODE_ENV !== 'development' || process.env.ENABLE_DEMO_LOGIN !== 'true') {
    return { error: 'Role simulation is disabled in this environment' };
  }

  const session = await getSession();
  if (session.role !== 'OWNER') {
    return { error: 'Access denied: Only Owner can switch staff simulation view' };
  }
  if (!UUID_REGEX.test(staffId)) {
    return { error: 'Invalid staff ID' };
  }

  try {
    const staff = await prisma.staffUser.findFirst({
      where: {
        id: staffId,
        tenantId: session.tenantId,
        status: 'ACTIVE',
      },
    });

    if (!staff) {
      return { error: 'Active staff member not found in your store' };
    }

    await createSession({
      tenantId: session.tenantId,
      tenantName: session.tenantName,
      email: staff.email,
      staffId: staff.id,
      staffName: staff.fullName,
      role: staff.role as StaffRole,
      avatarUrl: staff.avatarUrl || undefined,
    });

    revalidatePath('/');
    revalidatePath('/orders');
    revalidatePath('/team');
    revalidatePath('/audit');
    return { success: true, message: `Switched session to ${staff.fullName} (${staff.role})` };
  } catch (err: any) {
    return { error: err.message || 'Failed to switch staff role' };
  }
}
