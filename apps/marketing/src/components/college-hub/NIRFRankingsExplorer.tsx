'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Typography, Box, Stack, Button, Alert } from '@mui/material';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import IosShareIcon from '@mui/icons-material/IosShare';
import type { NIRFRankingWithCollege } from '@neram/database';
import { parseNIRFFilters, hasActiveFilters } from '@/lib/college-hub/nirf-filters';
import { applyNIRFFilters, nirfHeroStats, type PublicNIRFRow } from '@/lib/college-hub/nirf-client-filter';
import NIRFHeroStats from './NIRFHeroStats';
import NIRFFilterBar from './NIRFFilterBar';
import NIRFRankingTable from './NIRFRankingTable';
import NIRFRankingCard from './NIRFRankingCard';
import NIRFCompareTable from './NIRFCompareTable';

interface Props {
  rows: PublicNIRFRow[];
  availableYears: number[];
  states: { name: string; slug: string }[];
  cities: { city: string; state: string }[];
  locale: string;
  yearRangeLabel: string;
}

type Params = { get(key: string): string | null };
const NO_PARAMS: Params = { get: () => null };
const PARAM_KEYS = ['year', 'years', 'state', 'city', 'type', 'scoreMin', 'scoreMax', 'rankMin', 'rankMax', 'q', 'search', 'sort', 'compare', 'page'];

/**
 * Everything on the NIRF rankings page that depends on the URL filters. The
 * page is ISR and passes every row once; filters apply here. Server render and
 * crawlers get the default view (latest year, best rank first) through the
 * Suspense fallback; after hydration the real search params apply.
 */
export default function NIRFRankingsExplorer(props: Props) {
  return (
    <Suspense fallback={<ExplorerBody {...props} params={NO_PARAMS} />}>
      <ExplorerWithParams {...props} />
    </Suspense>
  );
}

function ExplorerWithParams(props: Props) {
  const params = useSearchParams();
  return <ExplorerBody {...props} params={params ?? NO_PARAMS} />;
}

function ExplorerBody({ rows, availableYears, states, cities, locale, yearRangeLabel, params }: Props & { params: Params }) {
  const key = params === NO_PARAMS ? '' : String(params);
  const filters = useMemo(() => {
    const record: Record<string, string | undefined> = {};
    for (const k of PARAM_KEYS) record[k] = params.get(k) ?? undefined;
    return parseNIRFFilters(record);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const latestYear = availableYears[0];
  const activeYear = filters.years.length ? Math.max(...filters.years) : latestYear;
  const { data: filtered, count } = useMemo(() => applyNIRFFilters(rows, filters, latestYear), [rows, filters, latestYear]);
  // The table components are typed with the full row; they only read the public fields.
  const data = filtered as unknown as NIRFRankingWithCollege[];
  const stats = useMemo(() => (activeYear ? nirfHeroStats(rows, activeYear) : null), [rows, activeYear]);
  const filtersActive = hasActiveFilters(filters);

  const compareHref = filters.compare
    ? `/${locale}/colleges/rankings/nirf`
    : `/${locale}/colleges/rankings/nirf?compare=1`;

  return (
    <>
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
      {activeYear && stats && (
        <NIRFHeroStats
          institutionsRanked={stats.institutionsRanked}
          topScore={stats.topScore}
          statesCovered={stats.statesCovered}
          govt={stats.govt}
          privateCount={stats.privateCount}
          year={activeYear}
        />
      )}

      {/* Filter bar */}
      <Suspense fallback={<Box sx={{ minHeight: 56, mb: 2 }} />}>
        <NIRFFilterBar
          filters={filters}
          totalCount={count}
          availableYears={availableYears}
          states={states}
          cities={cities}
        />
      </Suspense>

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
    </>
  );
}
