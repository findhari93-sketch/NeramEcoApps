import { MetadataRoute } from 'next';
import { locales } from '@/i18n';
import { getAllCenterSeoSlugs } from '@neram/database/queries';
import { locations as dbLocations } from '@neram/database';

const baseUrl = 'https://neramclasses.com';

// All static pages
const staticPages = [
  '',
  '/about',
  '/contact',
  '/apply',
  '/courses',
  '/coaching',
  '/premium',
  '/alumni',
  '/careers',
  '/fees',
  '/demo-class',
  '/centers',
  '/scholarship',
  '/youtube-reward',
  '/free-resources',
  '/previous-year-papers',
  '/nata-syllabus',
  '/nata-preparation-guide',
  '/nata-important-questions',
  '/jee-paper-2-preparation',
  '/best-books-nata-jee',
  '/how-to-score-150-in-nata',
  '/tools/cutoff-calculator',
  '/nata-app',
  '/best-nata-coaching-online',
  '/blog',
  '/coaching/nata-coaching',
  '/privacy',
  '/terms',
  '/refund-policy',
];

// Course slugs
const courseSlugs = [
  'neet-preparation',
  'jee-main-advanced',
  'foundation-course',
  'board-exam-preparation',
  'nda-preparation',
  'ca-foundation',
  'nata-coaching-online',
  'jee-paper-2-coaching',
];

// Blog post slugs (static until database integration)
const blogSlugs = [
  { slug: 'nata-2025-preparation-strategy', date: '2025-01-15', isCityGuide: false },
  { slug: 'top-10-drawing-techniques-nata', date: '2025-01-10', isCityGuide: false },
  { slug: 'best-nata-coaching-chennai', date: '2025-01-05', isCityGuide: true },
  { slug: 'best-nata-coaching-coimbatore', date: '2025-01-03', isCityGuide: true },
  { slug: 'best-nata-coaching-madurai', date: '2025-01-02', isCityGuide: true },
  { slug: 'best-nata-coaching-trichy', date: '2025-01-01', isCityGuide: true },
  { slug: 'best-nata-coaching-pudukkottai', date: '2026-01-10', isCityGuide: true },
  { slug: 'best-nata-coaching-salem', date: '2026-01-08', isCityGuide: true },
  { slug: 'best-nata-coaching-tiruppur', date: '2026-01-05', isCityGuide: true },
  { slug: 'best-nata-coaching-bangalore', date: '2026-01-22', isCityGuide: true },
  { slug: 'best-nata-coaching-dubai', date: '2026-02-01', isCityGuide: true },
  { slug: 'best-nata-coaching-doha', date: '2026-02-05', isCityGuide: true },
  { slug: 'best-nata-coaching-muscat', date: '2026-02-08', isCityGuide: true },
  { slug: 'best-nata-coaching-riyadh', date: '2026-02-10', isCityGuide: true },
  { slug: 'best-nata-coaching-kuwait-city', date: '2026-02-12', isCityGuide: true },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const currentDate = new Date();

  // Add static pages for each locale
  for (const locale of locales) {
    for (const page of staticPages) {
      const isHomepage = page === '';
      const isHighPriority = page.includes('coaching') || page.includes('nata') || page.includes('jee');
      entries.push({
        url: `${baseUrl}/${locale}${page}`,
        lastModified: currentDate,
        changeFrequency: isHomepage ? 'daily' : isHighPriority ? 'weekly' : 'weekly',
        priority: isHomepage ? 1.0 : isHighPriority ? 0.9 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${baseUrl}/${l}${page}`])
          ),
        },
      });
    }

    // Add course pages
    for (const slug of courseSlugs) {
      entries.push({
        url: `${baseUrl}/${locale}/courses/${slug}`,
        lastModified: currentDate,
        changeFrequency: 'weekly',
        priority: 0.8,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${baseUrl}/${l}/courses/${slug}`])
          ),
        },
      });
    }

    // Add location pages (synced with @neram/database to avoid sitemap-route mismatch)
    for (const location of dbLocations) {
      entries.push({
        url: `${baseUrl}/${locale}/coaching/nata-coaching/nata-coaching-centers-in-${location.city}`,
        lastModified: currentDate,
        changeFrequency: 'yearly',
        priority: 0.5,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [
              l,
              `${baseUrl}/${l}/coaching/nata-coaching/nata-coaching-centers-in-${location.city}`,
            ])
          ),
        },
      });
    }

    // Add blog posts
    for (const post of blogSlugs) {
      entries.push({
        url: `${baseUrl}/${locale}/blog/${post.slug}`,
        lastModified: new Date(post.date),
        changeFrequency: 'monthly',
        priority: post.isCityGuide ? 0.85 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${baseUrl}/${l}/blog/${post.slug}`])
          ),
        },
      });
    }
  }

  // Add center detail pages (dynamic from database)
  try {
    const centerSlugs = await getAllCenterSeoSlugs();
    for (const locale of locales) {
      for (const centerSlug of centerSlugs) {
        entries.push({
          url: `${baseUrl}/${locale}/contact/${centerSlug}`,
          lastModified: currentDate,
          changeFrequency: 'monthly',
          priority: 0.8,
          alternates: {
            languages: Object.fromEntries(
              locales.map((l) => [l, `${baseUrl}/${l}/contact/${centerSlug}`])
            ),
          },
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch center slugs for sitemap:', err);
  }

  return entries;
}
