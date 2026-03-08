import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://neramclasses.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/_next/',
          '/admin/',
          '/*.json$',
          '/signout',
          '/sso',
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
          // Old duplicate city/location URLs (catch-all pattern)
          '/*-url',
          // Old paths from WordPress site
          '/test-page/*',
          '/register/*',
          '/members/*',
          '/NATA-coaching-centers-nearby/*',
          '/NATA_Coaching_center_near_me_address',
          '/Application-form-Nata-Coaching',
          '/Free-Nata-Class-books-online-registration',
          '/NATA_Application_Form_*',
          '/FAQs-nata-exam-questions',
          '/JEE_B.arch_Syllabus',
          '/NATA_Best_Architecture_Colleges',
          '/NATA_Free_Books',
          '/materials',
          // Disallow .html duplicates
          '/*.html',
          // Special characters
          '/&',
          '/$',
        ],
      },
      // AI Crawlers — ALLOW for AEO (AI Engine Optimization)
      // Note: Googlebot/Bingbot inherit the '*' rules (allow: '/' + disallows).
      // Do NOT add specific Googlebot/Bingbot rules — in robots.txt spec,
      // user-agent-specific rules OVERRIDE the '*' rules entirely,
      // which would make Googlebot ignore all disallow entries.
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Applebot-Extended', allow: '/' },
      { userAgent: 'Bytespider', allow: '/' },
      { userAgent: 'CCBot', allow: '/' },
      // Google Ads crawlers — need unrestricted access to verify ad landing pages
      { userAgent: 'AdsBot-Google', allow: '/' },
      { userAgent: 'AdsBot-Google-Mobile', allow: '/' },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
