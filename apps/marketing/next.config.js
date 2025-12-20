const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/i18n'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zdnypksjqnhtiblwdaic.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Core pages
      { source: '/coaching', destination: '/en/coaching', permanent: true },
      { source: '/premium', destination: '/en/premium', permanent: true },
      { source: '/alumni', destination: '/en/alumni', permanent: true },
      { source: '/careers', destination: '/en/careers', permanent: true },

      // Study guide pages
      { source: '/nata-syllabus-subjects', destination: '/en/nata-syllabus', permanent: true },
      { source: '/nata-preparation-guide', destination: '/en/nata-preparation-guide', permanent: true },
      { source: '/nata-important-questions', destination: '/en/nata-important-questions', permanent: true },
      { source: '/jee-paper-2-preparation', destination: '/en/jee-paper-2-preparation', permanent: true },
      { source: '/best-books-nata-jee', destination: '/en/best-books-nata-jee', permanent: true },
      { source: '/how-to-score-150-in-nata', destination: '/en/how-to-score-150-in-nata', permanent: true },

      // Resource pages
      { source: '/freebooks', destination: '/en/free-resources', permanent: true },
      { source: '/previous-year-papers', destination: '/en/previous-year-papers', permanent: true },
      { source: '/nata-cutoff-calculator', destination: '/en/tools/cutoff-calculator', permanent: true },

      // Coaching program pages
      { source: '/nata-coaching-online', destination: '/en/coaching/nata-coaching', permanent: true },
      { source: '/jee-paper-2-coaching', destination: '/en/courses/jee-paper-2-coaching', permanent: true },

      // Blog pages
      { source: '/blog', destination: '/en/blog', permanent: true },
      { source: '/blog/:slug', destination: '/en/blog/:slug', permanent: true },

      // Legal pages
      { source: '/privacy', destination: '/en/privacy', permanent: true },
      { source: '/terms', destination: '/en/terms', permanent: true },

      // Application redirect to tools app
      { source: '/application', destination: 'https://app.neramclasses.com/apply', permanent: true },
      { source: '/applicationform', destination: 'https://app.neramclasses.com/apply', permanent: true },

      // Location page redirects (old format to new format)
      { source: '/nata-coaching-chennai', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-chennai', permanent: true },
      { source: '/nata-coaching-bangalore', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-bangalore', permanent: true },
      { source: '/nata-coaching-coimbatore', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-coimbatore', permanent: true },
      { source: '/nata-coaching-madurai', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-madurai', permanent: true },
      { source: '/nata-coaching-trichy', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-trichy', permanent: true },
      { source: '/nata-coaching-hyderabad', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-hyderabad', permanent: true },
      { source: '/nata-coaching-mumbai', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-mumbai', permanent: true },
      { source: '/nata-coaching-pune', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-pune', permanent: true },
      { source: '/nata-coaching-delhi', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-delhi', permanent: true },
      { source: '/nata-coaching-kolkata', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-kolkata', permanent: true },
      { source: '/nata-coaching-dubai', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-dubai', permanent: true },
      { source: '/nata-coaching-kochi', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-kochi', permanent: true },

      // Catch-all for old location format
      { source: '/nata-coaching-:city', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-:city', permanent: true },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
