import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import {
  Container,
  Typography,
  Box,
  Stack,
  Button,
  Alert,
} from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import IosShareIcon from '@mui/icons-material/IosShare';
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
import NIRFHeroStats from '@/components/college-hub/NIRFHeroStats';
import NIRFFilterBar from '@/components/college-hub/NIRFFilterBar';
import NIRFRankingTable from '@/components/college-hub/NIRFRankingTable';
import NIRFRankingCard from '@/components/college-hub/NIRFRankingCard';
import NIRFCompareTable from '@/components/college-hub/NIRFCompareTable';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title:
      'NIRF Architecture Rankings 2020 to 2025: Top B.Arch Colleges in India | Neram',
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

export default async function NIRFRankingsPage({
  params: { locale },
  searchParams,
}: PageProps) {
  setRequestLocale(locale);
  const filters = parseNIRFFilters(searchParams);
  const availableYears = await getAvailableNIRFYears();
  const latestYear = availableYears[0];

  // Active year: explicit single-year filter, otherwise latest. Multi-year
  // filtering is supported but the hero stats and "in NIRF YYYY" badge follow
  // the latest selected year (or the newest data year).
  const activeYear = filters.years.length
    ? Math.max(...filters.years)
    : latestYear;

  const queryFilters = filters.compare
    ? { ...filters, years: undefined, limit: 500 }
    : {
        ...filters,
        years: filters.years.length ? filters.years : activeYear ? [activeYear] : undefined,
        limit: 500,
      };

  const [{ data, count }, statsResult, geo] = await Promise.all([
    getNIRFRankings(queryFilters),
    activeYear
      ? getNIRFRankings({ years: [activeYear], limit: 500, sort: 'rank_asc' })
      : Promise.resolve({ data: [], count: 0 }),
    getNIRFStatesAndCities(),
  ]);

  // Compute hero stats from unfiltered year snapshot
  const statsRows = statsResult.data;
  const institutionsRanked = new Set(statsRows.map((r) => r.college_id)).size;
  const topScore = statsRows.reduce<number | null>((acc, r) => {
    if (r.score === null) return acc;
    return acc === null || r.score > acc ? r.score : acc;
  }, null);
  const statesCovered = new Set(
    statsRows.map((r) => r.college?.state).filter(Boolean),
  ).size;
  const govt = statsRows.filter(
    (r) => r.college?.type?.toLowerCase() === 'government',
  ).length;
  const privateCount = statsRows.filter(
    (r) => r.college?.type?.toLowerCase() === 'private',
  ).length;

  const filtersActive = hasActiveFilters(filters);
  const yearRangeLabel = availableYears.length
    ? `${Math.min(...availableYears)}–${Math.max(...availableYears)}`
    : '2020–2025';

  // JSON-LD top 25 for SEO
  const top25 = data.slice(0, 25);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `NIRF Architecture Rankings ${yearRangeLabel}`,
    itemListElement: top25.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.college?.name ?? r.source_name,
      url: r.college
        ? `https://neramclasses.com/${locale}/colleges/rankings/nirf/${r.college.slug}`
        : undefined,
    })),
  };

  const compareHref = filters.compare
    ? `/${locale}/colleges/rankings/nirf`
    : `/${locale}/colleges/rankings/nirf?compare=1`;

  return (
    <Container
      maxWidth="lg"
      sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}
    >
      <Script
        id="nirf-rankings-jsonld"
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <Breadcrumbs
        items={[
          { name: 'Colleges', href: `/${locale}/colleges` },
          { name: 'Rankings', href: `/${locale}/colleges/rankings` },
          { name: 'NIRF Architecture' },
        ]}
      />

      {/* Title block */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', md: 'center' }}
        spacing={1.5}
        sx={{ mt: 1.5, mb: 1.5 }}
      >
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              bgcolor: '#fef0e7',
              color: '#9a3412',
              fontWeight: 600,
              fontSize: '0.72rem',
              px: 1.25,
              py: 0.4,
              borderRadius: 5,
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: '#ea580c',
              }}
            />
            LIVE · NIRF {yearRangeLabel}
          </Box>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              bgcolor: '#f1efe9',
              color: 'text.primary',
              fontWeight: 600,
              fontSize: '0.72rem',
              px: 1.25,
              py: 0.4,
              borderRadius: 5,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            Architecture
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            component={Link}
            href={compareHref}
            startIcon={<CompareArrowsIcon sx={{ fontSize: 18 }} />}
            variant={filters.compare ? 'contained' : 'outlined'}
            sx={{
              borderRadius: 5,
              minHeight: 36,
              fontSize: '0.82rem',
              textTransform: 'none',
              fontWeight: 600,
              px: 1.75,
              borderColor: 'divider',
              color: filters.compare ? undefined : 'text.primary',
            }}
          >
            {filters.compare ? 'Exit compare' : 'Compare years'}
          </Button>
          <Button
            component={Link}
            href={`/${locale}/colleges/rankings/nirf`}
            aria-label="Share NIRF rankings"
            sx={{
              borderRadius: 5,
              minWidth: 40,
              minHeight: 36,
              border: '1px solid',
              borderColor: 'divider',
              color: 'text.primary',
              p: 0,
            }}
          >
            <IosShareIcon sx={{ fontSize: 18 }} />
          </Button>
        </Stack>
      </Stack>

      <Typography
        variant="h1"
        sx={{
          fontSize: { xs: '1.65rem', sm: '2rem', md: '2.4rem' },
          fontWeight: 800,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          mb: 1,
        }}
      >
        NIRF Architecture Rankings
      </Typography>
      <Typography
        color="text.secondary"
        sx={{
          fontSize: { xs: '0.9rem', md: '0.95rem' },
          maxWidth: 720,
          mb: { xs: 2, md: 3 },
          lineHeight: 1.55,
        }}
      >
        National Institutional Ranking Framework for B.Arch programs across India.
        Filter by year, state, city, type or score, click any institution for its
        full year-over-year profile.
      </Typography>

      {/* Stats row */}
      {activeYear && (
        <NIRFHeroStats
          institutionsRanked={institutionsRanked}
          topScore={topScore}
          statesCovered={statesCovered}
          govt={govt}
          privateCount={privateCount}
          year={activeYear}
        />
      )}

      {/* Filter bar */}
      <NIRFFilterBar
        filters={filters}
        totalCount={count}
        availableYears={availableYears}
        states={geo.states}
        cities={geo.cities}
      />

      {/* Methodology notice */}
      {!filters.compare && (
        <Alert
          severity="info"
          variant="outlined"
          sx={{
            mb: 2,
            borderRadius: 1.5,
            fontSize: '0.82rem',
            bgcolor: '#fafaf7',
            borderColor: 'divider',
            color: 'text.primary',
            '& .MuiAlert-icon': { color: 'text.secondary' },
          }}
        >
          <Box>
            <Typography component="span" fontWeight={700} sx={{ fontSize: '0.82rem' }}>
              Methodology change:
            </Typography>{' '}
            NIRF parameter weights changed from 2023 onwards. Scores remain
            comparable as percentages, but absolute values across versions should
            be read with care.{' '}
            <Link
              href="https://www.nirfindia.org/Home"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}
            >
              How NIRF scores are calculated →
            </Link>
          </Box>
        </Alert>
      )}

      {/* Compare-years pivot */}
      {filters.compare && data.length > 0 && (
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <NIRFCompareTable rows={data} years={availableYears} locale={locale} />
        </Box>
      )}
      {filters.compare && (
        <Box
          sx={{
            display: { xs: 'block', md: 'none' },
            py: 4,
            textAlign: 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Compare-years view is desktop only. Use single-year filtering on mobile.
          </Typography>
        </Box>
      )}

      {/* Empty state */}
      {!filters.compare && data.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No NIRF rankings match these filters.
          </Typography>
          {filtersActive && (
            <Button
              component={Link}
              href={`/${locale}/colleges/rankings/nirf`}
              variant="outlined"
              sx={{ borderRadius: 5, textTransform: 'none' }}
            >
              Clear all filters
            </Button>
          )}
        </Box>
      )}

      {/* Results: desktop table + mobile cards */}
      {!filters.compare && data.length > 0 && (
        <>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <NIRFRankingTable
              rows={data}
              showYear={filters.years.length !== 1}
              locale={locale}
            />
          </Box>
          <Stack
            spacing={1.25}
            sx={{ display: { xs: 'flex', md: 'none' }, pb: 6 }}
          >
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
    </Container>
  );
}
