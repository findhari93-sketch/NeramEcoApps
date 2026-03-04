import { MetadataRoute } from 'next';
import { locales } from '@/i18n';
import { getAllCenterSeoSlugs } from '@neram/database/queries';
import { getSitemapLocations } from '@neram/database';

const baseUrl = 'https://neramclasses.com';

// All static pages (these use i18n translations → include all locales)
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
  // NATA 2026 hub + spoke pages
  '/nata-2026',
  '/nata-2026/how-to-apply',
  '/nata-2026/eligibility',
  '/nata-2026/syllabus',
  '/nata-2026/exam-centers',
  '/nata-2026/fee-structure',
  '/nata-2026/exam-pattern',
  '/nata-2026/photo-signature-requirements',
  '/nata-2026/important-dates',
  '/nata-2026/scoring-and-results',
  '/nata-2026/dos-and-donts',
  '/nata-2026/cutoff-calculator',
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

  // ─── Static pages: all locales (these have i18n translations) ───
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

    // Course pages: all locales
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

    // Blog posts: all locales
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

  // ─── Location pages: ENGLISH ONLY, high+medium priority only ───
  // Location pages have no i18n translations (hardcoded English content).
  // Including all 5 locales creates 1,010 duplicate-content URLs that
  // waste crawl budget. Only include English versions of indexable cities.
  const sitemapLocations = getSitemapLocations();
  for (const location of sitemapLocations) {
    entries.push({
      url: `${baseUrl}/en/coaching/nata-coaching/nata-coaching-centers-in-${location.city}`,
      lastModified: currentDate,
      changeFrequency: 'monthly',
      priority: location.sitemapPriority === 'high' ? 0.7 : 0.5,
    });
  }

  // ─── Center detail pages: English only ───
  try {
    const centerSlugs = await getAllCenterSeoSlugs();
    for (const centerSlug of centerSlugs) {
      entries.push({
        url: `${baseUrl}/en/contact/${centerSlug}`,
        lastModified: currentDate,
        changeFrequency: 'monthly',
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error('Failed to fetch center slugs for sitemap:', err);
  }

  return entries;
}
