import { MetadataRoute } from 'next';
import { locales } from '@/i18n';
import { getAllCenterSeoSlugs } from '@neram/database/queries';
import { getSitemapLocations, getIndianStates } from '@neram/database';
import { getAllCollegeSlugs, getActiveStates, getNIRFRankedCollegeSlugs } from '@/lib/college-hub/queries';
import { ROUTED_HUB_SLUGS } from '@/data/counselling-2026';

const baseUrl = 'https://neramclasses.com';

// Static pages with realistic lastModified dates.
// Google ignores lastmod if every page has the same date — use actual dates.
// i18n: true = include all locale variants; false = English only (content is hardcoded English).
// Pages with hardcoded English content waste crawl budget when included as /ta/*, /hi/*, etc.
// Google marks them "Duplicate, Google chose different canonical" → skip non-English in sitemap.
const staticPages: Array<{ path: string; lastModified: string; i18n?: boolean }> = [
  { path: '', lastModified: '2026-03-10', i18n: true },  // Homepage - translated
  { path: '/about', lastModified: '2026-02-15', i18n: true },
  { path: '/contact', lastModified: '2026-02-20', i18n: true },
  { path: '/apply', lastModified: '2026-03-01', i18n: true },
  { path: '/courses', lastModified: '2026-03-05', i18n: true },
  { path: '/coaching', lastModified: '2026-02-28', i18n: true },
  { path: '/premium', lastModified: '2026-02-10', i18n: true },
  { path: '/alumni', lastModified: '2026-01-20', i18n: true },
  { path: '/careers', lastModified: '2026-01-15', i18n: true },
  { path: '/fees', lastModified: '2026-03-01', i18n: true },
  { path: '/demo-class', lastModified: '2026-03-05', i18n: true },
  { path: '/centers', lastModified: '2026-02-25', i18n: true },
  // College Hub (i18n: true — hreflang for all 5 locales)
  { path: '/colleges', lastModified: '2026-04-12', i18n: true },
  { path: '/colleges/tnea', lastModified: '2026-04-12', i18n: true },
  { path: '/colleges/josaa', lastModified: '2026-04-12', i18n: true },
  { path: '/nata-hub', lastModified: '2026-04-13', i18n: true },
  { path: '/jee-barch-hub', lastModified: '2026-04-13', i18n: true },
  // Exam Hub: AAT 2026 + PGETA 2026 (architecture entrance hubs, all-locale)
  { path: '/aat-2026', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/eligibility', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/schedule', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/syllabus', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/exam-pattern', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/centres', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/participating-iits', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/drawing-kit', lastModified: '2026-05-01', i18n: true },
  { path: '/aat-2026/preparation', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/eligibility', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/schedule', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/exam-pattern', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/syllabus', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/fees', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/participating-institutes', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/preparation', lastModified: '2026-05-01', i18n: true },
  { path: '/pgeta-2026/score-validity', lastModified: '2026-05-01', i18n: true },
  { path: '/colleges/rankings/nirf', lastModified: '2026-04-13', i18n: true },
  { path: '/colleges/rankings/archindex', lastModified: '2026-04-13', i18n: true },
  { path: '/scholarship', lastModified: '2026-02-01', i18n: true },
  { path: '/youtube-reward', lastModified: '2026-01-10', i18n: true },
  { path: '/free-resources', lastModified: '2026-02-15', i18n: true },
  // English-only content pages (hardcoded, no translations)
  { path: '/previous-year-papers', lastModified: '2026-02-20' },
  { path: '/nata-syllabus', lastModified: '2026-02-10' },
  { path: '/nata-preparation-guide', lastModified: '2026-02-15' },
  { path: '/nata-important-questions', lastModified: '2026-02-18' },
  { path: '/jee-paper-2-preparation', lastModified: '2026-02-12' },
  { path: '/best-books-nata-jee', lastModified: '2026-01-25' },
  { path: '/how-to-score-150-in-nata', lastModified: '2026-01-30' },
  { path: '/tools', lastModified: '2026-04-17' },
  { path: '/tools/cutoff-calculator', lastModified: '2026-04-17' },
  { path: '/tools/college-predictor', lastModified: '2026-04-17' },
  { path: '/tools/exam-centers', lastModified: '2026-04-17' },
  { path: '/tools/question-bank', lastModified: '2026-04-17' },
  { path: '/tools/rank-predictor', lastModified: '2026-04-17' },
  { path: '/tools/eligibility-checker', lastModified: '2026-04-17' },
  { path: '/tools/exam-planner', lastModified: '2026-04-17' },
  { path: '/tools/coa-checker', lastModified: '2026-04-17' },
  { path: '/tools/cost-calculator', lastModified: '2026-04-17' },
  { path: '/tools/counseling-insights', lastModified: '2026-04-17' },
  { path: '/tools/image-resizer', lastModified: '2026-05-08' },
  { path: '/tools/ai-chatbot', lastModified: '2026-05-08' },
  { path: '/tools/josaa-barch-predictor', lastModified: '2026-05-21' },
  { path: '/nata-app', lastModified: '2026-02-28' },
  // Dedicated landing page for the top-converting Google Ads keyword "nata entrance exam".
  // Highest priority (0.9, via isHighPriority below) to surface in indexing ahead of city pages.
  { path: '/nata-entrance-exam-coaching', lastModified: '2026-05-21' },
  // Canonical NATA online coaching landing page (consolidates 3 prior URLs that now 301 here).
  { path: '/nata-online-coaching', lastModified: '2026-05-21' },
  // Comparison page: high-intent decision-stage capture for "Neram vs BRDS vs SILICA" queries.
  { path: '/nata-online-coaching/comparison', lastModified: '2026-05-21' },
  // 10-year NATA cutoff trend analysis (link-bait for education portals).
  { path: '/nata-cutoff-trends-2015-2025', lastModified: '2026-05-21' },
  // Tamil Nadu city-specific NATA online coaching landing pages (Phase 2 TN-first cluster).
  { path: '/nata-coaching/chennai', lastModified: '2026-05-21' },
  { path: '/nata-coaching/coimbatore', lastModified: '2026-05-21' },
  { path: '/nata-coaching/madurai', lastModified: '2026-05-21' },
  { path: '/nata-coaching/trichy', lastModified: '2026-05-21' },
  { path: '/nata-coaching/salem', lastModified: '2026-05-21' },
  { path: '/nata-coaching/vellore', lastModified: '2026-05-21' },
  // Pan-India metro NATA online coaching landing pages (Phase 4 expansion brought forward).
  { path: '/nata-coaching/bangalore', lastModified: '2026-05-21' },
  { path: '/nata-coaching/hyderabad', lastModified: '2026-05-21' },
  { path: '/nata-coaching/mumbai', lastModified: '2026-05-21' },
  { path: '/nata-coaching/delhi', lastModified: '2026-05-21' },
  { path: '/nata-coaching/pune', lastModified: '2026-05-21' },
  { path: '/nata-coaching/kolkata', lastModified: '2026-05-21' },
  { path: '/nata-coaching/kochi', lastModified: '2026-05-21' },
  { path: '/nata-coaching/ahmedabad', lastModified: '2026-05-21' },
  { path: '/blog', lastModified: '2026-03-10' },
  { path: '/coaching/nata-coaching-center', lastModified: '2026-03-30', i18n: true },
  { path: '/coaching/best-nata-coaching-chennai', lastModified: '2026-03-25' },
  { path: '/nata-coaching-centers-in-chennai', lastModified: '2026-04-08' },
  { path: '/coaching/nata-coaching-chennai', lastModified: '2026-04-08' },
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
  // NATA 2026 hub + spoke pages (English-only content)
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
  { path: '/nata-2026/drawing-test', lastModified: '2026-03-13' },
  { path: '/nata-2026/preparation-tips', lastModified: '2026-03-13' },
  { path: '/nata-2026/previous-year-papers', lastModified: '2026-03-13' },
  { path: '/nata-2026/best-books', lastModified: '2026-03-13' },
  { path: '/nata-2026/admit-card', lastModified: '2026-03-13' },
  // Counselling master page (decision-tree hub, registry-driven)
  { path: '/counseling', lastModified: '2026-05-08', i18n: true },
  // TNEA B.Arch 2026 spoke pages (parent hub URL is generated from ROUTED_HUB_SLUGS below)
  { path: '/counseling/tnea-barch/eligibility-documents', lastModified: '2026-05-07' },
  { path: '/counseling/tnea-barch/important-dates', lastModified: '2026-05-07' },
  { path: '/counseling/tnea-barch/counselling-procedure', lastModified: '2026-05-07' },
  { path: '/counseling/tnea-barch/reservation-fee-concession', lastModified: '2026-05-07' },
  { path: '/counseling/tnea-barch/tfc-list', lastModified: '2026-05-07' },
  { path: '/counseling/tnea-barch/how-to-apply', lastModified: '2026-05-07' },
  { path: '/counseling/tnea-barch/faq', lastModified: '2026-05-07' },
  // KEAM B.Arch 2026 spoke pages (parent hub URL generated from ROUTED_HUB_SLUGS)
  { path: '/counseling/keam-arch/eligibility-documents', lastModified: '2026-05-08' },
  { path: '/counseling/keam-arch/important-dates', lastModified: '2026-05-08' },
  { path: '/counseling/keam-arch/allotment-process', lastModified: '2026-05-08' },
  { path: '/counseling/keam-arch/reservation-fee-concession', lastModified: '2026-05-08' },
  { path: '/counseling/keam-arch/colleges-in-kerala', lastModified: '2026-05-08' },
  { path: '/counseling/keam-arch/how-to-apply', lastModified: '2026-05-08' },
  { path: '/counseling/keam-arch/faq', lastModified: '2026-05-08' },
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
  { slug: 'online-vs-offline-nata-coaching', date: '2026-03-20', isCityGuide: false },
  { slug: 'how-to-choose-best-nata-coaching', date: '2026-03-25', isCityGuide: false },
  { slug: 'why-online-nata-coaching-future', date: '2026-04-01', isCityGuide: false },
  { slug: 'best-nata-coaching-hyderabad', date: '2026-03-15', isCityGuide: true },
  { slug: 'best-nata-coaching-delhi', date: '2026-03-18', isCityGuide: true },
  { slug: 'best-nata-coaching-mumbai', date: '2026-03-22', isCityGuide: true },
  // Phase 2.4 long-tail SEO capture posts
  { slug: 'nata-exam-pattern-2026', date: '2026-05-21', isCityGuide: false },
  { slug: 'nata-syllabus-2026-topic-wise-weightage', date: '2026-05-21', isCityGuide: false },
  { slug: 'nata-mock-test-online-free-practice-strategy', date: '2026-05-21', isCityGuide: false },
  { slug: 'nata-vs-jee-paper-2-architecture-aspirant-decision', date: '2026-05-21', isCityGuide: false },
  { slug: 'nata-online-coaching-fees-cost-breakdown-2026', date: '2026-05-21', isCityGuide: false },
  { slug: 'nata-result-2026-how-to-check-score-analysis', date: '2026-05-21', isCityGuide: false },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // Helper: build URL respecting localePrefix: 'as-needed'
  // English (default locale) has no /en/ prefix; other locales do.
  const localeUrl = (locale: string, path: string) =>
    locale === 'en' ? `${baseUrl}${path}` : `${baseUrl}/${locale}${path}`;

  // ─── Static pages ───
  // Pages with i18n: true → include all locale variants with hreflang alternates.
  // Pages without i18n (default) → English only, saves crawl budget.
  // This prevents "Duplicate, Google chose different canonical" for hardcoded English pages.
  for (const page of staticPages) {
    const isHomepage = page.path === '';
    const isHighPriority = page.path.includes('coaching') || page.path.includes('nata') || page.path.includes('jee');
    const pageLocales = page.i18n ? locales : (['en'] as const);

    for (const locale of pageLocales) {
      entries.push({
        url: localeUrl(locale, page.path),
        lastModified: new Date(page.lastModified),
        changeFrequency: isHomepage ? 'daily' : isHighPriority ? 'weekly' : 'weekly',
        priority: isHomepage ? 1.0 : isHighPriority ? 0.9 : 0.8,
        ...(page.i18n
          ? {
              alternates: {
                languages: Object.fromEntries(
                  locales.map((l) => [l, localeUrl(l, page.path)])
                ),
              },
            }
          : {}),
      });
    }
  }

  // Native-script NATA online coaching landing pages.
  // /nata-online-coaching in the static list above ships only English (default).
  // Tamil and Hindi versions are dedicated native-content components (not
  // hardcoded English), so they ARE indexable and need their own sitemap rows.
  // Kannada and Malayalam variants are still noindex-headed and intentionally omitted.
  const nataOnlineCoachingLangs = ['en', 'ta', 'hi'] as const;
  const nataOnlineCoachingPath = '/nata-online-coaching';
  for (const locale of nataOnlineCoachingLangs) {
    const url = localeUrl(locale, nataOnlineCoachingPath);
    // The English row was already pushed by the static-pages loop. Skip it here
    // to avoid a duplicate entry but still register the ta/hi rows.
    if (locale === 'en') continue;
    entries.push({
      url,
      lastModified: new Date('2026-05-21'),
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: {
        languages: Object.fromEntries(
          nataOnlineCoachingLangs.map((l) => [l, localeUrl(l, nataOnlineCoachingPath)])
        ),
      },
    });
  }

  // Course pages: all locales (course pages use translations)
  for (const locale of locales) {
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
  }

  // Blog posts: English only (blog content is hardcoded English)
  for (const post of blogSlugs) {
    const path = `/blog/${post.slug}`;
    entries.push({
      url: `${baseUrl}${path}`,
      lastModified: new Date(post.date),
      changeFrequency: 'monthly',
      priority: post.isCityGuide ? 0.85 : 0.7,
    });
  }

  // ─── State pages: ENGLISH ONLY ───
  // State hub pages aggregate city pages within each state.
  const indianStates = getIndianStates();
  for (const state of indianStates) {
    entries.push({
      url: `${baseUrl}/coaching/nata-coaching-in-${state.slug}`,
      lastModified: new Date('2026-04-04'),
      changeFrequency: 'weekly',
      priority: 0.85,
    });
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

  // ─── College Hub: state pages (all locales) ───────────────────────────────
  try {
    const activeStates = await getActiveStates();
    for (const { state_slug } of activeStates) {
      const statePath = `/colleges/${state_slug}`;
      for (const locale of locales) {
        entries.push({
          url: localeUrl(locale, statePath),
          lastModified: new Date('2026-04-12'),
          changeFrequency: 'weekly' as const,
          priority: 0.85,
          alternates: {
            languages: Object.fromEntries(locales.map((l) => [l, localeUrl(l, statePath)])),
          },
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch college state slugs for sitemap:', err);
  }

  // ─── College Hub: individual college pages (all locales) ─────────────────
  try {
    const collegeSlugs = await getAllCollegeSlugs();
    for (const { state, slug } of collegeSlugs) {
      const collegePath = `/colleges/${state}/${slug}`;
      for (const locale of locales) {
        entries.push({
          url: localeUrl(locale, collegePath),
          lastModified: new Date('2026-04-12'),
          changeFrequency: 'weekly' as const,
          priority: 0.8,
          alternates: {
            languages: Object.fromEntries(locales.map((l) => [l, localeUrl(l, collegePath)])),
          },
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch college slugs for sitemap:', err);
  }

  // ─── NIRF ranking per-college history pages ──────────────────────────────
  try {
    const nirfSlugs = await getNIRFRankedCollegeSlugs();
    for (const slug of nirfSlugs) {
      const path = `/colleges/rankings/nirf/${slug}`;
      for (const locale of locales) {
        entries.push({
          url: localeUrl(locale, path),
          lastModified: new Date('2026-05-20'),
          changeFrequency: 'monthly' as const,
          priority: 0.7,
          alternates: {
            languages: Object.fromEntries(locales.map((l) => [l, localeUrl(l, path)])),
          },
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch NIRF college slugs for sitemap:', err);
  }

  // ─── Fee-based programmatic pages ────────────────────────────────────────
  const FEE_RANGE_SLUGS = [
    'below-1-lakh', 'below-2-lakhs', 'below-3-lakhs',
    'below-5-lakhs', '5-to-10-lakhs', 'above-10-lakhs',
  ];
  for (const range of FEE_RANGE_SLUGS) {
    entries.push({
      url: `${baseUrl}/colleges/fees/${range}`,
      lastModified: new Date('2026-04-13'),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    });
  }

  // ─── Counselling Hub parent pages (registry-driven, English-only) ────────
  // Parent hubs come from ROUTED_HUB_SLUGS so a new state hub auto-appears
  // here once its route file is added and the slug is registered.
  // Spoke pages (e.g. /counseling/tnea-barch/eligibility-documents) are listed
  // explicitly in staticPages above because they are bespoke per-hub.
  for (const slug of ROUTED_HUB_SLUGS) {
    entries.push({
      url: `${baseUrl}/counseling/${slug}`,
      lastModified: new Date('2026-05-08'),
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    });
  }

  // ─── Counselling concept explainers (English-only) ──────────────────────
  const COUNSELLING_CONCEPTS = [
    'freeze-float-slide',
    'josaa-vs-csab',
    'aat-explained',
    'nata-vs-jee-paper-2',
    'eligibility-45-vs-50-rule',
  ];
  for (const slug of COUNSELLING_CONCEPTS) {
    entries.push({
      url: `${baseUrl}/counseling/concepts/${slug}`,
      lastModified: new Date('2026-05-08'),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    });
  }

  return entries;
}
