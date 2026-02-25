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
          // Old duplicate city/location URLs
          '/*-url',
          '/pudukkottai-url',
          '/tamilnadu-url',
          '/cochin-url',
          '/aat-url',
          '/vizag-url',
          '/salem-url',
          '/bangalore-url',
          '/hyderabad-url',
          '/delhi-url',
          '/erode-url',
          '/tirunelveli-url',
          '/malapuram-url',
          '/ooty-url',
          '/perambur-url',
          '/andhrapradesh-url',
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
      // Search engine crawlers
      { userAgent: 'Googlebot', allow: '/' },
      { userAgent: 'Bingbot', allow: '/' },
      // AI Crawlers — ALLOW for AEO (AI Engine Optimization)
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ChatGPT-User', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'Applebot-Extended', allow: '/' },
      { userAgent: 'Bytespider', allow: '/' },
      { userAgent: 'CCBot', allow: '/' },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
