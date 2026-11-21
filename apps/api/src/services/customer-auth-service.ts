import crypto from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { prisma } from '@wcos/db';
import { getRedisCacheConnection } from '@wcos/queue';
import { computeHmacSha256, timingSafeCompare } from '@wcos/crypto';
import { config } from '../config.js';
import { EvolutionService } from './evolution-service.js';

const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_RATE_LIMIT_SECONDS = 600; // 10 minutes
const MAX_OTP_PER_WINDOW = 3;
const MAX_ATTEMPTS = 3;
const MAGIC_LINK_TTL_SECONDS = 900; // 15 minutes
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
   * Strictly resolves an ACTIVE tenant by slug, UUID id, WhatsApp instance name, or custom domain.
   */
  static async resolveTenant(identifier: string) {
    const raw = (identifier || '').trim();
    const normalized = raw.toLowerCase();
    if (!normalized) {
      throw new Error('Store identifier is required');
    }

    const orClauses: any[] = [
      { slug: normalized },
      { whatsappInstanceName: raw },
      { customDomain: normalized },
    ];
    if (UUID_REGEX.test(raw)) {
      orClauses.push({ id: raw });
    }

    const tenant = await prisma.tenant.findFirst({
      where: {
        status: 'ACTIVE',
        OR: orClauses,
      },
    });

    if (!tenant) {
      throw new Error(`Active store with identifier "${identifier}" not found`);
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

    const existingCustomer = await prisma.customer.findUnique({
      where: { tenantId_phone: { tenantId: tenant.id, phone } },
      select: { riskStatus: true },
    });
    if (existingCustomer?.riskStatus === 'BLOCKED') {
      throw new Error('This account has been restricted. Please contact store support.');
    }

    const redis = getRedisCacheConnection();
    const rateKey = `otp:rate:${tenant.id}:${phone}`;
    const requestCount = await redis.incr(rateKey);

    if (requestCount === 1) {
      await redis.expire(rateKey, OTP_RATE_LIMIT_SECONDS);
    }

    if (requestCount > MAX_OTP_PER_WINDOW) {
      const ttl = await redis.ttl(rateKey);
      throw new Error(`Too many verification attempts. Please wait ${Math.ceil(Math.max(1, ttl) / 60)} minute(s) before requesting again.`);
    }

    // Generate cryptographically random 6-digit OTP and server-keyed HMAC digest
    const otp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = computeHmacSha256(`${tenant.id}:${phone}:${otp}`, config.JWT_SECRET);

    const otpKey = `otp:${tenant.id}:${phone}`;
    const attemptsKey = `otp:attempts:${tenant.id}:${phone}`;
    await redis.set(otpKey, hashedOtp, 'EX', OTP_TTL_SECONDS);
    await redis.set(attemptsKey, '0', 'EX', OTP_TTL_SECONDS);

    const message = `*${otp}* is your verification code for *${tenant.name}*.\n\n` +
      `Valid for 5 minutes. Enter this code on the website to securely access your orders and private boutique bag.\n\n` +
      `_Do not share this code with anyone._`;

    await EvolutionService.sendTextMessage(tenant.whatsappInstanceName, phone, message);

    // Strictly log plaintext OTP only in explicit non-production local environments
    if (config.NODE_ENV !== 'production') {
      console.log(`[DEV-WHATSAPP-OTP] Store: ${tenant.name} | Phone: +${phone} | OTP: ${otp}`);
    }

    return {
      success: true,
      expiresIn: OTP_TTL_SECONDS,
      phoneMasked: `+${phone.slice(0, 2)}••••••${phone.slice(-4)}`,
    };
  }

  /**
   * Verifies the 6-digit OTP atomically (prevents concurrent brute-force races)
   * and generates an authenticated customer session.
   */
  static async verifyOtp(tenantSlug: string, rawPhone: string, code: string) {
    const tenant = await this.resolveTenant(tenantSlug);
    const phone = this.cleanPhone(rawPhone);

    const redis = getRedisCacheConnection();
    const otpKey = `otp:${tenant.id}:${phone}`;
    const attemptsKey = `otp:attempts:${tenant.id}:${phone}`;

    const storedHash = await redis.get(otpKey);
    if (!storedHash) {
      throw new Error('Verification code has expired or is invalid. Please request a new code.');
    }

    // Atomic Redis INCR eliminates parallel brute-force race conditions
    const attemptNum = await redis.incr(attemptsKey);
    if (attemptNum === 1) {
      const ttl = await redis.ttl(otpKey);
      if (ttl > 0) await redis.expire(attemptsKey, ttl);
    }

    if (attemptNum > MAX_ATTEMPTS) {
      await redis.del(otpKey, attemptsKey);
      throw new Error('Maximum verification attempts exceeded. Please request a new code.');
    }

    const providedHash = computeHmacSha256(
      `${tenant.id}:${phone}:${code.trim()}`,
      config.JWT_SECRET
    );

    if (!timingSafeCompare(providedHash, storedHash)) {
      const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptNum);
      if (attemptsLeft === 0) {
        await redis.del(otpKey, attemptsKey);
      }
      throw new Error(`Incorrect verification code. ${attemptsLeft} attempt(s) remaining.`);
    }

    // OTP matched! Clean up Redis keys immediately
    await redis.del(otpKey, attemptsKey);

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

    if (customer?.riskStatus === 'BLOCKED') {
      throw new Error('This account has been restricted. Please contact store support.');
    }

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

    await prisma.order.updateMany({
      where: {
        tenantId: tenant.id,
        customerPhone: { in: phoneVariants },
      },
      data: {
        customerId: customer.id,
      },
    });

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
   * Creates a strictly single-use 15-minute magic login link token tracked by Redis jti.
   */
  static async createMagicLinkToken(
    tenantId: string,
    phone: string,
    redirectPath = '/account'
  ): Promise<string> {
    const cleanNumber = this.cleanPhone(phone);
    const jti = crypto.randomUUID();
    const redis = getRedisCacheConnection();
    await redis.set(`magic:jti:${jti}`, `${tenantId}:${cleanNumber}`, 'EX', MAGIC_LINK_TTL_SECONDS);

    return new SignJWT({
      tenantId,
      phone: cleanNumber,
      redirectPath,
      jti,
      type: 'magic_login',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${MAGIC_LINK_TTL_SECONDS}s`)
      .sign(getSecretKey());
  }

  /**
   * Resolves and atomically consumes a single-use magic login link token.
   */
  static async resolveMagicLinkToken(token: string) {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload['type'] !== 'magic_login' || typeof payload['jti'] !== 'string') {
      throw new Error('Invalid magic token');
    }

    const tenantId = payload['tenantId'] as string;
    const phone = payload['phone'] as string;
    const jti = payload['jti'] as string;

    // Single-use enforcement: DEL returns 1 only for the first caller
    const redis = getRedisCacheConnection();
    const consumed = await redis.del(`magic:jti:${jti}`);
    if (consumed !== 1) {
      throw new Error('Magic login link has already been used or expired');
    }

    // Verify tenant is ACTIVE
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!tenant) {
      throw new Error('Store is currently inactive');
    }

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

    if (customer.riskStatus === 'BLOCKED') {
      throw new Error('This account has been restricted');
    }

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
      redirectPath:
        typeof payload['redirectPath'] === 'string' && payload['redirectPath'].startsWith('/')
          ? payload['redirectPath']
          : '/account',
    };
  }
}
