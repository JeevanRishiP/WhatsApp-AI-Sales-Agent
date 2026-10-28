'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Authentication                              ║
// ║                                                               ║
// ║  Login, logout, and password management.                      ║
// ╚═══════════════════════════════════════════════════════════════╝

import { redirect } from 'next/navigation';
import { createSession, destroySession, getTenantId } from '@/lib/auth';
import { verifyTenantCredentials, verifyApiKey, changePassword } from '@/lib/dal/settings';
import { z } from 'zod';

// ─── Login Schema ─────────────────────────────────────────────────

const PasswordLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const ApiKeyLoginSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
});

// ─── Login Action ─────────────────────────────────────────────────

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

      await createSession({
        tenantId: tenant.id,
        tenantName: tenant.name,
        email: tenant.ownerEmail,
      });
    } else {
      const email = formData.get('email') as string;
      const password = formData.get('password') as string;
      const parsed = PasswordLoginSchema.safeParse({ email, password });

      if (!parsed.success) {
        const errors = parsed.error.flatten().fieldErrors;
        const firstError = Object.values(errors)[0]?.[0];
        return { error: firstError || 'Invalid input' };
      }

      const tenant = await verifyTenantCredentials(parsed.data.email, parsed.data.password);
      if (!tenant) {
        return { error: 'Invalid email or password' };
      }

      await createSession({
        tenantId: tenant.id,
        tenantName: tenant.name,
        email: tenant.ownerEmail,
      });
    }

    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Login failed' };
  }
}

// ─── Logout Action ────────────────────────────────────────────────

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect('/login');
}

// ─── Change Password Action ──────────────────────────────────────

const ChangePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
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
  const tenantId = await getTenantId();

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
    await changePassword(
      tenantId,
      parsed.data.currentPassword || null,
      parsed.data.newPassword
    );
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to change password' };
  }
}
