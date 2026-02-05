import { MetadataRoute } from 'next';

const BASE_URL = 'https://app.neramclasses.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static tool pages
  const toolPages = [
    {
      url: `${BASE_URL}/tools`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/tools/cutoff-calculator`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/tools/college-predictor`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/tools/exam-centers`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
  ];

  // Auth pages (public but not high priority for SEO)
  const authPages = [
    {
      url: `${BASE_URL}/login`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
  ];

  return [...toolPages, ...authPages];
}
