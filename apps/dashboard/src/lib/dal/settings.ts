// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Settings & Encrypted Tenant Vault        ║
// ║                                                               ║
// ║  Tenant profile, bot persona, legal branding, and encrypted   ║
// ║  payment/AI credential vault. Every query is scoped to tenantId.
// ╚═══════════════════════════════════════════════════════════════╝

import { prisma, type Prisma, type StaffRole, type Tenant } from '@wcos/db';
import {
  encryptTenantSecrets,
  decryptTenantSecrets,
  maskSecret,
  type TenantPaymentSecrets,
  type TenantAiSecrets,
} from '@wcos/crypto';
import { compare, hash } from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

function isValidBcryptHash(value?: string | null): boolean {
  return Boolean(value && /^\$2[aby]\$\d{2}\$.{53}$/.test(value));
}

// ─── Get Tenant Profile ───────────────────────────────────────────

export async function getTenantProfile(tenantId: string): Promise<Tenant | null> {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
  });
}

// ─── Update Tenant Profile ────────────────────────────────────────

export interface UpdateProfileInput {
  name?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  businessCategory?: string;
}

export async function updateProfile(
  tenantId: string,
  input: UpdateProfileInput
): Promise<Tenant> {
  const data: Prisma.TenantUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.ownerName !== undefined) data.ownerName = input.ownerName;
  if (input.ownerPhone !== undefined) data.ownerPhone = input.ownerPhone;
  if (input.ownerEmail !== undefined) data.ownerEmail = input.ownerEmail.toLowerCase().trim();
  if (input.businessCategory !== undefined) data.businessCategory = input.businessCategory;

  return prisma.tenant.update({
    where: { id: tenantId },
    data,
  });
}

// ─── Update Legal / Invoice Branding ──────────────────────────────

export interface UpdateLegalBrandingInput {
  legalName?: string;
  gstin?: string;
  cin?: string;
  defaultHsn?: string;
  supportPhone?: string;
  warehouseAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export async function updateLegalBranding(
  tenantId: string,
  input: UpdateLegalBrandingInput
): Promise<Tenant> {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(input.legalName !== undefined ? { legalName: input.legalName.trim() || null } : {}),
      ...(input.gstin !== undefined ? { gstin: input.gstin.trim().toUpperCase() || null } : {}),
      ...(input.cin !== undefined ? { cin: input.cin.trim().toUpperCase() || null } : {}),
      ...(input.defaultHsn !== undefined ? { defaultHsn: input.defaultHsn.trim() || null } : {}),
      ...(input.supportPhone !== undefined ? { supportPhone: input.supportPhone.trim() || null } : {}),
      ...(input.warehouseAddress !== undefined
        ? { warehouseAddress: input.warehouseAddress as Prisma.InputJsonValue }
        : {}),
    },
  });
}

// ─── Encrypted Tenant Secrets (HKDF AES-256-GCM) ──────────────────

export interface MaskedPaymentSecrets {
  razorpayKeyIdMasked: string;
  hasRazorpayKeySecret: boolean;
  hasRazorpayWebhookSecret: boolean;
  phonepeMerchantIdMasked: string;
  hasPhonepeSaltKey: boolean;
  phonepeSaltIndex: number;
  phonepeEnvironment: 'sandbox' | 'production';
}

export async function getMaskedPaymentSecrets(tenantId: string): Promise<MaskedPaymentSecrets> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { paymentConfigEncrypted: true },
  });
  const decrypted = decryptTenantSecrets<TenantPaymentSecrets>(
    tenantId,
    tenant?.paymentConfigEncrypted
  );

  return {
    razorpayKeyIdMasked: maskSecret(decrypted?.razorpayKeyId, 4),
    hasRazorpayKeySecret: Boolean(decrypted?.razorpayKeySecret),
    hasRazorpayWebhookSecret: Boolean(decrypted?.razorpayWebhookSecret),
    phonepeMerchantIdMasked: maskSecret(decrypted?.phonepeMerchantId, 4),
    hasPhonepeSaltKey: Boolean(decrypted?.phonepeSaltKey),
    phonepeSaltIndex: decrypted?.phonepeSaltIndex ?? 1,
    phonepeEnvironment: decrypted?.phonepeEnvironment ?? 'sandbox',
  };
}

export async function getDecryptedPaymentSecrets(
  tenantId: string
): Promise<TenantPaymentSecrets | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { paymentConfigEncrypted: true },
  });
  return decryptTenantSecrets<TenantPaymentSecrets>(tenantId, tenant?.paymentConfigEncrypted);
}

export async function updateTenantPaymentSecrets(
  tenantId: string,
  patch: Partial<TenantPaymentSecrets>
): Promise<MaskedPaymentSecrets> {
  const existing = (await getDecryptedPaymentSecrets(tenantId)) || {};
  const merged: TenantPaymentSecrets = {
    ...existing,
    ...(patch.razorpayKeyId !== undefined && patch.razorpayKeyId !== ''
      ? { razorpayKeyId: patch.razorpayKeyId.trim() }
      : {}),
    ...(patch.razorpayKeySecret !== undefined && patch.razorpayKeySecret !== ''
      ? { razorpayKeySecret: patch.razorpayKeySecret.trim() }
      : {}),
    ...(patch.razorpayWebhookSecret !== undefined && patch.razorpayWebhookSecret !== ''
      ? { razorpayWebhookSecret: patch.razorpayWebhookSecret.trim() }
      : {}),
    ...(patch.phonepeMerchantId !== undefined && patch.phonepeMerchantId !== ''
      ? { phonepeMerchantId: patch.phonepeMerchantId.trim() }
      : {}),
    ...(patch.phonepeSaltKey !== undefined && patch.phonepeSaltKey !== ''
      ? { phonepeSaltKey: patch.phonepeSaltKey.trim() }
      : {}),
    ...(patch.phonepeSaltIndex !== undefined ? { phonepeSaltIndex: patch.phonepeSaltIndex } : {}),
    ...(patch.phonepeEnvironment !== undefined
      ? { phonepeEnvironment: patch.phonepeEnvironment }
      : {}),
  };

  const encrypted = encryptTenantSecrets(tenantId, merged);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { paymentConfigEncrypted: encrypted },
  });

  return {
    razorpayKeyIdMasked: maskSecret(merged.razorpayKeyId, 4),
    hasRazorpayKeySecret: Boolean(merged.razorpayKeySecret),
    hasRazorpayWebhookSecret: Boolean(merged.razorpayWebhookSecret),
    phonepeMerchantIdMasked: maskSecret(merged.phonepeMerchantId, 4),
    hasPhonepeSaltKey: Boolean(merged.phonepeSaltKey),
    phonepeSaltIndex: merged.phonepeSaltIndex ?? 1,
    phonepeEnvironment: merged.phonepeEnvironment ?? 'sandbox',
  };
}

export async function updateTenantAiKeys(
  tenantId: string,
  patch: Partial<TenantAiSecrets>
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiKeysEncrypted: true },
  });
  const existing = decryptTenantSecrets<TenantAiSecrets>(tenantId, tenant?.aiKeysEncrypted) || {};
  const merged: TenantAiSecrets = {
    ...existing,
    ...(patch.openaiApiKey ? { openaiApiKey: patch.openaiApiKey.trim() } : {}),
    ...(patch.anthropicApiKey ? { anthropicApiKey: patch.anthropicApiKey.trim() } : {}),
    ...(patch.googleApiKey ? { googleApiKey: patch.googleApiKey.trim() } : {}),
  };
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { aiKeysEncrypted: encryptTenantSecrets(tenantId, merged) },
  });
}

// ─── Update Bot Persona ───────────────────────────────────────────

export async function updatePersona(
  tenantId: string,
  persona: Record<string, unknown>
): Promise<Tenant> {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      persona: persona as Prisma.InputJsonValue,
    },
  });
}

// ─── Update WhatsApp Settings ─────────────────────────────────────

export interface UpdateWhatsAppSettingsInput {
  whatsappPhoneNumber?: string;
  whatsappInstanceName?: string;
}

export async function updateWhatsAppSettings(
  tenantId: string,
  input: UpdateWhatsAppSettingsInput
): Promise<Tenant> {
  const data: Prisma.TenantUpdateInput = {};
  if (input.whatsappPhoneNumber !== undefined) {
    const cleanPhone = input.whatsappPhoneNumber.trim();
    if (cleanPhone) {
      const conflict = await prisma.tenant.findFirst({
        where: { whatsappPhoneNumber: cleanPhone, id: { not: tenantId } },
        select: { id: true },
      });
      if (conflict) {
        throw new Error('This WhatsApp phone number is already linked to another store');
      }
      data.whatsappPhoneNumber = cleanPhone;
    } else {
      data.whatsappPhoneNumber = null;
    }
  }
  if (input.whatsappInstanceName !== undefined && input.whatsappInstanceName.trim()) {
    const cleanInstance = input.whatsappInstanceName.trim();
    const conflict = await prisma.tenant.findFirst({
      where: { whatsappInstanceName: cleanInstance, id: { not: tenantId } },
      select: { id: true },
    });
    if (conflict) {
      throw new Error('This WhatsApp instance name is already registered to another store');
    }
    data.whatsappInstanceName = cleanInstance;
  }

  return prisma.tenant.update({
    where: { id: tenantId },
    data,
  });
}

// ─── Update AI Config ─────────────────────────────────────────────

export interface AiModelEntry {
  provider: 'google' | 'openai' | 'anthropic';
  model: string;
  enabled: boolean;
}

export interface AiConfigInput {
  priorityList?: AiModelEntry[];
  aiAgentEnabled?: boolean;
  offlineSupportPhone?: string;
  offlineMessage?: string;
}

export async function updateAiConfig(
  tenantId: string,
  config: Partial<AiConfigInput>
): Promise<Tenant> {
  const current = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiConfig: true },
  });
  const currentConfig = (current?.aiConfig as Record<string, any>) || {};
  const merged = { ...currentConfig, ...config };

  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      aiConfig: merged as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function toggleAiAgent(
  tenantId: string,
  enabled: boolean
): Promise<boolean> {
  const current = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiConfig: true },
  });
  const currentConfig = (current?.aiConfig as Record<string, any>) || {};
  const updated = { ...currentConfig, aiAgentEnabled: enabled };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      aiConfig: updated as unknown as Prisma.InputJsonValue,
    },
  });
  return enabled;
}

export async function updateOfflineSettings(
  tenantId: string,
  input: {
    aiAgentEnabled?: boolean;
    offlineSupportPhone?: string;
    offlineMessage?: string;
  }
): Promise<void> {
  const current = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiConfig: true },
  });
  const currentConfig = (current?.aiConfig as Record<string, any>) || {};
  const updated = {
    ...currentConfig,
    ...(typeof input.aiAgentEnabled === 'boolean' ? { aiAgentEnabled: input.aiAgentEnabled } : {}),
    ...(input.offlineSupportPhone !== undefined ? { offlineSupportPhone: input.offlineSupportPhone } : {}),
    ...(input.offlineMessage !== undefined ? { offlineMessage: input.offlineMessage } : {}),
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      aiConfig: updated as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function getAiConfig(tenantId: string): Promise<AiConfigInput | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { aiConfig: true },
  });
  if (!tenant) return null;
  const cfg = tenant.aiConfig as any;
  if (!cfg) return null;
  return cfg as AiConfigInput;
}

// ─── Change Password (Role-Scoped) ────────────────────────────────

export async function changeUserPassword(params: {
  tenantId: string;
  role: StaffRole;
  staffId?: string;
  currentPassword: string | null;
  newPassword: string;
}): Promise<void> {
  const { tenantId, role, staffId, currentPassword, newPassword } = params;
  const newHash = await hash(newPassword, BCRYPT_ROUNDS);

  // Non-owners may ONLY update their own StaffUser password
  if (role !== 'OWNER') {
    if (!staffId) {
      throw new Error('Staff session missing staffId');
    }
    const staff = await prisma.staffUser.findFirst({
      where: { id: staffId, tenantId, status: 'ACTIVE' },
      select: { id: true, passwordHash: true },
    });
    if (!staff) {
      throw new Error('Staff user not found');
    }
    if (isValidBcryptHash(staff.passwordHash)) {
      if (!currentPassword) {
        throw new Error('Current password is required');
      }
      const valid = await compare(currentPassword, staff.passwordHash);
      if (!valid) {
        throw new Error('Current password is incorrect');
      }
    }
    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { passwordHash: newHash },
    });
    return;
  }

  // Owner updates Tenant.passwordHash (and owner StaffUser if linked)
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { passwordHash: true },
  });
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  if (isValidBcryptHash(tenant.passwordHash)) {
    if (!currentPassword) {
      throw new Error('Current password is required');
    }
    const valid = await compare(currentPassword, tenant.passwordHash!);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { passwordHash: newHash },
    });
    if (staffId) {
      await tx.staffUser.updateMany({
        where: { id: staffId, tenantId },
        data: { passwordHash: newHash },
      });
    }
  });
}

export async function changePassword(
  tenantId: string,
  currentPassword: string | null,
  newPassword: string
): Promise<void> {
  return changeUserPassword({
    tenantId,
    role: 'OWNER',
    currentPassword,
    newPassword,
  });
}

// ─── Verify Credentials (Owner OR StaffUser) ──────────────────────

export interface VerifiedDashboardUser {
  tenantId: string;
  tenantName: string;
  email: string;
  staffId?: string;
  staffName: string;
  role: StaffRole;
  avatarUrl?: string;
}

export async function verifyDashboardCredentials(
  email: string,
  password: string,
  storeSlug?: string
): Promise<VerifiedDashboardUser | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const slugFilter = storeSlug?.toLowerCase().trim();

  // 1. Check StaffUser accounts matching email (filtered by slug if provided)
  const staffCandidates = await prisma.staffUser.findMany({
    where: {
      email: normalizedEmail,
      ...(slugFilter ? { tenant: { slug: slugFilter } } : {}),
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  const matchingStaff: typeof staffCandidates = [];
  for (const candidate of staffCandidates) {
    if (!isValidBcryptHash(candidate.passwordHash)) continue;
    const valid = await compare(password, candidate.passwordHash);
    if (valid) {
      matchingStaff.push(candidate);
    }
  }

  if (matchingStaff.length > 1) {
    throw new Error('Multiple stores found for this email. Please specify your Store Slug.');
  }

  if (matchingStaff.length === 1) {
    const staff = matchingStaff[0]!;
    if (staff.status !== 'ACTIVE') {
      throw new Error(`Staff account is ${staff.status.toLowerCase()}`);
    }
    if (staff.tenant.status === 'SUSPENDED' || staff.tenant.status === 'CHURNED') {
      throw new Error(`Store account is ${staff.tenant.status.toLowerCase()}`);
    }

    await prisma.staffUser.update({
      where: { id: staff.id },
      data: { lastLoginAt: new Date(), lastActiveAt: new Date() },
    });

    return {
      tenantId: staff.tenant.id,
      tenantName: staff.tenant.name,
      email: staff.email,
      staffId: staff.id,
      staffName: staff.fullName,
      role: staff.role as StaffRole,
      avatarUrl: staff.avatarUrl || undefined,
    };
  }

  // 2. Fallback to Tenant owner credentials
  const tenants = await prisma.tenant.findMany({
    where: {
      ownerEmail: normalizedEmail,
      ...(slugFilter ? { slug: slugFilter } : {}),
    },
    select: {
      id: true,
      name: true,
      ownerName: true,
      ownerEmail: true,
      passwordHash: true,
      status: true,
    },
  });

  if (tenants.length === 0) return null;

  const matchedTenants: typeof tenants = [];
  for (const t of tenants) {
    if (!isValidBcryptHash(t.passwordHash)) continue;
    if (await compare(password, t.passwordHash!)) {
      matchedTenants.push(t);
    }
  }

  if (matchedTenants.length === 0) {
    if (tenants.every((t) => !t.passwordHash)) {
      throw new Error('Password not set. Please login with your API key and set a password.');
    }
    return null;
  }

  if (matchedTenants.length > 1) {
    throw new Error('Multiple stores found for this email. Please specify your Store Slug.');
  }

  const tenant = matchedTenants[0]!;
  if (tenant.status === 'SUSPENDED' || tenant.status === 'CHURNED') {
    throw new Error(`Account is ${tenant.status.toLowerCase()}`);
  }

  const ownerStaff = await prisma.staffUser.findFirst({
    where: { tenantId: tenant.id, role: 'OWNER', status: 'ACTIVE' },
    select: { id: true, fullName: true, avatarUrl: true },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    email: tenant.ownerEmail,
    staffId: ownerStaff?.id,
    staffName: ownerStaff?.fullName || tenant.ownerName,
    role: 'OWNER',
    avatarUrl: ownerStaff?.avatarUrl || undefined,
  };
}

export async function verifyTenantCredentials(
  email: string,
  password: string
): Promise<{ id: string; name: string; ownerEmail: string } | null> {
  const verified = await verifyDashboardCredentials(email, password);
  if (!verified || verified.role !== 'OWNER') return null;
  return {
    id: verified.tenantId,
    name: verified.tenantName,
    ownerEmail: verified.email,
  };
}

// ─── Verify API Key (alternative owner login) ─────────────────────

export async function verifyApiKey(
  apiKey: string
): Promise<{ id: string; name: string; ownerName?: string | null; ownerEmail: string } | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { apiKey: apiKey.trim() },
    select: {
      id: true,
      name: true,
      ownerName: true,
      ownerEmail: true,
      status: true,
    },
  });

  if (!tenant) return null;

  if (tenant.status === 'SUSPENDED' || tenant.status === 'CHURNED') {
    throw new Error(`Account is ${tenant.status.toLowerCase()}`);
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: tenant.id,
    name: tenant.name,
    ownerName: tenant.ownerName,
    ownerEmail: tenant.ownerEmail,
  };
}

// ─── Get Usage Stats ──────────────────────────────────────────────

export interface UsageStats {
  messagesUsed: number;
  messageLimit: number;
  plan: string;
  status: string;
  whatsappConnected: boolean;
}

export async function getUsageStats(tenantId: string): Promise<UsageStats> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      monthlyMessageCount: true,
      monthlyMessageLimit: true,
      plan: true,
      status: true,
      evolutionInstanceId: true,
    },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  return {
    messagesUsed: tenant.monthlyMessageCount,
    messageLimit: tenant.monthlyMessageLimit,
    plan: tenant.plan,
    status: tenant.status,
    whatsappConnected: !!tenant.evolutionInstanceId,
  };
}
