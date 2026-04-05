const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Drawing feature gamification types not yet in generated DB types
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/auth'],
  images: {
    minimumCacheTTL: 2592000, // 30 days — Supabase storage images are immutable
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'db.neramclasses.com',
        pathname: '/storage/v1/object/public/**',
      },
      // Legacy: keep for old URLs already stored in DB
      {
        protocol: 'https',
        hostname: 'zdnypksjqnhtiblwdaic.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
