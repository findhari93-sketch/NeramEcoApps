import { MetadataRoute } from 'next';

/**
 * AI answer engines we want citing the tools (AEO). A named group replaces the
 * '*' group entirely, so they get the same disallow list explicitly.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'Google-Extended',
  'PerplexityBot',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Perplexity-User',
  'Applebot',
  'Applebot-Extended',
];

/** Bulk scrapers that send no search or answer traffic back: blocked entirely. */
const BLOCKED_CRAWLERS = ['Bytespider', 'CCBot'];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://app.neramclasses.com';

  // Never disallow /_next/: crawlers need the CSS and JS chunks to render pages.
  const disallow = [
    '/api/',
    '/dashboard',
    '/dashboard/',
    '/profile',
    '/profile/',
    '/apply',
    '/apply/',
    '/payment/',
    '/tools/all',
    '/tools/nata/question-bank/new',
    '/*.json$',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        // Everything public is allowed; tool pages carry their own robots meta
        // (gated-out place pages are noindex, follow).
        allow: ['/'],
        disallow,
      },
      // Note: Do NOT add specific Googlebot/Bingbot rules: in the robots.txt spec,
      // user-agent-specific rules OVERRIDE the '*' rules entirely,
      // which would make Googlebot ignore all disallow entries above.
      { userAgent: AI_CRAWLERS, allow: '/', disallow },
      { userAgent: BLOCKED_CRAWLERS, disallow: '/' },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
