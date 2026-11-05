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
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;

