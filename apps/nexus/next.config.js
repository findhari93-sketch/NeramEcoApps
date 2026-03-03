/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/auth'],
  images: {
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

module.exports = nextConfig;
