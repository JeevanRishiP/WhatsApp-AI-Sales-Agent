import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const DEV_MASTER_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const DEV_EVOLUTION_KEY = '429683C4C97CA36CA8211152D4C54';

const WorkerRawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  REDIS_QUEUE_URL: z.string().optional(),
  REDIS_CACHE_URL: z.string().optional(),
  ENCRYPTION_MASTER_KEY: z.string().optional(),
  MASTER_ENCRYPTION_KEY: z.string().optional(),
  EVOLUTION_API_URL: z.string().default('http://localhost:8080'),
  EVOLUTION_API_GLOBAL_KEY: z.string().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  APP_BASE_URL: z.string().default('http://localhost:3002'),
  USE_LOCAL_LLM: z.string().default('false'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434/v1'),
  OLLAMA_MODEL: z.string().default('gemma3:27b'),
  OLLAMA_FALLBACK_MODEL: z.string().default('gemma3:4b'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().default('https://cloud.langfuse.com'),
});

export interface WorkerConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  DATABASE_URL: string;
  REDIS_URL: string;
  REDIS_QUEUE_URL: string;
  REDIS_CACHE_URL: string;
  ENCRYPTION_MASTER_KEY: string;
  EVOLUTION_API_URL: string;
  EVOLUTION_API_GLOBAL_KEY: string;
  APP_BASE_URL: string;
  USE_LOCAL_LLM: string;
  OLLAMA_BASE_URL: string;
  OLLAMA_MODEL: string;
  OLLAMA_FALLBACK_MODEL: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  LANGFUSE_PUBLIC_KEY?: string;
  LANGFUSE_SECRET_KEY?: string;
  LANGFUSE_HOST: string;
}

function loadWorkerConfig(): WorkerConfig {
  const parsed = WorkerRawEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Worker config error:\n', JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid worker environment configuration');
  }

  const raw = parsed.data;
  const isProd = raw.NODE_ENV === 'production';

  const databaseUrl = raw.DATABASE_URL;
  const redisUrl = raw.REDIS_URL || 'redis://localhost:6379';
  const encryptionMasterKey = raw.ENCRYPTION_MASTER_KEY || raw.MASTER_ENCRYPTION_KEY;
  const evolutionKey = raw.EVOLUTION_API_GLOBAL_KEY || raw.EVOLUTION_API_KEY;
  const geminiKey =
    raw.GEMINI_API_KEY || raw.GOOGLE_AI_API_KEY || raw.GOOGLE_GENERATIVE_AI_API_KEY;

  if (isProd) {
    const errors: string[] = [];
    if (!databaseUrl) errors.push('DATABASE_URL is required in production');
    if (!raw.REDIS_URL && !raw.REDIS_QUEUE_URL) errors.push('REDIS_URL or REDIS_QUEUE_URL is required in production');
    if (!encryptionMasterKey || !/^[0-9a-fA-F]{64}$/.test(encryptionMasterKey) || encryptionMasterKey === DEV_MASTER_KEY) {
      errors.push('ENCRYPTION_MASTER_KEY must be a unique 64-character hex string in production');
    }
    if (!evolutionKey || evolutionKey === DEV_EVOLUTION_KEY) {
      errors.push('EVOLUTION_API_GLOBAL_KEY must be set in production');
    }
    if (errors.length > 0) {
      throw new Error(`FATAL worker production config errors:\n- ${errors.join('\n- ')}`);
    }
  }

  return {
    NODE_ENV: raw.NODE_ENV,
    LOG_LEVEL: raw.LOG_LEVEL,
    DATABASE_URL: databaseUrl || 'postgresql://postgres:postgres@localhost:5432/wcos_dev',
    REDIS_URL: redisUrl,
    REDIS_QUEUE_URL: raw.REDIS_QUEUE_URL || redisUrl,
    REDIS_CACHE_URL: raw.REDIS_CACHE_URL || redisUrl,
    ENCRYPTION_MASTER_KEY: encryptionMasterKey || DEV_MASTER_KEY,
    EVOLUTION_API_URL: raw.EVOLUTION_API_URL,
    EVOLUTION_API_GLOBAL_KEY: evolutionKey || DEV_EVOLUTION_KEY,
    APP_BASE_URL: raw.APP_BASE_URL,
    USE_LOCAL_LLM: raw.USE_LOCAL_LLM,
    OLLAMA_BASE_URL: raw.OLLAMA_BASE_URL,
    OLLAMA_MODEL: raw.OLLAMA_MODEL,
    OLLAMA_FALLBACK_MODEL: raw.OLLAMA_FALLBACK_MODEL,
    OPENAI_API_KEY: raw.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: raw.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: geminiKey,
    GROQ_API_KEY: raw.GROQ_API_KEY,
    LANGFUSE_PUBLIC_KEY: raw.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: raw.LANGFUSE_SECRET_KEY,
    LANGFUSE_HOST: raw.LANGFUSE_HOST,
  };
}

export const config = loadWorkerConfig();
