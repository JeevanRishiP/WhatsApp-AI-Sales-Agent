/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace packages so Next.js can process them
  transpilePackages: ['@wcos/db', '@wcos/types'],

  // Enable server actions
  experimental: {
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
