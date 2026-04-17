'use client';

import { Box, Container, Typography, Grid, Stack, Divider } from '@mui/material';
import FilterSidebar from '../FilterSidebar';
import FeaturedCollegeCard from '../FeaturedCollegeCard';
import CompactCollegeCard from '../CompactCollegeCard';
import SponsoredBanner from '../SponsoredBanner';
import CollegeSearch from '../CollegeSearch';
import ActiveFilterPills from '../ActiveFilterPills';
import ClientPagination from '../ClientPagination';
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
  const featured = colleges.slice(0, FEATURED_COUNT);
  const compact = colleges.slice(FEATURED_COUNT);

  return (
    <Box id="browse" sx={{ py: { xs: 5, sm: 6, md: 8 }, scrollMarginTop: '80px' }}>
      <Container maxWidth="lg">
        {/* Section header */}
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.35rem', sm: '1.5rem' },
              fontWeight: 800,
              color: '#0f172a',
            }}
          >
            Browse All Colleges
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            <strong style={{ color: '#1565C0' }}>{totalCount.toLocaleString()}</strong> colleges available. Use filters to narrow down.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Sidebar */}
          <Grid item xs={12} md={3.5}>
            <FilterSidebar
              filters={filters}
              totalCount={totalCount}
              cityCounts={cityCounts}
              typeCounts={typeCounts}
            />
          </Grid>

          {/* Listing */}
          <Grid item xs={12} md={8.5}>
            {/* Search bar (desktop) */}
            <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 2 }}>
              <CollegeSearch defaultValue={filters.search} />
            </Box>

            <ActiveFilterPills />

            {/* Results count */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Showing <strong>{colleges.length}</strong> of {totalCount.toLocaleString()} colleges
            </Typography>

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
                {/* Featured cards (top 5) */}
                {featured.map((college, i) => (
                  <Box key={college.id}>
                    <FeaturedCollegeCard college={college} rank={i + 1} />
                    {i + 1 === AD_AFTER_FEATURED && <SponsoredBanner variant="featured" />}
                  </Box>
                ))}

                {/* Divider */}
                {compact.length > 0 && (
                  <Stack direction="row" alignItems="center" gap={1.5} sx={{ my: 3 }}>
                    <Divider sx={{ flex: 1 }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      More Colleges
                    </Typography>
                    <Divider sx={{ flex: 1 }} />
                  </Stack>
                )}

                {/* Compact cards */}
                {compact.map((college, i) => (
                  <Box key={college.id}>
                    <CompactCollegeCard college={college} rank={FEATURED_COUNT + i + 1} />
                    {(i + 1) % AD_INTERVAL_COMPACT === 0 && i + 1 < compact.length && (
                      <SponsoredBanner variant="compact" />
                    )}
                  </Box>
                ))}

                {totalPages > 1 && (
                  <Stack alignItems="center" sx={{ mt: 4 }}>
                    <ClientPagination totalPages={totalPages} currentPage={filters.page ?? 1} />
                  </Stack>
                )}
              </>
            )}
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
