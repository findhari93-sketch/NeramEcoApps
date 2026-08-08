const defaultRuntimeCaching = require('next-pwa/cache');

// Never let the service worker hold an authenticated API response.
//
// next-pwa's default list ends with a NetworkFirst rule over `/api/**` that keeps GET
// responses for 24 hours in a Cache Storage bucket called 'apis'. That bucket belongs
// to the origin, not to the person signed in: it is not namespaced by account and
// nothing clears it at sign-out. On the devices Nexus actually runs on, a parent's
// phone shared with their child, a staffroom laptop, that is one person's roster
// sitting where the next person's browser will happily serve it.
//
// Placed FIRST so Workbox matches it before the default rule it is replacing.
// Responses still get cached for speed, just in lib/swr-cache.ts instead, which is
// keyed per account and dropped on sign-out.
const apiNetworkOnly = {
  urlPattern: ({ url }) => url.origin === self.origin && url.pathname.startsWith('/api/'),
  handler: 'NetworkOnly',
};

// Belt and braces. Prepending the rule above is enough on its own, because Workbox
// takes the first route that matches, but leaving the original in the list means one
// innocent reorder silently starts caching authenticated JSON again. Dropping it as
// well makes that impossible, and the NetworkOnly rule still covers us if next-pwa
// ever renames the bucket this filter looks for.
const runtimeCachingWithoutApis = defaultRuntimeCaching.filter(
  (rule) => rule?.options?.cacheName !== 'apis',
);

const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  // NOTE: public/sw.js and public/workbox-*.js are GENERATED and gitignored here, so
  // this takes effect on the next build with no artifact to commit.
  runtimeCaching: [apiNetworkOnly, ...runtimeCachingWithoutApis],
});

// Identifies the bundle this build produces, so nothing on a device outlives the
// code that wrote it. lib/swr-cache.ts keys its localStorage buckets on this: a
// payload cached before a deploy is never handed to the components that ship in
// it, which is how `totals.byBucket` arrived undefined on /teacher/catch-up and
// crashed the app for a teacher who had the screen open the day before.
//
// Evaluated once per build. A Turbo cache hit restores a .next that already has
// its own stamp inside, which is correct: identical code, identical shapes, so
// the device keeps its warm cache. Anything that actually rebuilds gets a new one.
const BUILD_STAMP = Date.now().toString(36);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BUILD_STAMP: BUILD_STAMP,
  },
  typescript: {
    // Drawing feature gamification types not yet in generated DB types
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@neram/ai', '@neram/ui', '@neram/database', '@neram/auth'],
  experimental: {
    // Rewrite barrel imports into direct ones at build time.
    //
    // Icons in this app are already imported deep (1808 of 1809 call sites), which is
    // the usual advice and is done right. The catch is that every MUI *component*
    // arrives through the `@neram/ui` barrel instead: one `export *` module that
    // re-exports ~130 components from `@mui/material`, imported by bare specifier in
    // ~592 files here. So the barrel cost the deep icon imports were avoiding simply
    // moved one package over.
    //
    // This flag undoes that from inside Nexus, without touching packages/ui, which
    // matters because editing a shared package makes the deploy path filter rebuild
    // and redeploy all four apps.
    optimizePackageImports: ['@neram/ui', '@mui/material', '@mui/icons-material'],
  },
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
      {
        // The student list followed the teacher one into catch-up, for the same
        // reason plus a sharper one: it was a second door to the same recording
        // that never started the catch-up clock, so a student who used it read
        // as "not started" to their teacher and got chased for work they were
        // doing. Catch-up owns both now.
        //
        // Lands on the default tab, not ?tab=watch-again. Someone arriving from
        // an old bookmark should meet what they owe, not the optional shelf.
        // `source` is the exact path, so the PLAYER at
        // /student/class-recap/[recapId] and Focus Mode are both untouched.
        source: '/student/class-recaps',
        destination: '/student/catch-up',
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
