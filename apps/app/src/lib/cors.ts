/**
 * CORS utility for cross-domain API requests.
 * Handles both www and non-www marketing origins.
 */

const marketingUrl = (process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010').replace(/\/$/, '');

// Allow both www and non-www variants
const allowedOrigins = new Set([
  marketingUrl,
  marketingUrl.replace('https://', 'https://www.'),
  'http://localhost:3010',
]);

export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = requestOrigin && allowedOrigins.has(requestOrigin)
    ? requestOrigin
    : marketingUrl;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}
