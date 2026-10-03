import { MetadataRoute } from 'next';

/**
 * AI answer engines we want citing the site (AEO). They read content but get the
 * same disallow list as '*': a named group replaces the '*' group entirely, so
 * without it they would crawl /api/, /enroll, /s/ and every query variant.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'Google-Extended',
  'PerplexityBot',
  'ClaudeBot',
  'Applebot-Extended',
];

/** Bulk scrapers that send no search or answer traffic back: blocked entirely. */
const BLOCKED_CRAWLERS = ['Bytespider', 'CCBot'];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://neramclasses.com';

  const disallow = [
    '/api/',
    // Never disallow /_next/: Google needs the CSS and JS chunks to render pages.
    '/admin/',
    '/*.json$',
    '/signout',
    '/sso',
    '/my-enrollment',
    '/enroll',
    // The student detail link. The URL is itself the credential, so it must
    // never be crawled, archived or listed anywhere.
    '/s/',
    // Legacy WordPress paths (old site)
    '/wp-admin/',
    '/wp-content/',
    '/wp-includes/',
    '/wp-login.php',
    '/*?replytocom=*',
    '/*?p=*',
    '/feed/',
    '/trackback/',
    '/xmlrpc.php',
    '/cgi-bin/',
    // Old WordPress paths (have redirects in next.config.js, block direct crawling)
    '/test-page/*',
    '/register/*',
    '/members/*',
    '/NATA_Application_Form_*',
    // Note: removed '/&' and '/$' — '/$' was blocking the homepage for generic crawlers
    // Prevent crawling of URL variants with query parameters
    // Fixes GSC "Alternate page with proper canonical tag" (crawl budget waste)
    '/*?center=*',
    '/*?course=*',
    '/*?mode=*',
    '/*?trk=*',
    '/*?utm_*',
    '/*?fbclid=*',
    '/*?gclid=*',
    '/*?ref=*',
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      // Note: Googlebot/Bingbot inherit the '*' rules (allow: '/' + disallows).
      // Do NOT add specific Googlebot/Bingbot rules: in the robots.txt spec,
      // user-agent-specific rules OVERRIDE the '*' rules entirely,
      // which would make Googlebot ignore all disallow entries.
      { userAgent: AI_CRAWLERS, allow: '/', disallow },
      { userAgent: BLOCKED_CRAWLERS, disallow: '/' },
      // Google Ads crawlers — need unrestricted access to verify ad landing pages
      { userAgent: 'AdsBot-Google', allow: '/' },
      { userAgent: 'AdsBot-Google-Mobile', allow: '/' },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
