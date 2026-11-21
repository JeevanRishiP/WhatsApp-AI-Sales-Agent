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
  transpilePackages: ['@wcos/db', '@wcos/types', '@wcos/queue', '@wcos/crypto'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['pg', '@prisma/adapter-pg'],
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
