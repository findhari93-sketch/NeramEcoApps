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

  // Fetch all data in parallel
  const [
    { data: colleges, count },
    stats,
    stateData,
    typeData,
    counselingData,
    featuredColleges,
  ] = await Promise.all([
    getColleges(filters),
    getLandingStats(),
    getActiveStates(),
    getCollegeCountByType(),
    getCollegeCountByCounseling(),
    getFeaturedColleges(),
  ]);

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
