'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { localePrefix } from '@/lib/college-hub/detail-content';
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
import { tokens } from '@/design-system';

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
    ? `${localePrefix(locale)}/colleges/rankings/nirf`
    : `${localePrefix(locale)}/colleges/rankings/nirf?compare=1`;

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
              bgcolor: tokens.surface,
              color: tokens.success,
              boxShadow: `inset 0 0 0 1px ${tokens.success}`,
              fontWeight: 600,
              fontSize: '0.72rem',
              px: 1.25,
              py: 0.4,
              borderRadius: `${tokens.radiusPill}px`,
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: tokens.success,
              }}
            />
            LIVE · NIRF {yearRangeLabel}
          </Box>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              bgcolor: tokens.surfaceHover,
              color: tokens.ink,
              fontWeight: 600,
              fontSize: '0.72rem',
              px: 1.25,
              py: 0.4,
              borderRadius: `${tokens.radiusPill}px`,
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
              borderRadius: `${tokens.radiusPill}px`,
              minHeight: 36,
              fontSize: '0.82rem',
              textTransform: 'none',
              fontWeight: 600,
              px: 1.75,
              borderColor: tokens.line,
              color: filters.compare ? undefined : tokens.ink,
            }}
          >
            {filters.compare ? 'Exit compare' : 'Compare years'}
          </Button>
          <Button
            component={Link}
            href={`${localePrefix(locale)}/colleges/rankings/nirf`}
            aria-label="Share NIRF rankings"
            sx={{
              borderRadius: `${tokens.radiusPill}px`,
              minWidth: 40,
              minHeight: 36,
              border: '1px solid',
              borderColor: tokens.line,
              color: tokens.ink,
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
        NIRF Architecture Rankings {latestYear ?? ''}
      </Typography>
      <Typography
        color={tokens.inkMuted}
        sx={{
          fontSize: { xs: '0.9rem', md: '0.95rem' },
          maxWidth: 720,
          mb: { xs: 2, md: 3 },
          lineHeight: 1.55,
        }}
      >
        Every architecture college ranked by the National Institutional Ranking
        Framework (NIRF) in the Architecture and Planning category, {yearRangeLabel}.
        Filter by year, state, city, type or score, and open any college for its
        rank history.
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
            borderRadius: 1,
            fontSize: '0.82rem',
            bgcolor: tokens.ground,
            borderColor: tokens.line,
            color: tokens.ink,
            '& .MuiAlert-icon': { color: tokens.inkMuted },
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
              style={{ color: tokens.ink, fontWeight: 600, textDecoration: 'underline' }}
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
          <Typography variant="body2" color={tokens.inkMuted}>
            Compare-years view is desktop only. Use single-year filtering on mobile.
          </Typography>
        </Box>
      )}

      {/* Empty state */}
      {!filters.compare && data.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color={tokens.inkMuted} sx={{ mb: 2 }}>
            No NIRF rankings match these filters.
          </Typography>
          {filtersActive && (
            <Button
              component={Link}
              href={`${localePrefix(locale)}/colleges/rankings/nirf`}
              variant="outlined"
              sx={{ borderRadius: `${tokens.radiusPill}px`, textTransform: 'none' }}
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
