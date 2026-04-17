'use client';

import { Box, Container, Typography, Grid, Stack } from '@mui/material';
import FilterSidebar from '../FilterSidebar';
import CollegeListingCard from '../CollegeListingCard';
import ClientPagination from '../ClientPagination';
import type { CollegeListItem, CollegeFilters } from '@/lib/college-hub/types';

interface BrowseAllSectionProps {
  colleges: CollegeListItem[];
  totalCount: number;
  totalPages: number;
  filters: CollegeFilters;
}

export default function BrowseAllSection({
  colleges,
  totalCount,
  totalPages,
  filters,
}: BrowseAllSectionProps) {
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
            {totalCount.toLocaleString()} colleges available. Use filters to narrow down.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Sidebar */}
          <Grid item xs={12} md={3}>
            <FilterSidebar filters={filters} totalCount={totalCount} />
          </Grid>

          {/* Listing */}
          <Grid item xs={12} md={9}>
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
                <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                  Showing {colleges.length} of {totalCount.toLocaleString()} colleges
                </Typography>
                <Grid container spacing={2}>
                  {colleges.map((college) => (
                    <Grid key={college.id} item xs={12} md={6}>
                      <CollegeListingCard college={college} />
                    </Grid>
                  ))}
                </Grid>

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
