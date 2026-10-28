'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Settings                                    ║
// ║                                                               ║
// ║  Profile and persona management.                              ║
// ║  tenantId comes from session — never from user input.         ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { getTenantId } from '@/lib/auth';
import { updateProfile, updatePersona, updateAiConfig, updateWhatsAppSettings } from '@/lib/dal/settings';
import { z } from 'zod';

export interface SettingsActionState {
  error?: string;
  success?: boolean;
}

// ─── Update Profile ───────────────────────────────────────────────

const ProfileSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters').max(100),
  ownerName: z.string().min(2).max(100),
  ownerPhone: z.string().regex(/^\d{10,15}$/, 'Invalid phone number'),
  ownerEmail: z.string().email('Invalid email'),
  businessCategory: z.string().max(50).optional(),
});

export async function updateProfileAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const tenantId = await getTenantId();

  const parsed = ProfileSchema.safeParse({
    name: formData.get('name'),
    ownerName: formData.get('ownerName'),
    ownerPhone: formData.get('ownerPhone'),
    ownerEmail: formData.get('ownerEmail'),
    businessCategory: formData.get('businessCategory') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    await updateProfile(tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to update profile' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Update Persona ───────────────────────────────────────────────

const PersonaSchema = z.object({
  botName: z.string().max(50).default('Shopping Assistant'),
  tone: z.enum(['friendly', 'professional', 'casual', 'luxurious']).default('friendly'),
  language: z.string().default('en'),
  greetingMessage: z.string().max(500).optional(),
  outOfStockMessage: z.string().max(500).optional(),
  orderConfirmationTemplate: z.string().max(1000).optional(),
});

export async function updatePersonaAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const tenantId = await getTenantId();

  const parsed = PersonaSchema.safeParse({
    botName: formData.get('botName'),
    tone: formData.get('tone'),
    language: formData.get('language'),
    greetingMessage: formData.get('greetingMessage') || undefined,
    outOfStockMessage: formData.get('outOfStockMessage') || undefined,
    orderConfirmationTemplate: formData.get('orderConfirmationTemplate') || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    await updatePersona(tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to update persona' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Test Razorpay Connection ────────────────────────────────────

export async function testRazorpayConnectionAction(): Promise<{
  success: boolean;
  message: string;
  details?: any;
  keyId: string;
  isSandbox: boolean;
}> {
  try {
    const { razorpayService } = await import('@wcos/payments');
    const result = await razorpayService.testConnection();
    return {
      ...result,
      keyId: process.env['RAZORPAY_KEY_ID'] || 'rzp_test_sample',
      isSandbox: razorpayService.isSandbox,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to connect to Razorpay',
      keyId: process.env['RAZORPAY_KEY_ID'] || 'rzp_test_sample',
      isSandbox: true,
    };
  }
}

// ─── Update AI Config ────────────────────────────────────────────

const AiModelEntrySchema = z.object({
  provider: z.enum(['google', 'openai', 'anthropic']),
  model: z.string().min(1).max(100),
  enabled: z.boolean(),
});

const AiConfigSchema = z.object({
  priorityList: z.array(AiModelEntrySchema).min(1, 'At least one model is required'),
});

export async function updateAiConfigAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const tenantId = await getTenantId();

  let raw: unknown;
  try {
    const json = formData.get('aiConfig');
    raw = JSON.parse(typeof json === 'string' ? json : '{}');
  } catch {
    return { error: 'Invalid JSON payload' };
  }

  const parsed = AiConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid AI config' };
  }

  try {
    await updateAiConfig(tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to save AI configuration' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Update WhatsApp Settings ─────────────────────────────────────

const WhatsAppSettingsSchema = z.object({
  whatsappPhoneNumber: z.string().optional(),
  whatsappInstanceName: z.string().min(1, 'WhatsApp Instance name is required').max(50),
});

export async function updateWhatsAppSettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const tenantId = await getTenantId();

  const phone = formData.get('whatsappPhoneNumber');
  const instance = formData.get('whatsappInstanceName');

  const parsed = WhatsAppSettingsSchema.safeParse({
    whatsappPhoneNumber: typeof phone === 'string' ? phone : undefined,
    whatsappInstanceName: typeof instance === 'string' ? instance : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid WhatsApp configuration' };
  }

  try {
    await updateWhatsAppSettings(tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to update WhatsApp settings' };
  }

  revalidatePath('/settings');
  return { success: true };
}
