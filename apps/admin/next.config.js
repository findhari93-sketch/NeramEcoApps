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
    // Supabase generated types are out of sync with actual DB schema
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@neram/ai', '@neram/ui', '@neram/database', '@neram/auth'],
  experimental: {
    // Import only the modules a page uses from the shared barrels, instead of the
    // whole package (Nexus does the same, next.config.js "optimizePackageImports").
    optimizePackageImports: ['@neram/auth', '@neram/database', '@neram/ui'],
  },
  images: {
    minimumCacheTTL: 2592000, // 30 days — Supabase storage images are immutable
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'db.neramclasses.com',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'db-staging.neramclasses.com',
        pathname: '/storage/v1/object/public/**',
      },
      // Legacy: keep for old URLs already stored in DB
      {
        protocol: 'https',
        hostname: 'zdnypksjqnhtiblwdaic.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'hgxjavrsrvpihqrpezdh.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
