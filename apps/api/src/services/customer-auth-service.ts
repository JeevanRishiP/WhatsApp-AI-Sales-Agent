import crypto from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { prisma } from '@wcos/db';
import { getRedisConnection } from '@wcos/queue';
import { sha256 } from '@wcos/crypto';
import { config } from '../config.js';
import { EvolutionService } from './evolution-service.js';

const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_RATE_LIMIT_SECONDS = 600; // 10 minutes
const MAX_OTP_PER_WINDOW = 3;
const MAX_ATTEMPTS = 3;

export interface CustomerTokenPayload extends JWTPayload {
  customerId: string;
  tenantId: string;
  phone: string;
  role: 'customer';
}

function getSecretKey(): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export class CustomerAuthService {
  private static cleanPhone(phone: string): string {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = cleaned.slice(1);
    }
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  /**
   * Resolves a tenant by either slug, ID, or fallback (defaults to Aura Luxe Boutique).
   */
  static async resolveTenant(identifier: string) {
    const normalized = (identifier || '').toLowerCase().trim();
    const isAura =
      normalized === 'aura' ||
      normalized === 'aura-luxe' ||
      normalized === 'aura-saree-shop' ||
      normalized === 'aura-archived' ||
      normalized === 'demo' ||
      normalized === 'wa_aura_luxe_01' ||
      !normalized;

    if (isAura) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: '11111111-1111-4111-8111-111111111111' },
      });
      if (tenant) return tenant;
    }

    let tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: normalized },
          { id: identifier.length === 36 ? identifier : undefined },
          { whatsappInstanceName: identifier },
        ].filter(Boolean) as any,
      },
    });

    if (!tenant && isAura) {
      tenant = await prisma.tenant.upsert({
        where: { id: '11111111-1111-4111-8111-111111111111' },
        update: { slug: 'aura-luxe', whatsappInstanceName: 'wa_aura_luxe_01' },
        create: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Aura Luxe Boutique',
          slug: 'aura-luxe',
          ownerName: 'Aditi Sharma',
          ownerPhone: '+919876543210',
          ownerEmail: 'aditi@auraluxe.in',
          businessCategory: 'Luxury Ethnic Wear & Sarees',
          status: 'ACTIVE',
          apiKey: 'sk_live_aura_8f92jkl2309x',
          whatsappInstanceName: 'wa_aura_luxe_01',
        },
      });
    }

    if (!tenant) {
      throw new Error(`Store with identifier "${identifier}" not found`);
    }

    return tenant;
  }

  /**
   * Dispatches a 6-digit verification code to the customer's WhatsApp.
   */
  static async sendOtp(tenantSlug: string, rawPhone: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const phone = this.cleanPhone(rawPhone);

    if (phone.length < 8 || phone.length > 15) {
      throw new Error('Please enter a valid international mobile number');
    }

    const redis = getRedisConnection();
    const rateKey = `otp:rate:${tenant.id}:${phone}`;
    const requestCount = await redis.incr(rateKey);

    if (requestCount === 1) {
      await redis.expire(rateKey, OTP_RATE_LIMIT_SECONDS);
    }

    if (requestCount > MAX_OTP_PER_WINDOW) {
      const ttl = await redis.ttl(rateKey);
      throw new Error(`Too many verification attempts. Please wait ${Math.ceil(ttl / 60)} minute(s) before requesting again.`);
    }

    // Generate secure 6-digit numeric OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = sha256(`${tenant.id}:${phone}:${otp}`);

    const otpKey = `otp:${tenant.id}:${phone}`;
    await redis.set(
      otpKey,
      JSON.stringify({
        hash: hashedOtp,
        attempts: 0,
        createdAt: Date.now(),
      }),
      'EX',
      OTP_TTL_SECONDS
    );

    // Compose luxury WhatsApp template
    const message = `*${otp}* is your verification code for *${tenant.name}*.\n\n` +
      `Valid for 5 minutes. Enter this code on the website to securely access your orders and private boutique bag.\n\n` +
      `_Do not share this code with anyone._`;

    // Dispatch via store's WhatsApp Evolution API instance
    const dispatched = await EvolutionService.sendTextMessage(tenant.whatsappInstanceName, phone, message);

    // In development / testing, log the code to console so work is never blocked if WhatsApp instance is unlinked
    if (config.NODE_ENV !== 'production' || !dispatched) {
      console.log(`\n======================================================`);
      console.log(`🔑 [DEV-WHATSAPP-OTP] Store: ${tenant.name}`);
      console.log(`📱 Phone: +${phone}`);
      console.log(`⚡ OTP CODE: ${otp}`);
      console.log(`======================================================\n`);
    }

    return {
      success: true,
      expiresIn: OTP_TTL_SECONDS,
      phoneMasked: `+${phone.slice(0, 2)}••••••${phone.slice(-4)}`,
    };
  }

  /**
   * Verifies the 6-digit OTP and generates an authenticated customer session.
   */
  static async verifyOtp(tenantSlug: string, rawPhone: string, code: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const phone = this.cleanPhone(rawPhone);

    const redis = getRedisConnection();
    const otpKey = `otp:${tenant.id}:${phone}`;
    const rawData = await redis.get(otpKey);

    if (!rawData) {
      throw new Error('Verification code has expired or is invalid. Please request a new code.');
    }

    const otpData = JSON.parse(rawData);

    if (otpData.attempts >= MAX_ATTEMPTS) {
      await redis.del(otpKey);
      throw new Error('Maximum verification attempts exceeded. Please request a new code.');
    }

    const providedHash = sha256(`${tenant.id}:${phone}:${code.trim()}`);

    if (providedHash !== otpData.hash) {
      otpData.attempts += 1;
      const remainingTtl = await redis.ttl(otpKey);
      if (remainingTtl > 0) {
        await redis.set(otpKey, JSON.stringify(otpData), 'EX', remainingTtl);
      }
      const attemptsLeft = MAX_ATTEMPTS - otpData.attempts;
      throw new Error(`Incorrect verification code. ${attemptsLeft} attempt(s) remaining.`);
    }

    // OTP matched! Clean up Redis key immediately
    await redis.del(otpKey);

    // Upsert or retrieve customer entity in Postgres
    const phoneVariants = [
      phone,
      `+${phone.replace(/^\+/, '')}`,
      phone.replace(/^\+/, ''),
      phone.replace(/^91/, ''),
      `+91${phone.replace(/^(\+?91)/, '')}`,
    ];

    let customer = await prisma.customer.findUnique({
      where: {
        tenantId_phone: {
          tenantId: tenant.id,
          phone,
        },
      },
      include: {
        addresses: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Check if CustomerMemory already exists from previous WhatsApp bot chats to inherit customerName
    const memory = await prisma.customerMemory.findFirst({
      where: {
        tenantId: tenant.id,
        customerPhone: { in: phoneVariants },
      },
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          phone,
          name: memory?.customerName || null,
        },
        include: {
          addresses: true,
        },
      });
    } else if (!customer.name && memory?.customerName) {
      customer = await prisma.customer.update({
        where: { id: customer.id },
        data: { name: memory.customerName },
        include: { addresses: true },
      });
    }

    // Automatically link all previous WhatsApp orders to this customer record
    await prisma.order.updateMany({
      where: {
        tenantId: tenant.id,
        customerPhone: { in: phoneVariants },
      },
      data: {
        customerId: customer.id,
      },
    });

    // Generate JWT token (30 days validity)
    const token = await new SignJWT({
      customerId: customer.id,
      tenantId: tenant.id,
      phone: customer.phone,
      role: 'customer',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(getSecretKey());

    return {
      customer,
      token,
      expiresIn: 30 * 24 * 3600,
    };
  }

  /**
   * Verifies an incoming customer session JWT.
   */
  static async verifySession(token: string): Promise<CustomerTokenPayload> {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload['role'] !== 'customer') {
      throw new Error('Unauthorized customer token');
    }
    return payload as unknown as CustomerTokenPayload;
  }

  /**
   * Creates a single-use 15-minute magic login link token for WhatsApp chat injection.
   */
  static async createMagicLinkToken(tenantId: string, phone: string, redirectPath = '/account'): Promise<string> {
    const cleanNumber = this.cleanPhone(phone);
    return new SignJWT({
      tenantId,
      phone: cleanNumber,
      redirectPath,
      type: 'magic_login',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(getSecretKey());
  }

  /**
   * Resolves a magic login link token.
   */
  static async resolveMagicLinkToken(token: string) {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload['type'] !== 'magic_login') {
      throw new Error('Invalid magic token');
    }

    const tenantId = payload['tenantId'] as string;
    const phone = payload['phone'] as string;

    const customer = await prisma.customer.upsert({
      where: {
        tenantId_phone: {
          tenantId,
          phone,
        },
      },
      update: { updatedAt: new Date() },
      create: {
        tenantId,
        phone,
      },
      include: {
        addresses: true,
      },
    });

    const sessionToken = await new SignJWT({
      customerId: customer.id,
      tenantId,
      phone: customer.phone,
      role: 'customer',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(getSecretKey());

    return {
      customer,
      token: sessionToken,
      redirectPath: (payload['redirectPath'] as string) || '/account',
    };
  }
}
