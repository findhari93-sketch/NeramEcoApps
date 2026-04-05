// Redeploy 2026-04-06
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  typescript: {
    // Supabase generated types are out of sync with actual DB schema
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@neram/ui', '@neram/database', '@neram/i18n', '@neram/auth'],
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
          // Prevent Cloudflare CDN from caching HTML/RSC responses
          // (Cloudflare sits in front of Vercel and can serve stale RSC payloads on hard refresh)
          // Vercel's own ISR cache is unaffected by this header
          {
            key: 'CDN-Cache-Control',
            value: 'no-store',
          },
        ],
      },
      // noindex non-content utility pages (SSO, signout, enrollment, etc.)
      {
        source: '/(signout|sso|my-enrollment|enroll)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      // noindex non-English locale versions of hardcoded English content pages.
      // These pages have no real translations — Google sees them as duplicates of the
      // English version and reports "Duplicate, Google chose different canonical".
      {
        source: '/(ta|hi|kn|ml)/(nata-2026|blog|tools|nata-syllabus|nata-preparation-guide|nata-important-questions|jee-paper-2-preparation|best-books-nata-jee|how-to-score-150-in-nata|previous-year-papers|nata-app|best-nata-coaching-online)/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, follow' },
        ],
      },
      // Also catch the root-level (non-nested) versions of these paths
      {
        source: '/(ta|hi|kn|ml)/(nata-2026|blog|nata-syllabus|nata-preparation-guide|nata-important-questions|jee-paper-2-preparation|best-books-nata-jee|how-to-score-150-in-nata|previous-year-papers|nata-app|best-nata-coaching-online)',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, follow' },
        ],
      },
      // Cache static assets (images, fonts, SVGs) for 1 year
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/icons/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // www → non-www canonical redirect (SEO: prevent duplicate content)
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.neramclasses.com' }],
        destination: 'https://neramclasses.com/:path*',
        permanent: true,
      },

      // /en/* → /* redirect (English is default locale, no prefix needed)
      { source: '/en', destination: '/', permanent: true },
      { source: '/en/:path*', destination: '/:path*', permanent: true },

      // Old zombie page still indexed by Google
      { source: '/inner-page', destination: '/about', permanent: true },

      // City-specific coaching pages — MUST be first (more specific than /coaching)
      // Old sitemap had /coaching/{city} for 100+ cities; new URL is deeper
      // Exclude 'nata-coaching' to avoid catching the real page at /coaching/nata-coaching
      { source: '/coaching/:city((?!nata-coaching).*)', destination: '/coaching/nata-coaching/nata-coaching-centers-in-:city', permanent: true },

      // Core pages (coaching, premium, alumni, careers are handled natively by next-intl)
      { source: '/askSeniors', destination: '/alumni', permanent: true },
      { source: '/settings', destination: 'https://app.neramclasses.com/settings', permanent: true },

      // NATA 2026 spoke page short-URL redirects
      { source: '/:locale/nata-2026/photo-signature', destination: '/:locale/nata-2026/photo-signature-requirements', permanent: true },
      { source: '/:locale/nata-2026/scoring', destination: '/:locale/nata-2026/scoring-and-results', permanent: true },

      // Study guide pages (only redirects where source != destination)
      { source: '/nata-syllabus-subjects', destination: '/nata-syllabus', permanent: true },

      // Resource pages
      { source: '/freebooks', destination: '/free-resources', permanent: true },
      { source: '/nata-cutoff-calculator', destination: '/tools/cutoff-calculator', permanent: true },

      // Coaching program pages
      { source: '/nata-coaching-online', destination: '/coaching/nata-coaching', permanent: true },
      { source: '/jee-paper-2-coaching', destination: '/courses/jee-paper-2-coaching', permanent: true },

      // Blog post year update: 2025 → 2026
      { source: '/blog/nata-2025-preparation-strategy', destination: '/blog/nata-2026-preparation-strategy', permanent: true },

      // Blog posts that were renamed (old slug had -online suffix, new site dropped it)
      { source: '/blog/best-nata-coaching-chennai-online', destination: '/blog/best-nata-coaching-chennai', permanent: true },
      { source: '/blog/best-nata-coaching-coimbatore-online', destination: '/blog/best-nata-coaching-coimbatore', permanent: true },
      { source: '/blog/best-nata-coaching-madurai-online', destination: '/blog/best-nata-coaching-madurai', permanent: true },
      { source: '/blog/best-nata-coaching-trichy-online', destination: '/blog/best-nata-coaching-trichy', permanent: true },
      // /blog, /blog/:slug, /privacy, /terms are handled natively by next-intl (no redirect needed)

      // Application redirect to tools app
      { source: '/application', destination: 'https://app.neramclasses.com/apply', permanent: true },
      { source: '/applicationform', destination: 'https://app.neramclasses.com/apply', permanent: true },

      // Location page redirects (old format to new format)
      { source: '/nata-coaching-chennai', destination: '/coaching/nata-coaching/nata-coaching-centers-in-chennai', permanent: true },
      { source: '/nata-coaching-bangalore', destination: '/coaching/nata-coaching/nata-coaching-centers-in-bangalore', permanent: true },
      { source: '/nata-coaching-coimbatore', destination: '/coaching/nata-coaching/nata-coaching-centers-in-coimbatore', permanent: true },
      { source: '/nata-coaching-madurai', destination: '/coaching/nata-coaching/nata-coaching-centers-in-madurai', permanent: true },
      { source: '/nata-coaching-trichy', destination: '/coaching/nata-coaching/nata-coaching-centers-in-trichy', permanent: true },
      { source: '/nata-coaching-hyderabad', destination: '/coaching/nata-coaching/nata-coaching-centers-in-hyderabad', permanent: true },
      { source: '/nata-coaching-mumbai', destination: '/coaching/nata-coaching/nata-coaching-centers-in-mumbai', permanent: true },
      { source: '/nata-coaching-pune', destination: '/coaching/nata-coaching/nata-coaching-centers-in-pune', permanent: true },
      { source: '/nata-coaching-delhi', destination: '/coaching/nata-coaching/nata-coaching-centers-in-delhi', permanent: true },
      { source: '/nata-coaching-kolkata', destination: '/coaching/nata-coaching/nata-coaching-centers-in-kolkata', permanent: true },
      { source: '/nata-coaching-dubai', destination: '/coaching/nata-coaching/nata-coaching-centers-in-dubai', permanent: true },
      { source: '/nata-coaching-kochi', destination: '/coaching/nata-coaching/nata-coaching-centers-in-kochi', permanent: true },

      // Catch-all for old location format
      { source: '/nata-coaching-:city', destination: '/coaching/nata-coaching/nata-coaching-centers-in-:city', permanent: true },

      // Old JEE/NATA content pages (from WordPress era)
      { source: '/jee-paper-2-formula-sheet', destination: '/jee-paper-2-preparation', permanent: true },
      { source: '/jee-paper-2-mock-test-series', destination: '/jee-paper-2-preparation', permanent: true },
      { source: '/jee-paper-2-mathematics-syllabus', destination: '/jee-paper-2-preparation', permanent: true },
      { source: '/jee-paper-2-previous-year-papers', destination: '/previous-year-papers', permanent: true },
      { source: '/nata-jee-batch-combined-preparation', destination: '/courses', permanent: true },
      { source: '/jee-batch-coaching', destination: '/courses', permanent: true },
      { source: '/nata-exam-questions', destination: '/nata-important-questions', permanent: true },
      { source: '/how-to-score-99-percentile-jee-batch', destination: '/how-to-score-150-in-nata', permanent: true },
      { source: '/nata-app-url', destination: '/courses', permanent: true },
      { source: '/nata-drawing-url', destination: '/nata-important-questions', permanent: true },
      { source: '/nata-question-url', destination: '/nata-important-questions', permanent: true },
      { source: '/nata-aptitude-url', destination: '/nata-important-questions', permanent: true },
      { source: '/nata-paper-2-url', destination: '/jee-paper-2-preparation', permanent: true },
      { source: '/online-coaching-url', destination: '/coaching/nata-coaching', permanent: true },
      { source: '/contact-us-url', destination: '/contact', permanent: true },
      { source: '/speed-url', destination: '/coaching/nata-coaching', permanent: true },
      { source: '/materials', destination: '/free-resources', permanent: true },

      // Old WordPress content paths
      { source: '/NATA-coaching-centers-nearby/:path*', destination: '/coaching/nata-coaching', permanent: true },
      { source: '/NATA_Coaching_center_near_me_address/:path*', destination: '/coaching/nata-coaching', permanent: true },
      { source: '/Application-form-Nata-Coaching', destination: 'https://app.neramclasses.com/apply', permanent: true },
      { source: '/Free-Nata-Class-books-online-registration', destination: '/free-resources', permanent: true },
      { source: '/nata-cutoff-calculator-url/:path*', destination: '/tools/cutoff-calculator', permanent: true },
      { source: '/FAQs-nata-exam-questions', destination: '/nata-important-questions', permanent: true },
      { source: '/JEE_B.arch_Syllabus/:path*', destination: '/nata-syllabus', permanent: true },
      { source: '/JEE_B.arch_Syllabus', destination: '/nata-syllabus', permanent: true },
      { source: '/NATA_Best_Architecture_Colleges', destination: '/courses', permanent: true },
      { source: '/NATA_Free_Books', destination: '/free-resources', permanent: true },
      // NOTE: /about and /contact are handled by next-intl middleware (localePrefix: 'as-needed')
      // Explicit redirects here cause ERR_TOO_MANY_REDIRECTS

      // Auth pages → redirect to student app
      { source: '/auth/login', destination: 'https://app.neramclasses.com/login', permanent: true },
      { source: '/auth/:path*', destination: 'https://app.neramclasses.com/login', permanent: true },

      // Old version paths
      { source: '/v3', destination: '/', permanent: true },
      { source: '/v5', destination: '/', permanent: true },
      { source: '/v6', destination: '/', permanent: true },

      // Old .html pages (WordPress artifacts)
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/register/:path*.html', destination: '/free-resources', permanent: true },
      { source: '/nata-cutoff-calculator/:path*.html', destination: '/tools/cutoff-calculator', permanent: true },
      { source: '/about/Free-NATA-study-Materials.html', destination: '/free-resources', permanent: true },

      // Old city URLs with -url suffix — specific cities first, then catch-all
      { source: '/trichy-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-trichy', permanent: true },
      { source: '/madurai-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-madurai', permanent: true },
      { source: '/salem-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-salem', permanent: true },
      { source: '/erode-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-erode', permanent: true },
      { source: '/bangalore-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-bangalore', permanent: true },
      { source: '/hyderabad-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-hyderabad', permanent: true },
      { source: '/delhi-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-delhi', permanent: true },
      { source: '/cochin-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-kochi', permanent: true },
      { source: '/vizag-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-visakhapatnam', permanent: true },
      { source: '/tirunelveli-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-tirunelveli', permanent: true },
      { source: '/dindigul-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-dindigul', permanent: true },
      { source: '/mumbai-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-mumbai', permanent: true },
      { source: '/coimbatore-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-coimbatore', permanent: true },
      { source: '/chennai-url', destination: '/coaching/nata-coaching/nata-coaching-centers-in-chennai', permanent: true },
      // Catch-all for remaining -url suffix patterns → coaching hub
      { source: '/:slug(.*-url)', destination: '/coaching/nata-coaching', permanent: true },

      // Catch-all for .html extensions (strip .html and redirect)
      { source: '/:path*.html', destination: '/', permanent: true },

      // ─── Additional WordPress/legacy catch-alls for 404 cleanup ───
      // Common WordPress paths Google may still crawl
      { source: '/wp-content/:path*', destination: '/', permanent: true },
      { source: '/wp-includes/:path*', destination: '/', permanent: true },
      { source: '/wp-json/:path*', destination: '/', permanent: true },
      { source: '/wp-login.php', destination: '/', permanent: true },
      { source: '/wp-admin/:path*', destination: '/', permanent: true },
      { source: '/feed', destination: '/', permanent: true },
      { source: '/feed/:path*', destination: '/', permanent: true },
      { source: '/xmlrpc.php', destination: '/', permanent: true },
      { source: '/trackback/:path*', destination: '/', permanent: true },
      { source: '/comments/feed/:path*', destination: '/', permanent: true },

      // Old WordPress taxonomy/archive patterns
      { source: '/category/:path*', destination: '/blog', permanent: true },
      { source: '/tag/:path*', destination: '/blog', permanent: true },
      { source: '/author/:path*', destination: '/about', permanent: true },
      { source: '/page/:path*', destination: '/', permanent: true },
      { source: '/attachment/:path*', destination: '/', permanent: true },

      // Old WordPress date-based archives
      { source: '/2024/:path*', destination: '/blog', permanent: true },
      { source: '/2025/:path*', destination: '/blog', permanent: true },

      // Common crawled paths that don't exist
      { source: '/sample-page', destination: '/', permanent: true },
      { source: '/hello-world', destination: '/', permanent: true },
      { source: '/test', destination: '/', permanent: true },
      { source: '/test-page', destination: '/', permanent: true },
      { source: '/uncategorized/:path*', destination: '/blog', permanent: true },

      // Old registration/member paths
      { source: '/register', destination: '/apply', permanent: true },
      { source: '/register/:path*', destination: '/apply', permanent: true },
      { source: '/signup', destination: '/apply', permanent: true },
      { source: '/login', destination: 'https://app.neramclasses.com/login', permanent: true },
      { source: '/members/:path*', destination: '/', permanent: true },
      { source: '/my-account', destination: 'https://app.neramclasses.com', permanent: true },
      { source: '/my-account/:path*', destination: 'https://app.neramclasses.com', permanent: true },

      // Old NATA application form patterns
      { source: '/NATA_Application_Form_:path*', destination: '/apply', permanent: true },
      { source: '/nata-application-form', destination: '/apply', permanent: true },
      { source: '/nata-registration', destination: '/nata-2026/how-to-apply', permanent: true },
      { source: '/nata-admit-card', destination: '/nata-2026/admit-card', permanent: true },
      { source: '/nata-result', destination: '/nata-2026/scoring-and-results', permanent: true },
      { source: '/nata-results', destination: '/nata-2026/scoring-and-results', permanent: true },
      { source: '/nata-exam-date', destination: '/nata-2026/important-dates', permanent: true },
      { source: '/nata-exam-pattern', destination: '/nata-2026/exam-pattern', permanent: true },
      { source: '/nata-eligibility', destination: '/nata-2026/eligibility', permanent: true },
      { source: '/nata-fee', destination: '/nata-2026/fee-structure', permanent: true },
      { source: '/nata-mock-test', destination: '/tools/question-bank', permanent: true },

      // Favicon and common bot probes (prevent 404 noise)
      { source: '/favicon.png', destination: '/favicon.ico', permanent: true },
      { source: '/apple-touch-icon.png', destination: '/apple-icon-180x180.png', permanent: true },
      { source: '/apple-touch-icon-precomposed.png', destination: '/apple-icon-180x180.png', permanent: true },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
