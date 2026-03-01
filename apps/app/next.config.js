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
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/auth', '@neram/i18n'],
  async redirects() {
    return [
      { source: '/tools/cutoff-calculator', destination: '/tools/nata/cutoff-calculator', permanent: true },
      { source: '/tools/college-predictor', destination: '/tools/nata/college-predictor', permanent: true },
      { source: '/tools/exam-centers', destination: '/tools/nata/exam-centers', permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zdnypksjqnhtiblwdaic.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
