import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from root if not already loaded
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/wcos_dev'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ENCRYPTION_MASTER_KEY: z
    .string()
    .length(64, 'ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes)')
    .default('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
  EVOLUTION_API_GLOBAL_KEY: z.string().default('429683C4C97CA36CA8211152D4C54'),
  ADMIN_API_KEY: z.string().default('wcos-admin-secret-key-change-in-production'),
  APP_BASE_URL: z.string().default('http://localhost:3002'),
});

export type Config = z.infer<typeof EnvSchema>;

function loadConfig(): Config {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:\n', JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const config = loadConfig();
