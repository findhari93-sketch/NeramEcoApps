import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Container, Grid, Pagination, Stack, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateCollegesListingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import FilterSidebar from '@/components/college-hub/FilterSidebar';
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

  const { data: colleges, count } = await getColleges(filters);
  const totalPages = Math.ceil(count / 20);

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            B.Arch Colleges in India
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            Compare {count.toLocaleString()} colleges — fees, NATA cutoffs, rankings, and placements
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {/* Sidebar */}
          <Grid item xs={12} md={3}>
            <FilterSidebar
              filters={filters}
              onChange={() => {
                // URL navigation handled client-side inside FilterSidebar
              }}
              totalCount={count}
            />
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
                  Showing {colleges.length} of {count.toLocaleString()} colleges
                </Typography>
                <Grid container spacing={2}>
                  {colleges.map((college) => (
                    <Grid key={college.id} item xs={12} sm={6} lg={4}>
                      <CollegeListingCard college={college} />
                    </Grid>
                  ))}
                </Grid>

                {totalPages > 1 && (
                  <Stack alignItems="center" sx={{ mt: 4 }}>
                    <Pagination
                      count={totalPages}
                      page={filters.page ?? 1}
                      color="primary"
                      shape="rounded"
                    />
                  </Stack>
                )}
              </>
            )}
          </Grid>
        </Grid>
      </Container>
    </>
  );
}
