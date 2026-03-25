import { MetadataRoute } from 'next';
import { locales } from '@/i18n';
import { getAllCenterSeoSlugs } from '@neram/database/queries';
import { getSitemapLocations } from '@neram/database';

const baseUrl = 'https://neramclasses.com';

// Static pages with realistic lastModified dates.
// Google ignores lastmod if every page has the same date — use actual dates.
const staticPages: Array<{ path: string; lastModified: string }> = [
  { path: '', lastModified: '2026-03-10' },  // Homepage - updated frequently
  { path: '/about', lastModified: '2026-02-15' },
  { path: '/contact', lastModified: '2026-02-20' },
  { path: '/apply', lastModified: '2026-03-01' },
  { path: '/courses', lastModified: '2026-03-05' },
  { path: '/coaching', lastModified: '2026-02-28' },
  { path: '/premium', lastModified: '2026-02-10' },
  { path: '/alumni', lastModified: '2026-01-20' },
  { path: '/careers', lastModified: '2026-01-15' },
  { path: '/fees', lastModified: '2026-03-01' },
  { path: '/demo-class', lastModified: '2026-03-05' },
  { path: '/centers', lastModified: '2026-02-25' },
  { path: '/scholarship', lastModified: '2026-02-01' },
  { path: '/youtube-reward', lastModified: '2026-01-10' },
  { path: '/free-resources', lastModified: '2026-02-15' },
  { path: '/previous-year-papers', lastModified: '2026-02-20' },
  { path: '/nata-syllabus', lastModified: '2026-02-10' },
  { path: '/nata-preparation-guide', lastModified: '2026-02-15' },
  { path: '/nata-important-questions', lastModified: '2026-02-18' },
  { path: '/jee-paper-2-preparation', lastModified: '2026-02-12' },
  { path: '/best-books-nata-jee', lastModified: '2026-01-25' },
  { path: '/how-to-score-150-in-nata', lastModified: '2026-01-30' },
  { path: '/tools/cutoff-calculator', lastModified: '2026-03-01' },
  { path: '/tools/college-predictor', lastModified: '2026-03-13' },
  { path: '/tools/exam-centers', lastModified: '2026-03-13' },
  { path: '/tools/question-bank', lastModified: '2026-03-13' },
  { path: '/nata-app', lastModified: '2026-02-28' },
  { path: '/best-nata-coaching-online', lastModified: '2026-02-20' },
  { path: '/blog', lastModified: '2026-03-10' },  // Blog index - updated with new posts
  { path: '/coaching/nata-coaching', lastModified: '2026-02-25' },
  { path: '/coaching/best-nata-coaching-india', lastModified: '2026-03-24' },
  { path: '/coaching/best-nata-coaching-chennai', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-chennai', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-chennai/anna-nagar', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-chennai/adyar', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-chennai/tambaram', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-chennai/ashok-nagar', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-chennai/velachery', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-chennai/t-nagar', lastModified: '2026-03-25' },
  { path: '/coaching/nata-coaching-center-in-tamil-nadu', lastModified: '2026-03-13' },
  { path: '/privacy', lastModified: '2025-12-01' },
  { path: '/terms', lastModified: '2025-12-01' },
  { path: '/refund-policy', lastModified: '2025-12-01' },
  // NATA 2026 hub + spoke pages
  { path: '/nata-2026', lastModified: '2026-03-08' },
  { path: '/nata-2026/how-to-apply', lastModified: '2026-03-05' },
  { path: '/nata-2026/eligibility', lastModified: '2026-03-05' },
  { path: '/nata-2026/syllabus', lastModified: '2026-02-28' },
  { path: '/nata-2026/exam-centers', lastModified: '2026-03-01' },
  { path: '/nata-2026/fee-structure', lastModified: '2026-02-25' },
  { path: '/nata-2026/exam-pattern', lastModified: '2026-02-25' },
  { path: '/nata-2026/photo-signature-requirements', lastModified: '2026-02-20' },
  { path: '/nata-2026/important-dates', lastModified: '2026-03-08' },
  { path: '/nata-2026/scoring-and-results', lastModified: '2026-02-28' },
  { path: '/nata-2026/dos-and-donts', lastModified: '2026-02-15' },
  { path: '/nata-2026/cutoff-calculator', lastModified: '2026-03-01' },
  // New spoke pages (SEO/AEO expansion)
  { path: '/nata-2026/drawing-test', lastModified: '2026-03-13' },
  { path: '/nata-2026/preparation-tips', lastModified: '2026-03-13' },
  { path: '/nata-2026/previous-year-papers', lastModified: '2026-03-13' },
  { path: '/nata-2026/best-books', lastModified: '2026-03-13' },
  { path: '/nata-2026/admit-card', lastModified: '2026-03-13' },
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
  { slug: 'nata-2026-preparation-strategy', date: '2026-01-15', isCityGuide: false },
  { slug: 'top-10-drawing-techniques-nata', date: '2026-01-10', isCityGuide: false },
  { slug: 'best-nata-coaching-chennai', date: '2026-01-05', isCityGuide: true },
  { slug: 'best-nata-coaching-coimbatore', date: '2026-01-03', isCityGuide: true },
  { slug: 'best-nata-coaching-madurai', date: '2026-01-02', isCityGuide: true },
  { slug: 'best-nata-coaching-trichy', date: '2026-01-01', isCityGuide: true },
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

  // Helper: build URL respecting localePrefix: 'as-needed'
  // English (default locale) has no /en/ prefix; other locales do.
  const localeUrl = (locale: string, path: string) =>
    locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  // ─── Static pages: all locales (these have i18n translations) ───
  for (const locale of locales) {
    for (const page of staticPages) {
      const isHomepage = page.path === '';
      const isHighPriority = page.path.includes('coaching') || page.path.includes('nata') || page.path.includes('jee');
      entries.push({
        url: localeUrl(locale, page.path),
        lastModified: new Date(page.lastModified),
        changeFrequency: isHomepage ? 'daily' : isHighPriority ? 'weekly' : 'weekly',
        priority: isHomepage ? 1.0 : isHighPriority ? 0.9 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, localeUrl(l, page.path)])
          ),
        },
      });
    }

    // Course pages: all locales
    for (const slug of courseSlugs) {
      const path = `/courses/${slug}`;
      entries.push({
        url: localeUrl(locale, path),
        lastModified: new Date('2026-03-01'),
        changeFrequency: 'weekly',
        priority: 0.8,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, localeUrl(l, path)])
          ),
        },
      });
    }

    // Blog posts: all locales
    for (const post of blogSlugs) {
      const path = `/blog/${post.slug}`;
      entries.push({
        url: localeUrl(locale, path),
        lastModified: new Date(post.date),
        changeFrequency: 'monthly',
        priority: post.isCityGuide ? 0.85 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, localeUrl(l, path)])
          ),
        },
      });
    }
  }

  // ─── Location pages: ENGLISH ONLY, high+medium priority only ───
  // Location pages have no i18n translations (hardcoded English content).
  // Including all 5 locales creates 1,010 duplicate-content URLs that
  // waste crawl budget. Only include English versions of indexable cities.
  // English URLs have no /en/ prefix (localePrefix: 'as-needed').
  const sitemapLocations = getSitemapLocations();
  for (const location of sitemapLocations) {
    entries.push({
      url: `${baseUrl}/coaching/nata-coaching/nata-coaching-centers-in-${location.city}`,
      lastModified: new Date('2026-02-20'),
      changeFrequency: 'monthly',
      priority: location.sitemapPriority === 'high' ? 0.7 : 0.5,
    });
  }

  // ─── Center detail pages: English only (no /en/ prefix) ───
  try {
    const centerSlugs = await getAllCenterSeoSlugs();
    for (const centerSlug of centerSlugs) {
      entries.push({
        url: `${baseUrl}/contact/${centerSlug}`,
        lastModified: new Date('2026-02-25'),
        changeFrequency: 'monthly',
        priority: 0.8,
      });
    }
  } catch (err) {
    console.error('Failed to fetch center slugs for sitemap:', err);
  }

  return entries;
}
