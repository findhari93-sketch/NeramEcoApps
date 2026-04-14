import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateCollegesListingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import {
  getColleges,
  getLandingStats,
  getActiveStates,
  getCollegeCountByType,
  getCollegeCountByCounseling,
  getFeaturedColleges,
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
import type { CollegeFilters } from '@/lib/college-hub/types';

export const revalidate = 3600;

type Props = {
  params: { locale: string };
  searchParams: {
    state?: string;
    type?: string;
    counseling?: string;
    coa?: string;
    naac?: string;
    minFee?: string;
    maxFee?: string;
    q?: string;
    sort?: string;
    page?: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  return generateCollegesListingMetadata(locale);
}

export default async function CollegesPage({ params: { locale }, searchParams }: Props) {
  setRequestLocale(locale);

  // Parse filters for the Browse All section
  const filters: CollegeFilters = {
    state: searchParams.state,
    type: searchParams.type,
    counselingSystem: searchParams.counseling as CollegeFilters['counselingSystem'],
    coa: searchParams.coa === 'true' ? true : undefined,
    naacGrade: searchParams.naac,
    minFee: searchParams.minFee ? Number(searchParams.minFee) : undefined,
    maxFee: searchParams.maxFee ? Number(searchParams.maxFee) : undefined,
    search: searchParams.q,
    sortBy: (searchParams.sort as CollegeFilters['sortBy']) ?? 'arch_index',
    page: searchParams.page ? Number(searchParams.page) : 1,
    limit: 20,
  };

  // Fetch all data in parallel — wrap each query so one failure doesn't crash the page
  let colleges: any[] = [];
  let count = 0;
  let stats = { totalColleges: 0, totalStates: 0, coaApprovedCount: 0 };
  let stateData: any[] = [];
  let typeData: any[] = [];
  let counselingData: any[] = [];
  let featuredColleges: any[] = [];

  try {
    const results = await Promise.allSettled([
      getColleges(filters),
      getLandingStats(),
      getActiveStates(),
      getCollegeCountByType(),
      getCollegeCountByCounseling(),
      getFeaturedColleges(),
    ]);

    if (results[0].status === 'fulfilled') { colleges = results[0].value.data; count = results[0].value.count; }
    if (results[1].status === 'fulfilled') stats = results[1].value;
    if (results[2].status === 'fulfilled') stateData = results[2].value;
    if (results[3].status === 'fulfilled') typeData = results[3].value;
    if (results[4].status === 'fulfilled') counselingData = results[4].value;
    if (results[5].status === 'fulfilled') featuredColleges = results[5].value;

    // Log any failures for Vercel function logs
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[CollegeHub] Query ${i} failed:`, r.reason?.message ?? r.reason);
      }
    });
  } catch (err) {
    console.error('[CollegeHub] Promise.allSettled failed:', err);
  }

  const totalPages = Math.ceil(count / 20);

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

      {/* Section 4: Featured Colleges */}
      <FeaturedCollegesCarousel colleges={featuredColleges} />

      {/* Section 5: For Colleges */}
      <ForCollegesCTA />

      {/* Section 6: FAQ */}
      <CollegeHubFAQ />

      {/* Section 7: Browse All (existing filter + grid) */}
      <BrowseAllSection
        colleges={colleges}
        totalCount={count}
        totalPages={totalPages}
        filters={filters}
      />
    </>
  );
}
