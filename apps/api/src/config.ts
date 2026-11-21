import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from root if not already loaded
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const DEV_MASTER_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const DEV_EVOLUTION_KEY = '429683C4C97CA36CA8211152D4C54';
const DEV_JWT_SECRET = 'wcos-customer-jwt-dev-only-secret-change-in-prod-2026';
const DEV_ADMIN_KEY = 'wcos-admin-dev-only-key-change-in-prod';

const RawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  TRUST_PROXY: z.string().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  ENABLE_PAYMENT_SIMULATOR: z
    .enum(['true', 'false'])
    .default('false'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  REDIS_QUEUE_URL: z.string().optional(),
  REDIS_CACHE_URL: z.string().optional(),
  ENCRYPTION_MASTER_KEY: z.string().optional(),
  MASTER_ENCRYPTION_KEY: z.string().optional(),
  EVOLUTION_API_URL: z.string().default('http://localhost:8080'),
  EVOLUTION_API_GLOBAL_KEY: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_SECRET: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),
  APP_BASE_URL: z.string().default('http://localhost:3002'),
});

export interface Config {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  HOST: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  TRUST_PROXY: boolean | number;
  ALLOWED_ORIGINS: string[];
  ENABLE_PAYMENT_SIMULATOR: boolean;
  DATABASE_URL: string;
  REDIS_URL: string;
  REDIS_QUEUE_URL: string;
  REDIS_CACHE_URL: string;
  ENCRYPTION_MASTER_KEY: string;
  EVOLUTION_API_URL: string;
  EVOLUTION_API_GLOBAL_KEY: string;
  EVOLUTION_WEBHOOK_SECRET?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  JWT_SECRET: string;
  ADMIN_API_KEY: string;
  APP_BASE_URL: string;
}

function loadConfig(): Config {
  const parsed = RawEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:\n', JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid environment configuration');
  }

  const raw = parsed.data;
  const isProd = raw.NODE_ENV === 'production';

  const databaseUrl = raw.DATABASE_URL;
  const redisUrl = raw.REDIS_URL || 'redis://localhost:6379';
  const redisQueueUrl = raw.REDIS_QUEUE_URL || redisUrl;
  const redisCacheUrl = raw.REDIS_CACHE_URL || redisUrl;
  const encryptionMasterKey = raw.ENCRYPTION_MASTER_KEY || raw.MASTER_ENCRYPTION_KEY;
  const evolutionKey = raw.EVOLUTION_API_GLOBAL_KEY || raw.EVOLUTION_API_KEY;
  const jwtSecret = raw.JWT_SECRET;
  const adminKey = raw.ADMIN_API_KEY;

  if (isProd) {
    const errors: string[] = [];
    if (!databaseUrl) errors.push('DATABASE_URL is required in production');
    if (!raw.REDIS_URL && !raw.REDIS_QUEUE_URL) errors.push('REDIS_URL or REDIS_QUEUE_URL is required in production');
    if (!encryptionMasterKey || !/^[0-9a-fA-F]{64}$/.test(encryptionMasterKey) || encryptionMasterKey === DEV_MASTER_KEY) {
      errors.push('ENCRYPTION_MASTER_KEY must be a unique 64-character hex string in production');
    }
    if (!evolutionKey || evolutionKey === DEV_EVOLUTION_KEY) {
      errors.push('EVOLUTION_API_GLOBAL_KEY must be set to a non-default secret in production');
    }
    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret === DEV_JWT_SECRET) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
    if (!adminKey || adminKey.length < 24 || adminKey === DEV_ADMIN_KEY) {
      errors.push('ADMIN_API_KEY must be set (>= 24 chars) in production');
    }
    if (!raw.ALLOWED_ORIGINS) {
      errors.push('ALLOWED_ORIGINS must be explicitly configured in production');
    }
    if (errors.length > 0) {
      throw new Error(`FATAL production configuration errors:\n- ${errors.join('\n- ')}`);
    }
  }

  const allowedOrigins = (raw.ALLOWED_ORIGINS || 'http://localhost:3001,http://localhost:3005')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  let trustProxy: boolean | number = 1;
  if (raw.TRUST_PROXY === 'false') trustProxy = false;
  else if (raw.TRUST_PROXY === 'true') trustProxy = true;
  else if (raw.TRUST_PROXY && !Number.isNaN(Number(raw.TRUST_PROXY))) {
    trustProxy = Number(raw.TRUST_PROXY);
  }

  return {
    NODE_ENV: raw.NODE_ENV,
    PORT: raw.PORT,
    HOST: raw.HOST,
    LOG_LEVEL: raw.LOG_LEVEL,
    TRUST_PROXY: trustProxy,
    ALLOWED_ORIGINS: allowedOrigins,
    ENABLE_PAYMENT_SIMULATOR: raw.ENABLE_PAYMENT_SIMULATOR === 'true' && !isProd,
    DATABASE_URL: databaseUrl || 'postgresql://postgres:postgres@localhost:5432/wcos_dev',
    REDIS_URL: redisUrl,
    REDIS_QUEUE_URL: redisQueueUrl,
    REDIS_CACHE_URL: redisCacheUrl,
    ENCRYPTION_MASTER_KEY: encryptionMasterKey || DEV_MASTER_KEY,
    EVOLUTION_API_URL: raw.EVOLUTION_API_URL,
    EVOLUTION_API_GLOBAL_KEY: evolutionKey || DEV_EVOLUTION_KEY,
    EVOLUTION_WEBHOOK_SECRET: raw.EVOLUTION_WEBHOOK_SECRET,
    META_APP_SECRET: raw.META_APP_SECRET,
    META_VERIFY_TOKEN: raw.META_VERIFY_TOKEN,
    JWT_SECRET: jwtSecret || DEV_JWT_SECRET,
    ADMIN_API_KEY: adminKey || DEV_ADMIN_KEY,
    APP_BASE_URL: raw.APP_BASE_URL,
  };
}

export const config = loadConfig();
