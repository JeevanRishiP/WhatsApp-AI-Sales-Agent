import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

const WorkerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/wcos_dev'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ENCRYPTION_MASTER_KEY: z
    .string()
    .length(64)
    .default('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'),
  EVOLUTION_API_URL: z.string().default('http://localhost:8080'),
  EVOLUTION_API_GLOBAL_KEY: z.string().default('429683C4C97CA36CA8211152D4C54'),
  APP_BASE_URL: z.string().default('http://localhost:3002'),
  // AI Keys & Ollama
  USE_LOCAL_LLM: z.string().default('true'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434/v1'),
  OLLAMA_MODEL: z.string().default('gemma3:27b'),
  OLLAMA_FALLBACK_MODEL: z.string().default('gemma3:4b'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().default('https://cloud.langfuse.com'),
});

export type WorkerConfig = z.infer<typeof WorkerEnvSchema>;

function loadWorkerConfig(): WorkerConfig {
  const parsed = WorkerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Worker config error:\n', JSON.stringify(parsed.error.format(), null, 2));
    throw new Error('Invalid worker environment configuration');
  }
  return parsed.data;
}

export const config = loadWorkerConfig();
