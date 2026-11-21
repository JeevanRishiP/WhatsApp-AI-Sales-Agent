import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

function ensureDatabaseEnv(): string | undefined {
  if (process.env['DATABASE_URL']) {
    return process.env['DATABASE_URL'];
  }

  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];

  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(
      path.resolve(here, '../../.env'),
      path.resolve(here, '../../../.env'),
      path.resolve(here, '../../../../.env')
    );
  } catch {
    // Bundled environments may not expose a file:// import.meta.url
  }

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      if (process.env['DATABASE_URL']) {
        break;
      }
    }
  }

  return process.env['DATABASE_URL'];
}

/**
 * Global Prisma 7 client singleton backed by @prisma/adapter-pg (PgBouncer-compatible).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = ensureDatabaseEnv();
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['error', 'warn']
        : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Executes a callback inside a transaction pinned to `app.current_tenant_id`
 * so PostgreSQL Row-Level Security (RLS) policies enforce hard DB isolation.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('Invalid tenantId for tenant database context');
  }
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

export type { PrismaClient };
export default prisma;
