import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateCollegesListingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import {
  getCollegesISR,
  getLandingStats,
  getActiveStates,
  getCollegeCountByType,
  getCollegeCountByCounseling,
  getFeaturedColleges,
  getActiveCities,
  getActiveCounselingSystems,
} from '@/lib/college-hub/queries';
import {
  CollegeHubHero,
  PlatformFeatures,
  BrowseByCategory,
  FeaturedCollegesCarousel,
  ForCollegesCTA,
  CollegeHubFAQ,
  BrowseAllSection,
} from '@/components/college-hub/landing';
import ExploreCategoriesSection from '@/components/college-hub/landing/ExploreCategoriesSection';
import { BROWSE_PAGE_SIZE, toListingCollege } from '@/lib/college-hub/listing-filter';

// Matches the rest of the college hub. This data is seasonal, not hourly.
export const revalidate = 86400;

type Props = {
  params: { locale: string };
};

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  return generateCollegesListingMetadata(locale);
}

export default async function CollegesPage({ params: { locale } }: Props) {
  setRequestLocale(locale);

  // No searchParams here: reading them made this "ISR" page render on every
  // request. The Browse All section gets the default first page; filtered views
  // are fetched by the section from the edge-cached /api/colleges/browse.
  // Fetch all data in parallel — wrap each query so one failure doesn't crash the page
  let colleges: any[] = [];
  let count = 0;
  let stats = { totalColleges: 0, totalStates: 0, coaApprovedCount: 0 };
  let stateData: any[] = [];
  let typeData: any[] = [];
  let counselingData: any[] = [];
  let featuredColleges: any[] = [];
  let cityData: any[] = [];
  let counselingSystemData: any[] = [];

  try {
    const results = await Promise.allSettled([
      getCollegesISR({ sortBy: 'arch_index', page: 1, limit: BROWSE_PAGE_SIZE }),
      getLandingStats(),
      getActiveStates(),
      getCollegeCountByType(),
      getCollegeCountByCounseling(),
      getFeaturedColleges(),
      getActiveCities(),
      getActiveCounselingSystems(),
    ]);

    if (results[0].status === 'fulfilled') { colleges = results[0].value.data; count = results[0].value.count; }
    if (results[1].status === 'fulfilled') stats = results[1].value;
    if (results[2].status === 'fulfilled') stateData = results[2].value;
    if (results[3].status === 'fulfilled') typeData = results[3].value;
    if (results[4].status === 'fulfilled') counselingData = results[4].value;
    if (results[5].status === 'fulfilled') featuredColleges = results[5].value;
    if (results[6].status === 'fulfilled') cityData = results[6].value;
    if (results[7].status === 'fulfilled') counselingSystemData = results[7].value;

    // Log any failures for Vercel function logs
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[CollegeHub] Query ${i} failed:`, r.reason?.message ?? r.reason);
      }
    });
  } catch (err) {
    console.error('[CollegeHub] Promise.allSettled failed:', err);
  }

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />

      {/* Section 1: Hero */}
      <CollegeHubHero stats={stats} />

      {/* Section 2: What's Inside */}
      <PlatformFeatures />

      {/* Section 3: Browse by Category */}
      <BrowseByCategory
        stateData={stateData}
        counselingData={counselingData}
        typeData={typeData}
        locale={locale}
      />

      {/* Section 3.5: Explore Categories */}
      <ExploreCategoriesSection
        stateData={stateData}
        counselingData={counselingSystemData}
        cityData={cityData}
      />

      {/* Section 4: Featured Colleges */}
      <FeaturedCollegesCarousel colleges={featuredColleges} />

      {/* Section 5: For Colleges */}
      <ForCollegesCTA />

      {/* Section 6: FAQ */}
      <CollegeHubFAQ />

      {/* Section 7: Browse All (existing filter + grid) */}
      <BrowseAllSection
        initialColleges={colleges.map(toListingCollege)}
        initialCount={count}
        cityCounts={cityData}
        typeCounts={typeData}
      />
    </>
  );
}
