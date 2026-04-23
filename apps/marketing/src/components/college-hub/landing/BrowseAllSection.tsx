'use client';

import { useSearchParams } from 'next/navigation';
import { Box, Typography, Stack, Divider, Grid } from '@mui/material';
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
import type { CollegeListItem, CollegeFilters } from '@/lib/college-hub/types';
import { FEATURED_COUNT, AD_INTERVAL_COMPACT, AD_AFTER_FEATURED } from '@/lib/college-hub/constants';

interface BrowseAllSectionProps {
  colleges: CollegeListItem[];
  totalCount: number;
  totalPages: number;
  filters: CollegeFilters;
  cityCounts?: { city: string; city_slug: string; count: number }[];
  typeCounts?: { type: string; count: number }[];
}

export default function BrowseAllSection({
  colleges,
  totalCount,
  totalPages,
  filters,
  cityCounts,
  typeCounts,
}: BrowseAllSectionProps) {
  const searchParams = useSearchParams();
  const view = parseViewMode(searchParams.get('view') ?? undefined);
  const featured = colleges.slice(0, FEATURED_COUNT);
  const compact = colleges.slice(FEATURED_COUNT);

  return (
    <Box id="browse" sx={{ py: { xs: 2, sm: 4, md: 6 }, scrollMarginTop: '80px' }}>
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
          <CollegeSearch defaultValue={filters.search} />
        </Box>

        <ActiveFilterPills />

        {/* Results count + view toggle */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
            Showing <strong>{colleges.length}</strong> of {totalCount.toLocaleString()} colleges
          </Typography>
          <ViewModeToggle value={view} />
        </Stack>

        {colleges.length === 0 ? (
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
                <ClientPagination totalPages={totalPages} currentPage={filters.page ?? 1} />
              </Stack>
            )}
          </>
        )}
      </CollegeListingLayout>
    </Box>
  );
}
