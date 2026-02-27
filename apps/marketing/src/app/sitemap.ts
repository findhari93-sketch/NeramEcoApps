import { MetadataRoute } from 'next';
import { locales } from '@/i18n';
import { getAllCenterSeoSlugs } from '@neram/database/queries';

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

// Location data for city pages (comprehensive coverage)
const locations = [
  // Tamil Nadu - All 38 districts
  { city: 'chennai', state: 'tamil-nadu' },
  { city: 'coimbatore', state: 'tamil-nadu' },
  { city: 'madurai', state: 'tamil-nadu' },
  { city: 'trichy', state: 'tamil-nadu' },
  { city: 'salem', state: 'tamil-nadu' },
  { city: 'tirunelveli', state: 'tamil-nadu' },
  { city: 'erode', state: 'tamil-nadu' },
  { city: 'vellore', state: 'tamil-nadu' },
  { city: 'thoothukudi', state: 'tamil-nadu' },
  { city: 'tiruppur', state: 'tamil-nadu' },
  { city: 'dindigul', state: 'tamil-nadu' },
  { city: 'thanjavur', state: 'tamil-nadu' },
  { city: 'ranipet', state: 'tamil-nadu' },
  { city: 'sivakasi', state: 'tamil-nadu' },
  { city: 'karur', state: 'tamil-nadu' },
  { city: 'udhagamandalam', state: 'tamil-nadu' },
  { city: 'hosur', state: 'tamil-nadu' },
  { city: 'nagercoil', state: 'tamil-nadu' },
  { city: 'kanchipuram', state: 'tamil-nadu' },
  { city: 'kumbakonam', state: 'tamil-nadu' },
  { city: 'rajapalayam', state: 'tamil-nadu' },
  { city: 'pudukkottai', state: 'tamil-nadu' },
  { city: 'ambur', state: 'tamil-nadu' },
  { city: 'tiruvannamalai', state: 'tamil-nadu' },
  { city: 'nagapattinam', state: 'tamil-nadu' },
  { city: 'chengalpattu', state: 'tamil-nadu' },
  { city: 'ariyalur', state: 'tamil-nadu' },
  { city: 'kallakurichi', state: 'tamil-nadu' },
  { city: 'krishnagiri', state: 'tamil-nadu' },
  { city: 'dharmapuri', state: 'tamil-nadu' },
  { city: 'mayiladuthurai', state: 'tamil-nadu' },
  { city: 'perambalur', state: 'tamil-nadu' },
  { city: 'ramanathapuram', state: 'tamil-nadu' },
  { city: 'sivaganga', state: 'tamil-nadu' },
  { city: 'tenkasi', state: 'tamil-nadu' },
  { city: 'theni', state: 'tamil-nadu' },
  { city: 'thiruvarur', state: 'tamil-nadu' },
  { city: 'viluppuram', state: 'tamil-nadu' },
  { city: 'virudhunagar', state: 'tamil-nadu' },
  // Karnataka - All 31 districts
  { city: 'bangalore', state: 'karnataka' },
  { city: 'mysore', state: 'karnataka' },
  { city: 'mangalore', state: 'karnataka' },
  { city: 'hubli', state: 'karnataka' },
  { city: 'belgaum', state: 'karnataka' },
  { city: 'gulbarga', state: 'karnataka' },
  { city: 'davangere', state: 'karnataka' },
  { city: 'bellary', state: 'karnataka' },
  { city: 'shimoga', state: 'karnataka' },
  { city: 'tumkur', state: 'karnataka' },
  { city: 'bidar', state: 'karnataka' },
  { city: 'chamarajanagar', state: 'karnataka' },
  { city: 'chikkaballapura', state: 'karnataka' },
  { city: 'chikkamagaluru', state: 'karnataka' },
  { city: 'chitradurga', state: 'karnataka' },
  { city: 'dharwad', state: 'karnataka' },
  { city: 'gadag', state: 'karnataka' },
  { city: 'hassan', state: 'karnataka' },
  { city: 'haveri', state: 'karnataka' },
  { city: 'kodagu', state: 'karnataka' },
  { city: 'kolar', state: 'karnataka' },
  { city: 'koppal', state: 'karnataka' },
  { city: 'mandya', state: 'karnataka' },
  { city: 'raichur', state: 'karnataka' },
  { city: 'ramanagara', state: 'karnataka' },
  { city: 'udupi', state: 'karnataka' },
  { city: 'karwar', state: 'karnataka' },
  { city: 'bijapur', state: 'karnataka' },
  { city: 'yadgir', state: 'karnataka' },
  { city: 'vijayanagara', state: 'karnataka' },
  { city: 'bengaluru-rural', state: 'karnataka' },
  // Kerala
  { city: 'thiruvananthapuram', state: 'kerala' },
  { city: 'kochi', state: 'kerala' },
  { city: 'kozhikode', state: 'kerala' },
  { city: 'thrissur', state: 'kerala' },
  { city: 'kollam', state: 'kerala' },
  { city: 'palakkad', state: 'kerala' },
  { city: 'alappuzha', state: 'kerala' },
  { city: 'kannur', state: 'kerala' },
  { city: 'kottayam', state: 'kerala' },
  // Andhra Pradesh & Telangana
  { city: 'hyderabad', state: 'telangana' },
  { city: 'visakhapatnam', state: 'andhra-pradesh' },
  { city: 'vijayawada', state: 'andhra-pradesh' },
  { city: 'guntur', state: 'andhra-pradesh' },
  { city: 'tirupati', state: 'andhra-pradesh' },
  { city: 'warangal', state: 'telangana' },
  { city: 'nellore', state: 'andhra-pradesh' },
  { city: 'rajahmundry', state: 'andhra-pradesh' },
  { city: 'kakinada', state: 'andhra-pradesh' },
  // Maharashtra
  { city: 'mumbai', state: 'maharashtra' },
  { city: 'pune', state: 'maharashtra' },
  { city: 'nagpur', state: 'maharashtra' },
  { city: 'nashik', state: 'maharashtra' },
  { city: 'aurangabad', state: 'maharashtra' },
  // Gujarat
  { city: 'ahmedabad', state: 'gujarat' },
  { city: 'surat', state: 'gujarat' },
  { city: 'vadodara', state: 'gujarat' },
  { city: 'rajkot', state: 'gujarat' },
  // Delhi NCR
  { city: 'delhi', state: 'delhi' },
  { city: 'noida', state: 'uttar-pradesh' },
  { city: 'gurgaon', state: 'haryana' },
  { city: 'faridabad', state: 'haryana' },
  { city: 'ghaziabad', state: 'uttar-pradesh' },
  // Other major cities
  { city: 'kolkata', state: 'west-bengal' },
  { city: 'jaipur', state: 'rajasthan' },
  { city: 'lucknow', state: 'uttar-pradesh' },
  { city: 'kanpur', state: 'uttar-pradesh' },
  { city: 'patna', state: 'bihar' },
  { city: 'indore', state: 'madhya-pradesh' },
  { city: 'bhopal', state: 'madhya-pradesh' },
  { city: 'chandigarh', state: 'chandigarh' },
  { city: 'bhubaneswar', state: 'odisha' },
  // UAE
  { city: 'dubai', state: 'uae' },
  { city: 'abu-dhabi', state: 'uae' },
  { city: 'sharjah', state: 'uae' },
  { city: 'ajman', state: 'uae' },
  { city: 'ras-al-khaimah', state: 'uae' },
  { city: 'fujairah', state: 'uae' },
  // Qatar
  { city: 'doha', state: 'qatar' },
  { city: 'al-wakrah', state: 'qatar' },
  { city: 'al-khor', state: 'qatar' },
  { city: 'lusail', state: 'qatar' },
  // Oman
  { city: 'muscat', state: 'oman' },
  { city: 'seeb', state: 'oman' },
  { city: 'sohar', state: 'oman' },
  { city: 'salalah', state: 'oman' },
  { city: 'nizwa', state: 'oman' },
  // Saudi Arabia
  { city: 'riyadh', state: 'saudi-arabia' },
  { city: 'jeddah', state: 'saudi-arabia' },
  { city: 'dammam', state: 'saudi-arabia' },
  { city: 'al-khobar', state: 'saudi-arabia' },
  { city: 'jubail', state: 'saudi-arabia' },
  { city: 'yanbu', state: 'saudi-arabia' },
  { city: 'makkah', state: 'saudi-arabia' },
  { city: 'madinah', state: 'saudi-arabia' },
  // Kuwait
  { city: 'kuwait-city', state: 'kuwait' },
  { city: 'farwaniya', state: 'kuwait' },
  { city: 'salmiya', state: 'kuwait' },
  { city: 'hawally', state: 'kuwait' },
  // Bahrain
  { city: 'manama', state: 'bahrain' },
  { city: 'muharraq', state: 'bahrain' },
  { city: 'riffa', state: 'bahrain' },
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

    // Add location pages
    for (const location of locations) {
      entries.push({
        url: `${baseUrl}/${locale}/coaching/nata-coaching/nata-coaching-centers-in-${location.city}`,
        lastModified: currentDate,
        changeFrequency: 'monthly',
        priority: 0.7,
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
