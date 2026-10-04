'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Typography, Stack, Divider, Grid, Skeleton, Button } from '@mui/material';
import FilterSidebar from '../FilterSidebar';
import CollegeListingLayout from '../CollegeListingLayout';
import FeaturedCollegeCard from '../FeaturedCollegeCard';
import CompactCollegeCard from '../CompactCollegeCard';
import CollegeGridCard from '../CollegeGridCard';
import CollegeListRow from '../CollegeListRow';
import SponsoredBanner from '../SponsoredBanner';
import CollegeSearch from '../CollegeSearch';
import ActiveFilterPills from '../ActiveFilterPills';
import ClientPagination from '../ClientPagination';
import ViewModeToggle from '../ViewModeToggle';
import { parseViewMode } from '../view-mode';
import { BROWSE_PAGE_SIZE, hasListingFilters, parseListingFilters, type ListingCollege } from '@/lib/college-hub/listing-filter';
import { FEATURED_COUNT, AD_INTERVAL_COMPACT, AD_AFTER_FEATURED } from '@/lib/college-hub/constants';

interface BrowseAllSectionProps {
  /** The default first page (ArchIndex order), rendered on the server. */
  initialColleges: ListingCollege[];
  initialCount: number;
  cityCounts?: { city: string; city_slug: string; count: number }[];
  typeCounts?: { type: string; count: number }[];
}

type Params = { get(key: string): string | null };
const NO_PARAMS: Params = { get: () => null };

/**
 * "Browse all colleges" on /colleges. The page is static (ISR); the server
 * renders the default first page. When the URL carries filters or a page
 * number, results come from /api/colleges/browse, which the CDN caches per
 * query string. Reading search params happens inside Suspense so the page is
 * not bailed out of static rendering.
 */
export default function BrowseAllSection(props: BrowseAllSectionProps) {
  return (
    <Suspense fallback={<BrowseBody {...props} params={NO_PARAMS} />}>
      <BrowseWithParams {...props} />
    </Suspense>
  );
}

function BrowseWithParams(props: BrowseAllSectionProps) {
  const params = useSearchParams();
  return <BrowseBody {...props} params={params ?? NO_PARAMS} />;
}

type Fetched = { key: string; colleges: ListingCollege[]; count: number } | { key: string; error: true };

function BrowseBody({
  initialColleges,
  initialCount,
  cityCounts,
  typeCounts,
  params,
}: BrowseAllSectionProps & { params: Params }) {
  const key = params === NO_PARAMS ? '' : String(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseListingFilters(params, { limit: BROWSE_PAGE_SIZE }), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => hasListingFilters(params), [key]);
  const queryKey = useMemo(() => {
    if (!filtered) return '';
    const qs = new URLSearchParams(key);
    qs.delete('view');
    return qs.toString();
  }, [filtered, key]);

  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!queryKey) return;
    const controller = new AbortController();
    fetch(`/api/colleges/browse?${queryKey}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { data: ListingCollege[]; count: number }) =>
        setFetched({ key: queryKey, colleges: json.data ?? [], count: Number(json.count) || 0 }),
      )
      .catch((err) => {
        if ((err as Error)?.name !== 'AbortError') setFetched({ key: queryKey, error: true });
      });
    return () => controller.abort();
  }, [queryKey, attempt]);

  const current = queryKey && fetched?.key === queryKey ? fetched : null;
  const loading = Boolean(queryKey) && !current;
  const failed = Boolean(current && 'error' in current);
  const colleges = !queryKey ? initialColleges : current && !('error' in current) ? current.colleges : [];
  const totalCount = !queryKey ? initialCount : current && !('error' in current) ? current.count : 0;
  const totalPages = Math.ceil(totalCount / BROWSE_PAGE_SIZE);

  const view = parseViewMode(params.get('view') ?? undefined);
  const featured = colleges.slice(0, FEATURED_COUNT);
  const compact = colleges.slice(FEATURED_COUNT);

  return (
    <Box id="browse" sx={{ py: { xs: 2, sm: 4, md: 6 }, scrollMarginTop: '80px' }}>
      <CollegeListingLayout
        sidebar={
          <Suspense fallback={null}>
            <FilterSidebar
              filters={filters}
              totalCount={totalCount}
              cityCounts={cityCounts}
              typeCounts={typeCounts}
            />
          </Suspense>
        }
      >
        {/* Section header */}
        <Box sx={{ mb: { xs: 1, sm: 2 } }}>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.15rem', sm: '1.35rem' },
              fontWeight: 800,
              color: '#0f172a',
              lineHeight: 1.2,
            }}
          >
            {filters.search ? `Results for "${filters.search}"` : 'Browse All Colleges'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: { xs: '0.8rem', sm: '0.85rem' } }}>
            {filters.search ? (
              <>
                <strong style={{ color: '#1565C0' }}>{totalCount.toLocaleString()}</strong>{' '}
                {totalCount === 1 ? 'college matches' : 'colleges match'} your search. Refine with filters below.
              </>
            ) : (
              <>
                <strong style={{ color: '#1565C0' }}>{totalCount.toLocaleString()}</strong> colleges available. Use filters to narrow down.
              </>
            )}
          </Typography>
        </Box>

        {/* Search bar (desktop) */}
        <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 1.5 }}>
          <Suspense fallback={<Box sx={{ height: 40 }} />}>
            <CollegeSearch defaultValue={filters.search} />
          </Suspense>
        </Box>

        <Suspense fallback={null}>
          <ActiveFilterPills />
        </Suspense>

        {/* Results count + view toggle */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
            Showing <strong>{colleges.length}</strong> of {totalCount.toLocaleString()} colleges
          </Typography>
          <Suspense fallback={<Box sx={{ height: 36 }} />}>
            <ViewModeToggle value={view} />
          </Suspense>
        </Stack>

        {loading ? (
          <Stack spacing={1.5} aria-busy="true" aria-label="Loading colleges">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={i === 0 ? 180 : 96} />
            ))}
          </Stack>
        ) : failed ? (
          <Box sx={{ textAlign: 'center', py: 8 }} role="alert">
            <Typography variant="h6" color="text.secondary">
              Could not load colleges.
            </Typography>
            <Button variant="outlined" onClick={() => setAttempt((n) => n + 1)} sx={{ mt: 2, minHeight: 48, textTransform: 'none' }}>
              Try again
            </Button>
          </Box>
        ) : colleges.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              No colleges match your filters.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Try removing some filters to see more results.
            </Typography>
          </Box>
        ) : (
          <>
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

            {totalPages > 1 && (
              <Stack alignItems="center" sx={{ mt: 3 }}>
                <Suspense fallback={null}>
                  <ClientPagination totalPages={totalPages} currentPage={filters.page ?? 1} />
                </Suspense>
              </Stack>
            )}
          </>
        )}
      </CollegeListingLayout>
    </Box>
  );
}
