import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Typography, Box, Stack, Divider, Grid } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateStateListingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getColleges, getCitiesForState, getTypeCountsForState } from '@/lib/college-hub/queries';
import { STATE_NAMES, FEATURED_COUNT, AD_INTERVAL_COMPACT, AD_AFTER_FEATURED } from '@/lib/college-hub/constants';
import type { CollegeFilters } from '@/lib/college-hub/types';
import FilterSidebar from '@/components/college-hub/FilterSidebar';
import CollegeListingLayout from '@/components/college-hub/CollegeListingLayout';
import FeaturedCollegeCard from '@/components/college-hub/FeaturedCollegeCard';
import CompactCollegeCard from '@/components/college-hub/CompactCollegeCard';
import CollegeGridCard from '@/components/college-hub/CollegeGridCard';
import CollegeListRow from '@/components/college-hub/CollegeListRow';
import SponsoredBanner from '@/components/college-hub/SponsoredBanner';
import CollegeSearch from '@/components/college-hub/CollegeSearch';
import ActiveFilterPills from '@/components/college-hub/ActiveFilterPills';
import ViewModeToggle from '@/components/college-hub/ViewModeToggle';
import { parseViewMode } from '@/components/college-hub/view-mode';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

// Dynamic: filters require searchParams
export const dynamic = 'force-dynamic';

type Props = {
  params: { locale: string; state: string };
  searchParams: Record<string, string | undefined>;
};

export async function generateMetadata({ params: { locale, state } }: Props): Promise<Metadata> {
  const stateName = STATE_NAMES[state] ?? state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const { count } = await getColleges({ state, limit: 1 });
  return generateStateListingMetadata(locale, state, stateName, count);
}

export default async function StateCollegesPage({ params: { locale, state }, searchParams }: Props) {
  setRequestLocale(locale);

  const stateName = STATE_NAMES[state] ?? state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const filters: CollegeFilters = {
    state,
    type: searchParams.type,
    exam: searchParams.exam as CollegeFilters['exam'],
    city: searchParams.city,
    coa: searchParams.coa === 'true' ? true : undefined,
    naacGrade: searchParams.naac,
    minFee: searchParams.minFee ? Number(searchParams.minFee) : undefined,
    maxFee: searchParams.maxFee ? Number(searchParams.maxFee) : undefined,
    search: searchParams.q,
    sortBy: (searchParams.sort as CollegeFilters['sortBy']) ?? 'arch_index',
    page: searchParams.page ? Number(searchParams.page) : 1,
    limit: 50,
  };

  const [{ data: colleges, count: totalCount }, cityCounts, typeCounts] = await Promise.all([
    getColleges(filters),
    getCitiesForState(state),
    getTypeCountsForState(state),
  ]);

  if (colleges.length === 0 && !searchParams.q && !searchParams.type) notFound();

  const view = parseViewMode(searchParams.view);
  const featured = colleges.slice(0, FEATURED_COUNT);
  const compact = colleges.slice(FEATURED_COUNT);

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `B.Arch in ${stateName}`, path: `/colleges/${state}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box sx={{ py: { xs: 1, sm: 4 } }}>
        <CollegeListingLayout
          sidebar={
            <FilterSidebar
              filters={filters}
              totalCount={totalCount}
              cityCounts={cityCounts}
              typeCounts={typeCounts}
            />
          }
        >
          <Breadcrumbs items={[
            { name: 'Colleges', href: '/colleges' },
            { name: stateName },
          ]} />

          {/* Page Header */}
          <Box sx={{ mb: { xs: 1, sm: 2 } }}>
            <Typography variant="h1" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 800, lineHeight: 1.2 }}>
              Best B.Arch Colleges in {stateName}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: { xs: '0.8rem', sm: '0.85rem' } }}>
              <strong style={{ color: '#1565C0' }}>{totalCount}</strong> colleges, compare fees, NATA cutoffs, NAAC grades, and placements
            </Typography>
          </Box>

          {/* Search bar (desktop) */}
          <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 1.5 }}>
            <CollegeSearch defaultValue={filters.search} />
          </Box>

          <ActiveFilterPills stateName={stateName} />

          {/* Results count + view toggle */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
              Showing <strong>{colleges.length}</strong> of {totalCount} colleges
            </Typography>
            <ViewModeToggle value={view} />
          </Stack>

          {view === 'detailed' && (
            <>
              {featured.map((college, i) => (
                <Box key={college.id}>
                  <FeaturedCollegeCard college={college} rank={i + 1} />
                  {i + 1 === AD_AFTER_FEATURED && <SponsoredBanner variant="featured" />}
                </Box>
              ))}

              {compact.length > 0 && (
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ my: 2 }}>
                  <Divider sx={{ flex: 1 }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>
                    More Colleges
                  </Typography>
                  <Divider sx={{ flex: 1 }} />
                </Stack>
              )}

              {compact.map((college, i) => (
                <Box key={college.id}>
                  <CompactCollegeCard college={college} rank={FEATURED_COUNT + i + 1} />
                  {(i + 1) % AD_INTERVAL_COMPACT === 0 && i + 1 < compact.length && (
                    <SponsoredBanner variant="compact" />
                  )}
                </Box>
              ))}
            </>
          )}

          {view === 'grid' && (
            <Grid container spacing={1.25}>
              {colleges.map((college, i) => (
                <Grid key={college.id} item xs={6} sm={4} lg={3}>
                  <CollegeGridCard college={college} rank={i + 1} />
                </Grid>
              ))}
            </Grid>
          )}

          {view === 'list' && (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
              {colleges.map((college, i) => (
                <CollegeListRow key={college.id} college={college} rank={i + 1} />
              ))}
            </Box>
          )}

          {/* Empty state */}
          {colleges.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography variant="h6" color="text.secondary">No colleges match your filters</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Try adjusting your filters or clearing them to see all colleges.
              </Typography>
            </Box>
          )}
        </CollegeListingLayout>
      </Box>
    </>
  );
}
