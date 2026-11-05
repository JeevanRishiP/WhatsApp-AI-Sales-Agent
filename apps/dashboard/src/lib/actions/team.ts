'use server';

import { revalidatePath } from 'next/cache';
import { getSession, createSession, type StaffRole } from '@/lib/auth';
import { createTeamMember, updateStaffRole, updateStaffStatus } from '@/lib/dal/team';
import { prisma, type StaffStatus } from '@wcos/db';
import { z } from 'zod';

export interface TeamActionState {
  error?: string;
  success?: boolean;
  message?: string;
}

const InviteMemberSchema = z.object({
  fullName: z.string().min(2, 'Full name is required').max(100),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  role: z.enum(['OWNER', 'STORE_MANAGER', 'FULFILLMENT_LEAD', 'SUPPORT_CONCIERGE']),
});

export async function inviteTeamMemberAction(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const session = await getSession();

  // Security check: Only Owner can invite team members
  if (session.role !== 'OWNER') {
    return { error: 'Access denied: Only the store Owner can invite or manage team members' };
  }

  const parsed = InviteMemberSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone') || undefined,
    role: formData.get('role'),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    const existing = await prisma.staffUser.findFirst({
      where: { tenantId: session.tenantId, email: parsed.data.email.toLowerCase().trim() },
    });

    if (existing) {
      return { error: `A staff member with email ${parsed.data.email} already exists.` };
    }

    const member = await createTeamMember({
      tenantId: session.tenantId,
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      role: parsed.data.role as StaffRole,
    });

    // Record in audit log
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
    return { success: true, message: `Invited ${member.fullName} successfully` };
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
 * Simulator Action: Switch active staff role for Pair Programming & Testing.
 * Allows switching between Owner, Store Manager, Fulfillment Lead, and Support Concierge.
 */
export async function switchActiveStaffAction(staffId: string): Promise<TeamActionState> {
  const session = await getSession();

  try {
    const staff = await prisma.staffUser.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      return { error: 'Staff member not found' };
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

