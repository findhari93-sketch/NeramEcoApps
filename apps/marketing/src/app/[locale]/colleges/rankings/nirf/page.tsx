import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import {
  Container,
  Typography,
  Box,
  Chip,
  Grid,
  Stack,
  Button,
  Alert,
} from '@mui/material';
import { setRequestLocale } from 'next-intl/server';
import {
  getNIRFRankings,
  getAvailableNIRFYears,
  getNIRFStatesAndCities,
} from '@/lib/college-hub/queries';
import {
  parseNIRFFilters,
  hasActiveFilters,
} from '@/lib/college-hub/nirf-filters';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import NIRFFilterSidebar from '@/components/college-hub/NIRFFilterSidebar';
import NIRFRankingTable from '@/components/college-hub/NIRFRankingTable';
import NIRFRankingCard from '@/components/college-hub/NIRFRankingCard';
import NIRFCompareTable from '@/components/college-hub/NIRFCompareTable';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'NIRF Architecture Rankings 2020 to 2025: Top B.Arch Colleges in India | Neram',
    description:
      'Filter and compare NIRF Architecture rankings from 2020 to 2025 across IITs, NITs, SPAs, and private colleges. Search by state, city, score, and rank with full year-over-year history.',
    alternates: {
      canonical: '/colleges/rankings/nirf',
    },
  };
}

interface PageProps {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function NIRFRankingsPage({ params: { locale }, searchParams }: PageProps) {
  setRequestLocale(locale);
  const filters = parseNIRFFilters(searchParams);

  // For compare-years mode we ignore year filter and pull everything
  const queryFilters = filters.compare
    ? { ...filters, years: undefined, limit: 500 }
    : { ...filters, years: filters.years.length ? filters.years : undefined, limit: 500 };

  const [{ data, count }, availableYears, geo] = await Promise.all([
    getNIRFRankings(queryFilters),
    getAvailableNIRFYears(),
    getNIRFStatesAndCities(),
  ]);

  const filtersActive = hasActiveFilters(filters);
  const yearRange = availableYears.length
    ? `${Math.min(...availableYears)}-${Math.max(...availableYears)}`
    : '2020-2025';

  // JSON-LD top-25 for SEO
  const top25 = data.slice(0, 25);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `NIRF Architecture Rankings ${yearRange}`,
    itemListElement: top25.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.college?.name ?? r.source_name,
      url: r.college
        ? `https://neramclasses.com/${locale}/colleges/rankings/nirf/${r.college.slug}`
        : undefined,
    })),
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 4 } }}>
      <Script
        id="nirf-rankings-jsonld"
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <Breadcrumbs
        items={[
          { name: 'Colleges', href: `/${locale}/colleges` },
          { name: 'NIRF Architecture Rankings' },
        ]}
      />

      <Box sx={{ mb: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Chip label={`NIRF ${yearRange}`} color="primary" sx={{ fontWeight: 700 }} />
          <Chip label="Architecture" size="small" variant="outlined" />
        </Stack>
        <Typography
          variant="h1"
          sx={{
            fontSize: { xs: '1.5rem', sm: '2rem', md: '2.25rem' },
            fontWeight: 900,
            mb: 1,
          }}
        >
          NIRF Architecture Rankings, {yearRange}
        </Typography>
        <Typography color="text.secondary" variant="body2" sx={{ maxWidth: 720 }}>
          National Institutional Ranking Framework rankings for B.Arch architecture
          colleges across India. Filter by year, state, city, score, or rank. Click any
          college to see its full year-over-year history.
        </Typography>
      </Box>

      <Grid container spacing={{ xs: 0, md: 3 }}>
        {/* Sidebar (desktop) + Fab (mobile) */}
        <Grid item xs={12} md={3}>
          <NIRFFilterSidebar
            filters={filters}
            totalCount={count}
            availableYears={availableYears}
            states={geo.states}
            cities={geo.cities}
          />
        </Grid>

        {/* Main pane */}
        <Grid item xs={12} md={9}>
          {/* Active filter summary + compare toggle */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}
          >
            <Typography variant="body2" color="text.secondary">
              Showing {data.length.toLocaleString()} of {count.toLocaleString()} rankings
              {filters.years.length === 1 && ` for NIRF ${filters.years[0]}`}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                component={Link}
                href={
                  filters.compare
                    ? `/${locale}/colleges/rankings/nirf`
                    : `/${locale}/colleges/rankings/nirf?compare=1`
                }
                size="small"
                variant={filters.compare ? 'contained' : 'outlined'}
                sx={{ minHeight: 36, display: { xs: 'none', md: 'inline-flex' } }}
              >
                {filters.compare ? 'Exit compare' : 'Compare years'}
              </Button>
            </Stack>
          </Stack>

          {/* Methodology note */}
          {!filters.compare && (
            <Alert severity="info" sx={{ mb: 2, fontSize: '0.8rem' }}>
              NIRF parameter weights changed from 2023 onwards. Scores are comparable as
              percentages but absolute values across versions should be read with care.
            </Alert>
          )}

          {/* Empty state */}
          {data.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                No NIRF rankings match these filters.
              </Typography>
              {filtersActive && (
                <Button
                  component={Link}
                  href={`/${locale}/colleges/rankings/nirf`}
                  variant="outlined"
                >
                  Clear all filters
                </Button>
              )}
            </Box>
          )}

          {/* Compare-years pivot */}
          {filters.compare && data.length > 0 && (
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <NIRFCompareTable rows={data} years={availableYears} locale={locale} />
            </Box>
          )}
          {filters.compare && (
            <Box sx={{ display: { xs: 'block', md: 'none' }, py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Compare-years view is desktop only. Use single-year filtering on mobile.
              </Typography>
            </Box>
          )}

          {/* Normal listing: table on desktop, cards on mobile */}
          {!filters.compare && data.length > 0 && (
            <>
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <NIRFRankingTable
                  rows={data}
                  showYear={filters.years.length !== 1}
                  locale={locale}
                />
              </Box>
              <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' }, pb: 10 }}>
                {data.map((r) => (
                  <NIRFRankingCard
                    key={r.id}
                    row={r}
                    locale={locale}
                    showYear={filters.years.length !== 1}
                  />
                ))}
              </Stack>
            </>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}
