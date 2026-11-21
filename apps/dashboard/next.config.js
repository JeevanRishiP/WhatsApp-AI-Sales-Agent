import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ensure Next.js loads monorepo root .env when running via `next dev` / `next start`
try {
  const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
  if (fs.existsSync(rootEnv) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(rootEnv);
  }
} catch {
  // Env vars already injected by runtime or Docker/hosting environment
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace packages so Next.js can process them
  transpilePackages: ['@wcos/db', '@wcos/types', '@wcos/payments'],

  // Enable server actions & keep native pg driver external
  experimental: {
    serverComponentsExternalPackages: ['pg', '@prisma/adapter-pg'],
    serverActions: {
      bodySizeLimit: '10mb', // for CSV imports
    },
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
