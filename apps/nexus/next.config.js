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
  async redirects() {
    return [
      {
        // The Class Recaps list moved into the catch-up workspace. Kept as a
        // redirect because the URL is bookmarked and linked from older
        // notifications.
        //
        // Here rather than as a page calling redirect(): a page in this app
        // prerenders, so it would answer 200 and hop on the client, and it would
        // cost a render on every hit. This is a real 308 resolved before any
        // function runs. `source` matches the exact path only, so the recap
        // EDITOR at /teacher/class-recaps/[recapId] is untouched.
        source: '/teacher/class-recaps',
        destination: '/teacher/catch-up?tab=classes',
        permanent: true,
      },
    ];
  },
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
