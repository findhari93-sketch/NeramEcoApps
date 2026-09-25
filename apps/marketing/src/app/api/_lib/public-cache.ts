/**
 * Cache headers for PUBLIC, non-personalised API responses only (published
 * marketing content, testimonials, social proofs, results, fee structures).
 *
 * next.config.js puts `CDN-Cache-Control: no-store` on all of /api/* so an
 * authenticated response can never be edge-cached, and that also cancelled the
 * `s-maxage` these public routes set: every banner and widget fetch ran a function
 * and a Supabase query. `Vercel-CDN-Cache-Control` outranks `CDN-Cache-Control` at
 * Vercel's edge, so setting it per response re-enables edge caching for exactly
 * the routes that opt in. Cloudflare still reads `CDN-Cache-Control` and stays
 * out of it.
 *
 * NEVER use these on a route that reads auth, cookies or anything per user.
 */
export const PUBLIC_CACHE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  // Five minutes at the edge so an admin's banner edit shows up quickly.
  'Vercel-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
});
