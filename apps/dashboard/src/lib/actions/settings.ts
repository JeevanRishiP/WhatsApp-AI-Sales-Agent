'use server';

// ╔═══════════════════════════════════════════════════════════════╗
// ║  Server Actions — Settings & Tenant Vault (RBAC Protected)    ║
// ║                                                               ║
// ║  tenantId and role ALWAYS come from verified JWT session.     ║
// ╚═══════════════════════════════════════════════════════════════╝

import { revalidatePath } from 'next/cache';
import { getSession, hasRole } from '@/lib/auth';
import {
  updateProfile,
  updatePersona,
  updateAiConfig,
  updateWhatsAppSettings,
  toggleAiAgent,
  updateOfflineSettings,
  updateTenantPaymentSecrets,
  getDecryptedPaymentSecrets,
  updateLegalBranding,
  type MaskedPaymentSecrets,
} from '@/lib/dal/settings';
import { z } from 'zod';

export interface SettingsActionState {
  error?: string;
  success?: boolean;
}

// ─── Update Profile (OWNER Only) ──────────────────────────────────

const ProfileSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters').max(100),
  ownerName: z.string().min(2).max(100),
  ownerPhone: z.string().regex(/^\+?\d{10,15}$/, 'Invalid phone number'),
  ownerEmail: z.string().email('Invalid email'),
  businessCategory: z.string().max(50).optional(),
});

export async function updateProfileAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER'])) {
    return { error: 'Access denied: Only Store Owner can modify business profile' };
  }

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
    await updateProfile(session.tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to update profile' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Update Legal / Invoice Branding (OWNER Only) ─────────────────

const LegalBrandingSchema = z.object({
  legalName: z.string().max(150).optional(),
  gstin: z.string().max(30).optional(),
  cin: z.string().max(40).optional(),
  defaultHsn: z.string().max(20).optional(),
  supportPhone: z.string().max(20).optional(),
  warehouseLine1: z.string().max(200).optional(),
  warehouseCity: z.string().max(100).optional(),
  warehouseState: z.string().max(100).optional(),
  warehousePincode: z.string().max(15).optional(),
});

export async function updateLegalBrandingAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER'])) {
    return { error: 'Access denied: Only Store Owner can modify legal & GST settings' };
  }

  const parsed = LegalBrandingSchema.safeParse({
    legalName: (formData.get('legalName') as string) || undefined,
    gstin: (formData.get('gstin') as string) || undefined,
    cin: (formData.get('cin') as string) || undefined,
    defaultHsn: (formData.get('defaultHsn') as string) || undefined,
    supportPhone: (formData.get('supportPhone') as string) || undefined,
    warehouseLine1: (formData.get('warehouseLine1') as string) || undefined,
    warehouseCity: (formData.get('warehouseCity') as string) || undefined,
    warehouseState: (formData.get('warehouseState') as string) || undefined,
    warehousePincode: (formData.get('warehousePincode') as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid input' };
  }

  try {
    const d = parsed.data;
    await updateLegalBranding(session.tenantId, {
      legalName: d.legalName,
      gstin: d.gstin,
      cin: d.cin,
      defaultHsn: d.defaultHsn,
      supportPhone: d.supportPhone,
      ...(d.warehouseLine1 && d.warehouseCity && d.warehouseState && d.warehousePincode
        ? {
            warehouseAddress: {
              line1: d.warehouseLine1,
              city: d.warehouseCity,
              state: d.warehouseState,
              pincode: d.warehousePincode,
            },
          }
        : {}),
    });
  } catch (err: any) {
    return { error: err.message || 'Failed to update legal branding' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Save Encrypted Payment Gateway Credentials (OWNER Only) ──────

const PaymentSecretsSchema = z.object({
  razorpayKeyId: z.string().max(120).optional(),
  razorpayKeySecret: z.string().max(200).optional(),
  razorpayWebhookSecret: z.string().max(200).optional(),
  phonepeMerchantId: z.string().max(120).optional(),
  phonepeSaltKey: z.string().max(200).optional(),
  phonepeSaltIndex: z.coerce.number().int().min(1).max(20).optional(),
  phonepeEnvironment: z.enum(['sandbox', 'production']).optional(),
});

export async function updatePaymentSecretsAction(
  _prev: SettingsActionState & { masked?: MaskedPaymentSecrets },
  formData: FormData
): Promise<SettingsActionState & { masked?: MaskedPaymentSecrets }> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER'])) {
    return { error: 'Access denied: Only Store Owner can modify gateway credentials' };
  }

  const parsed = PaymentSecretsSchema.safeParse({
    razorpayKeyId: (formData.get('razorpayKeyId') as string) || undefined,
    razorpayKeySecret: (formData.get('razorpayKeySecret') as string) || undefined,
    razorpayWebhookSecret: (formData.get('razorpayWebhookSecret') as string) || undefined,
    phonepeMerchantId: (formData.get('phonepeMerchantId') as string) || undefined,
    phonepeSaltKey: (formData.get('phonepeSaltKey') as string) || undefined,
    phonepeSaltIndex: formData.get('phonepeSaltIndex') || undefined,
    phonepeEnvironment: (formData.get('phonepeEnvironment') as string) || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid gateway credential input' };
  }

  try {
    const masked = await updateTenantPaymentSecrets(session.tenantId, parsed.data);
    revalidatePath('/settings');
    return { success: true, masked };
  } catch (err: any) {
    return { error: err.message || 'Failed to store encrypted payment credentials' };
  }
}

// ─── Update Persona (OWNER / STORE_MANAGER) ──────────────────────

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
  const session = await getSession();
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
    return { error: 'Access denied: Insufficient permissions' };
  }

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
    await updatePersona(session.tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to update persona' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Test Razorpay & PhonePe Connections (OWNER Only) ────────────

export async function testRazorpayConnectionAction(): Promise<{
  success: boolean;
  message: string;
  details?: any;
  keyId: string;
  isSandbox: boolean;
}> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER'])) {
    return {
      success: false,
      message: 'Access denied: Only Store Owner can test gateway connectivity',
      keyId: '',
      isSandbox: true,
    };
  }

  try {
    const { RazorpayService } = await import('@wcos/payments');
    const tenantSecrets = await getDecryptedPaymentSecrets(session.tenantId);
    const service = new RazorpayService(
      tenantSecrets?.razorpayKeyId
        ? {
            keyId: tenantSecrets.razorpayKeyId,
            keySecret: tenantSecrets.razorpayKeySecret,
            webhookSecret: tenantSecrets.razorpayWebhookSecret,
          }
        : undefined
    );
    const result = await service.testConnection();
    const rawKeyId = tenantSecrets?.razorpayKeyId || process.env['RAZORPAY_KEY_ID'] || '';
    const maskedKey = rawKeyId ? `${rawKeyId.slice(0, 8)}••••` : 'not_configured';
    return {
      ...result,
      keyId: maskedKey,
      isSandbox: service.isSandbox,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to connect to Razorpay',
      keyId: 'error',
      isSandbox: true,
    };
  }
}

export async function testPhonePeConnectionAction(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER'])) {
    return {
      success: false,
      message: 'Access denied: Only Store Owner can test gateway connectivity',
    };
  }

  try {
    const { PhonePeService } = await import('@wcos/payments');
    const tenantSecrets = await getDecryptedPaymentSecrets(session.tenantId);
    const service = new PhonePeService(
      tenantSecrets?.phonepeMerchantId
        ? {
            merchantId: tenantSecrets.phonepeMerchantId,
            saltKey: tenantSecrets.phonepeSaltKey,
            saltIndex: tenantSecrets.phonepeSaltIndex,
            environment: tenantSecrets.phonepeEnvironment,
          }
        : undefined
    );
    return await service.testConnection();
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to connect to PhonePe',
    };
  }
}

// ─── Update AI Config (OWNER Only) ────────────────────────────────

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
  const session = await getSession();
  if (!hasRole(session, ['OWNER'])) {
    return { error: 'Access denied: Only Store Owner can modify AI model routing' };
  }

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
    await updateAiConfig(session.tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to save AI configuration' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Update WhatsApp Settings (OWNER Only) ────────────────────────

const WhatsAppSettingsSchema = z.object({
  whatsappPhoneNumber: z.string().optional(),
  whatsappInstanceName: z.string().min(1, 'WhatsApp Instance name is required').max(50),
});

export async function updateWhatsAppSettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER'])) {
    return { error: 'Access denied: Only Store Owner can modify WhatsApp connection settings' };
  }

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
    await updateWhatsAppSettings(session.tenantId, parsed.data);
  } catch (err: any) {
    return { error: err.message || 'Failed to update WhatsApp settings' };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Toggle WhatsApp AI Sales Agent (OWNER / STORE_MANAGER) ────────

export async function toggleAiAgentAction(
  enabled: boolean
): Promise<{ success: boolean; aiAgentEnabled: boolean; error?: string }> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
    return {
      success: false,
      aiAgentEnabled: !enabled,
      error: 'Access denied: Insufficient permissions',
    };
  }

  try {
    const updated = await toggleAiAgent(session.tenantId, enabled);
    revalidatePath('/', 'layout');
    revalidatePath('/settings');
    revalidatePath('/conversations');
    return { success: true, aiAgentEnabled: updated };
  } catch (err: any) {
    return {
      success: false,
      aiAgentEnabled: !enabled,
      error: err.message || 'Failed to toggle AI agent status',
    };
  }
}

// ─── Update Offline Auto-Reply Settings (OWNER / STORE_MANAGER) ───

const OfflineSettingsSchema = z.object({
  aiAgentEnabled: z.boolean().optional(),
  offlineSupportPhone: z.string().max(20).optional(),
  offlineMessage: z.string().max(1000).optional(),
});

export async function updateOfflineSettingsAction(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await getSession();
  if (!hasRole(session, ['OWNER', 'STORE_MANAGER'])) {
    return { error: 'Access denied: Insufficient permissions' };
  }

  const enabledRaw = formData.get('aiAgentEnabled');
  const aiAgentEnabled = enabledRaw !== null ? enabledRaw === 'true' || enabledRaw === 'on' : undefined;
  const offlineSupportPhone = formData.get('offlineSupportPhone');
  const offlineMessage = formData.get('offlineMessage');

  const parsed = OfflineSettingsSchema.safeParse({
    aiAgentEnabled,
    offlineSupportPhone: typeof offlineSupportPhone === 'string' ? offlineSupportPhone.trim() : undefined,
    offlineMessage: typeof offlineMessage === 'string' ? offlineMessage.trim() : undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message || 'Invalid offline settings' };
  }

  try {
    await updateOfflineSettings(session.tenantId, parsed.data);
    revalidatePath('/', 'layout');
    revalidatePath('/settings');
    revalidatePath('/conversations');
    return { success: true };
  } catch (err: any) {
    return { error: err.message || 'Failed to update offline settings' };
  }
}
