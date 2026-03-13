import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://app.neramclasses.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/tools',
          '/tools/',
          '/tools/cutoff-calculator',
          '/tools/college-predictor',
          '/tools/exam-centers',
          '/tools/question-bank',
          '/login',
        ],
        disallow: [
          '/api/',
          '/_next/',
          '/dashboard',
          '/dashboard/',
          '/profile',
          '/profile/',
          '/apply',
          '/apply/',
          '/payment/',
          '/*.json$',
        ],
      },
      // Note: Do NOT add specific Googlebot/Bingbot rules — in robots.txt spec,
      // user-agent-specific rules OVERRIDE the '*' rules entirely,
      // which would make Googlebot ignore all disallow entries above.
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
