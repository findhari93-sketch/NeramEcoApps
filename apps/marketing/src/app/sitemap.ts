import { MetadataRoute } from 'next';
import { locales, defaultLocale } from '@/i18n';

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
  '/privacy',
  '/terms',
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

// Location data for city pages
const locations = [
  // Tamil Nadu
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
  // Karnataka
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
  // Gulf Countries
  { city: 'dubai', state: 'uae' },
  { city: 'abu-dhabi', state: 'uae' },
  { city: 'sharjah', state: 'uae' },
  { city: 'doha', state: 'qatar' },
  { city: 'muscat', state: 'oman' },
  { city: 'riyadh', state: 'saudi-arabia' },
  { city: 'jeddah', state: 'saudi-arabia' },
  { city: 'dammam', state: 'saudi-arabia' },
  { city: 'kuwait-city', state: 'kuwait' },
  { city: 'manama', state: 'bahrain' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const currentDate = new Date();

  // Add static pages for each locale
  for (const locale of locales) {
    for (const page of staticPages) {
      entries.push({
        url: `${baseUrl}/${locale}${page}`,
        lastModified: currentDate,
        changeFrequency: page === '' ? 'daily' : 'weekly',
        priority: page === '' ? 1.0 : page.includes('coaching') ? 0.9 : 0.8,
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
  }

  // TODO: Add dynamic blog posts from database
  // const blogPosts = await getBlogPosts();
  // for (const post of blogPosts) {
  //   for (const locale of locales) {
  //     entries.push({
  //       url: `${baseUrl}/${locale}/blog/${post.slug}`,
  //       lastModified: new Date(post.updated_at),
  //       changeFrequency: 'weekly',
  //       priority: 0.6,
  //     });
  //   }
  // }

  return entries;
}
