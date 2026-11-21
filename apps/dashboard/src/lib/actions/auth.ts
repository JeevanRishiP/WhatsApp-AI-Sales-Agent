'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Authentication                              ║
// ║                                                               ║
// ║  Login, logout, and role-safe password management.            ║
// ╚═══════════════════════════════════════════════════════════════╝

import { redirect } from 'next/navigation';
import { prisma } from '@wcos/db';
import { createSession, destroySession, getSession } from '@/lib/auth';
import {
  verifyDashboardCredentials,
  verifyApiKey,
  changeUserPassword,
} from '@/lib/dal/settings';
import { z } from 'zod';

const PasswordLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  storeSlug: z.string().max(50).optional(),
});

const ApiKeyLoginSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

export interface LoginState {
  error?: string;
  success?: boolean;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const method = formData.get('method') as string;

  try {
    if (method === 'apikey') {
      const apiKey = formData.get('apiKey') as string;
      const parsed = ApiKeyLoginSchema.safeParse({ apiKey });

      if (!parsed.success) {
        return { error: 'Please enter your API key' };
      }

      const tenant = await verifyApiKey(parsed.data.apiKey);
      if (!tenant) {
        return { error: 'Invalid API key' };
      }

      const ownerStaff = await prisma.staffUser.findFirst({
        where: { tenantId: tenant.id, role: 'OWNER', status: 'ACTIVE' },
        select: { id: true, fullName: true, email: true, avatarUrl: true },
      });

      await createSession({
        tenantId: tenant.id,
        tenantName: tenant.name,
        email: ownerStaff?.email || tenant.ownerEmail,
        staffId: ownerStaff?.id,
        staffName: ownerStaff?.fullName || tenant.ownerName || 'Owner',
        role: 'OWNER',
        avatarUrl: ownerStaff?.avatarUrl || undefined,
      });
    } else {
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;
      const storeSlug = (formData.get('storeSlug') as string) || undefined;
      const parsed = PasswordLoginSchema.safeParse({ email, password, storeSlug });

      if (!parsed.success) {
        const errors = parsed.error.flatten().fieldErrors;
        const firstError = Object.values(errors)[0]?.[0];
        return { error: firstError || 'Invalid input' };
      }

      const verified = await verifyDashboardCredentials(
        parsed.data.email,
        parsed.data.password,
        parsed.data.storeSlug
      );
      if (!verified) {
        return { error: 'Invalid email or password' };
      }

      await createSession({
        tenantId: verified.tenantId,
        tenantName: verified.tenantName,
        email: verified.email,
        staffId: verified.staffId,
        staffName: verified.staffName,
        role: verified.role,
        avatarUrl: verified.avatarUrl,
      });
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Login failed' };
  }
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export interface ChangePasswordState {
  error?: string;
  success?: boolean;
}

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await getSession();

  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword') || undefined,
    newPassword: formData.get('newPassword'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message;
    return { error: firstError || 'Invalid input' };
  }

  try {
    await changeUserPassword({
      tenantId: session.tenantId,
      role: session.role,
      staffId: session.staffId,
      currentPassword: parsed.data.currentPassword || null,
      newPassword: parsed.data.newPassword,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to change password' };
  }
}
