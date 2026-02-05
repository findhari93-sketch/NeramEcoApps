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
      {
        userAgent: 'Googlebot',
        allow: '/',
      },
      {
        userAgent: 'Bingbot',
        allow: '/',
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
