// Redeploy 2026-04-06
const defaultRuntimeCaching = require('next-pwa/cache');

// NetworkOnly denylist for auth/reCAPTCHA/Firebase hosts. The PWA service worker
// must NEVER cache these: a stale Google reCAPTCHA or Firebase auth script breaks
// phone verification ("recaptcha keeps asking but never enables"). This rule is
// placed FIRST so Workbox matches it before the default catch-all.
const authNetworkOnly = {
  urlPattern: ({ url }) => {
    const h = url.hostname;
    const p = url.pathname;
    return (
      (h === 'www.google.com' && p.startsWith('/recaptcha')) ||
      (h === 'www.gstatic.com' && p.includes('recaptcha')) ||
      h === 'apis.google.com' ||
      h.endsWith('.googleapis.com') || // identitytoolkit, securetoken
      h.endsWith('.firebaseapp.com') || // authDomain helper iframe
      h.endsWith('.firebaseio.com')
    );
  },
  handler: 'NetworkOnly',
};

// NOTE: apps/app/public/sw.js + workbox-*.js are GENERATED artifacts. After
// changing this config, rebuild (pnpm build) so the new rule is baked in, then
// commit the regenerated sw.js.
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [authNetworkOnly, ...defaultRuntimeCaching],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  typescript: {
    // Supabase generated types are out of sync with actual DB schema
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/auth', '@neram/i18n'],
  async rewrites() {
    return [
      {
        source: '/.well-known/assetlinks.json',
        destination: '/api/assetlinks',
      },
    ];
  },
  async redirects() {
    return [
      { source: '/tools/cutoff-calculator', destination: '/tools/nata/cutoff-calculator', permanent: true },
      { source: '/tools/college-predictor', destination: '/tools/nata/college-predictor', permanent: true },
      { source: '/tools/exam-centers', destination: '/tools/nata/exam-centers', permanent: true },
      { source: '/tools/josaa-predictor', destination: '/tools/counseling/josaa-predictor', permanent: true },
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
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
