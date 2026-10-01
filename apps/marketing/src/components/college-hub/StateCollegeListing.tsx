'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Typography, Box, Stack, Divider, Grid } from '@mui/material';
import { FEATURED_COUNT, AD_INTERVAL_COMPACT, AD_AFTER_FEATURED } from '@/lib/college-hub/constants';
import {
  cityCountsOf,
  filterAndSortColleges,
  parseListingFilters,
  typeCountsOf,
  type ListingCollege,
} from '@/lib/college-hub/listing-filter';
import FilterSidebar from './FilterSidebar';
import CollegeListingLayout from './CollegeListingLayout';
import FeaturedCollegeCard from './FeaturedCollegeCard';
import CompactCollegeCard from './CompactCollegeCard';
import CollegeGridCard from './CollegeGridCard';
import CollegeListRow from './CollegeListRow';
import SponsoredBanner from './SponsoredBanner';
import CollegeSearch from './CollegeSearch';
import ActiveFilterPills from './ActiveFilterPills';
import ViewModeToggle from './ViewModeToggle';
import { parseViewMode } from './view-mode';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

interface Props {
  colleges: ListingCollege[];
  state: string;
  stateName: string;
}

type Params = { get(key: string): string | null };
const NO_PARAMS: Params = { get: () => null };

/**
 * The /colleges/[state] listing. The page is ISR and passes the state's full
 * list once; the URL filters (?type=, ?city=, ?sort=...) are applied here.
 *
 * Server render (and crawlers) get the default view: the Suspense fallback is
 * this same body with no params. After hydration the body re-renders with the
 * real search params. The URL-driven widgets each sit in their own Suspense so
 * reading search params never bails the whole page out of static rendering.
 */
export default function StateCollegeListing(props: Props) {
  const cityCounts = useMemo(() => cityCountsOf(props.colleges), [props.colleges]);
  const typeCounts = useMemo(() => typeCountsOf(props.colleges), [props.colleges]);
  const shared = { ...props, cityCounts, typeCounts };
  return (
    <Suspense fallback={<ListingBody {...shared} params={NO_PARAMS} />}>
      <ListingWithParams {...shared} />
    </Suspense>
  );
}

type BodyProps = Props & {
  cityCounts: ReturnType<typeof cityCountsOf>;
  typeCounts: ReturnType<typeof typeCountsOf>;
};

function ListingWithParams(props: BodyProps) {
  const params = useSearchParams();
  return <ListingBody {...props} params={params ?? NO_PARAMS} />;
}

function ListingBody({ colleges, state, stateName, cityCounts, typeCounts, params }: BodyProps & { params: Params }) {
  const key = params === NO_PARAMS ? '' : String(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseListingFilters(params, { state }), [key, state]);
  const results = useMemo(() => filterAndSortColleges(colleges, filters), [colleges, filters]);
  const view = parseViewMode(params.get('view') ?? undefined);
  const featured = results.slice(0, FEATURED_COUNT);
  const compact = results.slice(FEATURED_COUNT);

  return (
    <CollegeListingLayout
      sidebar={
        <Suspense fallback={null}>
          <FilterSidebar filters={filters} totalCount={results.length} cityCounts={cityCounts} typeCounts={typeCounts} />
        </Suspense>
      }
    >
      <Breadcrumbs items={[{ name: 'Colleges', href: '/colleges' }, { name: stateName }]} />

      {/* Page Header */}
      <Box sx={{ mb: { xs: 1, sm: 2 } }}>
        <Typography variant="h1" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 800, lineHeight: 1.2 }}>
          Best B.Arch Colleges in {stateName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: { xs: '0.8rem', sm: '0.85rem' } }}>
          <strong style={{ color: '#1565C0' }}>{results.length}</strong> colleges, compare fees, NATA cutoffs, NAAC grades, and placements
        </Typography>
      </Box>

      {/* Search bar (desktop) */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 1.5 }}>
        <Suspense fallback={<Box sx={{ height: 40 }} />}>
          <CollegeSearch defaultValue={filters.search} />
        </Suspense>
      </Box>

      <Suspense fallback={null}>
        <ActiveFilterPills stateName={stateName} />
      </Suspense>

      {/* Results count + view toggle */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
          Showing <strong>{results.length}</strong> of {colleges.length} colleges
        </Typography>
        <Suspense fallback={<Box sx={{ height: 36 }} />}>
          <ViewModeToggle value={view} />
        </Suspense>
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
              {(i + 1) % AD_INTERVAL_COMPACT === 0 && i + 1 < compact.length && <SponsoredBanner variant="compact" />}
            </Box>
          ))}
        </>
      )}

      {view === 'grid' && (
        <Grid container spacing={1.25}>
          {results.map((college, i) => (
            <Grid key={college.id} item xs={6} sm={4} lg={3}>
              <CollegeGridCard college={college} rank={i + 1} />
            </Grid>
          ))}
        </Grid>
      )}

      {view === 'list' && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', bgcolor: 'background.paper' }}>
          {results.map((college, i) => (
            <CollegeListRow key={college.id} college={college} rank={i + 1} />
          ))}
        </Box>
      )}

      {/* Empty state */}
      {results.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" color="text.secondary">No colleges match your filters</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Try adjusting your filters or clearing them to see all colleges.
          </Typography>
        </Box>
      )}
    </CollegeListingLayout>
  );
}
