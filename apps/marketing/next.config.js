const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Supabase generated types are out of sync with actual DB schema
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/i18n', '@neram/auth'],
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
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // City-specific coaching pages — MUST be first (more specific than /coaching)
      // Old sitemap had /coaching/{city} for 100+ cities; new URL is deeper
      { source: '/coaching/:city', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-:city', permanent: true },

      // Core pages
      { source: '/coaching', destination: '/en/coaching', permanent: true },
      { source: '/premium', destination: '/en/premium', permanent: true },
      { source: '/alumni', destination: '/en/alumni', permanent: true },
      { source: '/careers', destination: '/en/careers', permanent: true },
      { source: '/askSeniors', destination: '/en/alumni', permanent: true },
      { source: '/settings', destination: 'https://app.neramclasses.com/settings', permanent: true },

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

      // Blog posts that were renamed (old slug had -online suffix, new site dropped it)
      { source: '/blog/best-nata-coaching-chennai-online', destination: '/en/blog/best-nata-coaching-chennai', permanent: true },
      { source: '/blog/best-nata-coaching-coimbatore-online', destination: '/en/blog/best-nata-coaching-coimbatore', permanent: true },
      { source: '/blog/best-nata-coaching-madurai-online', destination: '/en/blog/best-nata-coaching-madurai', permanent: true },
      { source: '/blog/best-nata-coaching-trichy-online', destination: '/en/blog/best-nata-coaching-trichy', permanent: true },
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

      // Old JEE/NATA content pages (from WordPress era)
      { source: '/jee-paper-2-formula-sheet', destination: '/en/jee-paper-2-preparation', permanent: true },
      { source: '/jee-paper-2-mock-test-series', destination: '/en/jee-paper-2-preparation', permanent: true },
      { source: '/jee-paper-2-mathematics-syllabus', destination: '/en/jee-paper-2-preparation', permanent: true },
      { source: '/nata-jee-batch-combined-preparation', destination: '/en/courses', permanent: true },
      { source: '/nata-exam-questions', destination: '/en/nata-important-questions', permanent: true },
      { source: '/how-to-score-99-percentile-jee-batch', destination: '/en/how-to-score-150-in-nata', permanent: true },
      { source: '/nata-app-url', destination: '/en/courses', permanent: true },
      { source: '/nata-drawing-url', destination: '/en/nata-important-questions', permanent: true },
      { source: '/nata-question-url', destination: '/en/nata-important-questions', permanent: true },
      { source: '/nata-aptitude-url', destination: '/en/nata-important-questions', permanent: true },
      { source: '/nata-paper-2-url', destination: '/en/jee-paper-2-preparation', permanent: true },
      { source: '/online-coaching-url', destination: '/en/coaching/nata-coaching', permanent: true },
      { source: '/contact-us-url', destination: '/en/contact', permanent: true },
      { source: '/speed-url', destination: '/en/coaching/nata-coaching', permanent: true },

      // Old WordPress content paths
      { source: '/NATA-coaching-centers-nearby/:path*', destination: '/en/coaching/nata-coaching', permanent: true },
      { source: '/NATA_Coaching_center_near_me_address/:path*', destination: '/en/coaching/nata-coaching', permanent: true },
      { source: '/Application-form-Nata-Coaching', destination: 'https://app.neramclasses.com/apply', permanent: true },
      { source: '/Free-Nata-Class-books-online-registration', destination: '/en/free-resources', permanent: true },
      { source: '/nata-cutoff-calculator-url/:path*', destination: '/en/tools/cutoff-calculator', permanent: true },
      { source: '/FAQs-nata-exam-questions', destination: '/en/nata-important-questions', permanent: true },
      { source: '/JEE_B.arch_Syllabus', destination: '/en/nata-syllabus', permanent: true },
      { source: '/NATA_Best_Architecture_Colleges', destination: '/en/courses', permanent: true },
      { source: '/NATA_Free_Books', destination: '/en/free-resources', permanent: true },
      { source: '/about', destination: '/en/about', permanent: true },
      { source: '/contact', destination: '/en/contact', permanent: true },

      // Old city URLs with -url suffix — specific cities first, then catch-all
      { source: '/trichy-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-trichy', permanent: true },
      { source: '/madurai-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-madurai', permanent: true },
      { source: '/salem-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-salem', permanent: true },
      { source: '/erode-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-erode', permanent: true },
      { source: '/bangalore-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-bangalore', permanent: true },
      { source: '/hyderabad-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-hyderabad', permanent: true },
      { source: '/delhi-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-delhi', permanent: true },
      { source: '/cochin-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-kochi', permanent: true },
      { source: '/vizag-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-visakhapatnam', permanent: true },
      { source: '/tirunelveli-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-tirunelveli', permanent: true },
      { source: '/dindigul-url', destination: '/en/coaching/nata-coaching/nata-coaching-centers-in-dindigul', permanent: true },
      // Catch-all for remaining -url suffix patterns → coaching hub
      { source: '/:slug(.*-url)', destination: '/en/coaching/nata-coaching', permanent: true },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
