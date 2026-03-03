/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Supabase generated types are out of sync with actual DB schema
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/auth'],
  images: {
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

module.exports = nextConfig;
