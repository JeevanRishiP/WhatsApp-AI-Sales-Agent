// ╔═══════════════════════════════════════════════════════════════╗
// ║  Data Access Layer — Settings                                 ║
// ║                                                               ║
// ║  Tenant profile and bot persona management.                   ║
// ║  Every query is scoped to tenantId.                           ║
// ╚═══════════════════════════════════════════════════════════════╝

import { prisma, type Prisma, type Tenant } from '@wcos/db';
import { compare, hash } from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

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
  if (input.ownerEmail !== undefined) data.ownerEmail = input.ownerEmail;
  if (input.businessCategory !== undefined) data.businessCategory = input.businessCategory;

  return prisma.tenant.update({
    where: { id: tenantId },
    data,
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
    data.whatsappPhoneNumber = input.whatsappPhoneNumber.trim() || null;
  }
  if (input.whatsappInstanceName !== undefined && input.whatsappInstanceName.trim()) {
    data.whatsappInstanceName = input.whatsappInstanceName.trim();
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
  priorityList: AiModelEntry[];
}

export async function updateAiConfig(
  tenantId: string,
  config: AiConfigInput
): Promise<Tenant> {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      aiConfig: config as unknown as Prisma.InputJsonValue,
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
  if (!cfg || !cfg.priorityList) return null;
  return cfg as AiConfigInput;
}

// ─── Change Password ──────────────────────────────────────────────

export async function changePassword(
  tenantId: string,
  currentPassword: string | null,
  newPassword: string
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { passwordHash: true },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  // If tenant has a password, verify current password
  if (tenant.passwordHash) {
    if (!currentPassword) {
      throw new Error('Current password is required');
    }
    const valid = await compare(currentPassword, tenant.passwordHash);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }
  }

  // Hash and store new password
  const passwordHash = await hash(newPassword, BCRYPT_ROUNDS);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { passwordHash },
  });
}

// ─── Verify Password (for login) ─────────────────────────────────

export async function verifyTenantCredentials(
  email: string,
  password: string
): Promise<{ id: string; name: string; ownerEmail: string } | null> {
  const tenant = await prisma.tenant.findFirst({
    where: { ownerEmail: email },
    select: {
      id: true,
      name: true,
      ownerEmail: true,
      passwordHash: true,
      status: true,
    },
  });

  if (!tenant) return null;

  // Check account status
  if (tenant.status === 'SUSPENDED' || tenant.status === 'CHURNED') {
    throw new Error(`Account is ${tenant.status.toLowerCase()}`);
  }

  // Verify password
  if (!tenant.passwordHash) {
    throw new Error('Password not set. Please login with your API key and set a password.');
  }

  const valid = await compare(password, tenant.passwordHash);
  if (!valid) return null;

  // Update last login
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: tenant.id,
    name: tenant.name,
    ownerEmail: tenant.ownerEmail,
  };
}

// ─── Verify API Key (alternative login) ───────────────────────────

export async function verifyApiKey(
  apiKey: string
): Promise<{ id: string; name: string; ownerEmail: string } | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { apiKey },
    select: {
      id: true,
      name: true,
      ownerEmail: true,
      status: true,
    },
  });

  if (!tenant) return null;

  if (tenant.status === 'SUSPENDED' || tenant.status === 'CHURNED') {
    throw new Error(`Account is ${tenant.status.toLowerCase()}`);
  }

  // Update last login
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: tenant.id,
    name: tenant.name,
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
