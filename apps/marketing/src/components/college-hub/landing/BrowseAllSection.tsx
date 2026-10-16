'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Typography, Stack, Skeleton, Button } from '@mui/material';
import CollegeListingLayout from '../CollegeListingLayout';
import ClientPagination from '../ClientPagination';
import { parseViewMode } from '../view-mode';
import { BROWSE_PAGE_SIZE, hasListingFilters, parseListingFilters, type ListingCollege } from '@/lib/college-hub/listing-filter';
import DirectoryHero from '../directory/DirectoryHero';
import MobileDirectoryHeader from '../directory/MobileDirectoryHeader';
import FilterRail from '../directory/FilterRail';
import MobileFilterSheet, { type SheetCategory } from '../directory/MobileFilterSheet';
import ResultsToolbar from '../directory/ResultsToolbar';
import LetterJump from '../directory/LetterJump';
import DirectoryResults, { DirectoryEmpty } from '../directory/DirectoryResults';
import { activeFilterCount, readDraft } from '../directory/filter-model';
import { useDirectoryNav } from '../directory/useListingParams';
import { tokens } from '@/design-system';

interface BrowseAllSectionProps {
  /** The default first page (ArchIndex order), rendered on the server. */
  initialColleges: ListingCollege[];
  initialCount: number;
  cityCounts?: { city: string; city_slug: string; count: number }[];
  typeCounts?: { type: string; count: number }[];
}

type Params = { get(key: string): string | null };
const NO_PARAMS: Params = { get: () => null };

const ALL_LETTERS = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''));

/**
 * "Browse all colleges" on /colleges. The page is static (ISR); the server
 * renders the default first page. When the URL carries filters or a page
 * number, results come from /api/colleges/browse, which the CDN caches per
 * query string. Reading search params happens inside Suspense so the page is
 * not bailed out of static rendering.
 *
 * Results are paged on the server, so filter options here show no per-option
 * counts (the state directory, which has the whole list, does).
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

function BrowseBody({ initialColleges, initialCount, cityCounts = [], params }: BrowseAllSectionProps & { params: Params }) {
  const key = params === NO_PARAMS ? '' : String(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseListingFilters(params, { limit: BROWSE_PAGE_SIZE }), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => readDraft(params), [key]);
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
  const [sheet, setSheet] = useState<SheetCategory | null>(null);
  const nav = useDirectoryNav(params);

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
  const page = filters.page ?? 1;
  const view = parseViewMode(params.get('view') ?? undefined);
  const showRating = initialColleges.some((c) => c.review_avg != null);
  const cityNames = useMemo(() => Object.fromEntries(cityCounts.map((c) => [c.city_slug, c.city])), [cityCounts]);

  return (
    <Box id="browse" sx={{ pt: { xs: 2, md: 0 }, scrollMarginTop: 'calc(var(--broadcast-banner-height, 0px) + 64px)' }}>
      <CollegeListingLayout
        activeFilters={activeFilterCount(draft)}
        hero={
          <>
            <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 1 }}>
              <Typography component="h2" sx={{ m: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.2 }}>
                Browse all colleges
              </Typography>
              <Typography sx={{ m: 0, mt: 0.25, fontSize: 14, color: tokens.inkMuted }}>
                {totalCount.toLocaleString('en-IN')} B.Arch colleges across India
              </Typography>
            </Box>
            <MobileDirectoryHeader totalCount={totalCount} draft={draft} onChange={nav.applyDraft} onOpenSheet={setSheet} />
            <DirectoryHero
              totalCount={totalCount}
              cities={cityCounts}
              q={draft.q}
              city={draft.city}
              onSearch={(q, city) => nav.applyDraft({ ...draft, q, city: city ? [city] : [] })}
            />
          </>
        }
        sidebar={({ onCollapse }) => (
          <FilterRail
            draft={draft}
            onChange={nav.applyDraft}
            onClear={nav.clearAll}
            onCollapse={onCollapse}
            cities={cityCounts}
            matchCount={totalCount}
            showRating={showRating}
          />
        )}
      >
        <Box sx={{ pt: { xs: 1.5, md: 0 } }}>
          <ResultsToolbar
            shown={colleges.length}
            total={totalCount}
            draft={draft}
            onChange={nav.applyDraft}
            onClear={nav.clearAll}
            view={view}
            viewHref={nav.viewHref}
            cityNames={cityNames}
            showRatingSort={showRating}
          />
          <LetterJump available={ALL_LETTERS} current={draft.letter} onPick={(letter) => nav.applyDraft({ ...draft, letter })} />

          {loading ? (
            <Stack spacing={1.75} aria-busy="true" aria-label="Loading colleges">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={i === 0 ? 190 : 150} />
              ))}
            </Stack>
          ) : failed ? (
            <Box sx={{ textAlign: 'center', py: 8 }} role="alert">
              <Typography variant="h6" component="p" color={tokens.inkMuted}>
                Could not load colleges.
              </Typography>
              <Button variant="outlined" onClick={() => setAttempt((n) => n + 1)} sx={{ mt: 2, minHeight: 48, textTransform: 'none' }}>
                Try again
              </Button>
            </Box>
          ) : colleges.length === 0 ? (
            <DirectoryEmpty query={draft.q} onClear={nav.clearAll} />
          ) : (
            <>
              <DirectoryResults
                colleges={colleges}
                view={view}
                startRank={(page - 1) * BROWSE_PAGE_SIZE + 1}
                sort={draft.sort}
                onSort={(sort) => nav.applyDraft({ ...draft, sort })}
              />
              {totalPages > 1 && (
                <Stack alignItems="center" sx={{ mt: 3 }}>
                  <Suspense fallback={null}>
                    <ClientPagination totalPages={totalPages} currentPage={page} />
                  </Suspense>
                </Stack>
              )}
            </>
          )}
        </Box>

        <MobileFilterSheet
          open={sheet !== null}
          onClose={() => setSheet(null)}
          initialCategory={sheet ?? 'sort'}
          applied={draft}
          onApply={nav.applyDraft}
          cities={cityCounts}
          showRating={showRating}
        />
      </CollegeListingLayout>
    </Box>
  );
}
