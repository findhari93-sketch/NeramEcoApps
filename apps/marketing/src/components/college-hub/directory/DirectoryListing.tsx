'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import {
  cityCountsOf,
  countMatches,
  facetCounts,
  feeHistogram,
  filterAndSortColleges,
  lettersOf,
  parseListingFilters,
  splitMulti,
  stateCountsOf,
  type ListingCollege,
} from '@/lib/college-hub/listing-filter';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import CollegeListingLayout from '../CollegeListingLayout';
import { parseViewMode } from '../view-mode';
import DirectoryHero, { type StateOption } from './DirectoryHero';
import MobileDirectoryHeader from './MobileDirectoryHeader';
import CategoryHero, { MobileCategoryHeader, type CategoryInfo } from './CategoryHero';
import FilterRail, { type HideableGroup } from './FilterRail';
import MobileFilterSheet, { type SheetCategory } from './MobileFilterSheet';
import ResultsToolbar from './ResultsToolbar';
import LetterJump from './LetterJump';
import DirectoryResults, { DirectoryEmpty } from './DirectoryResults';
import { activeFilterCount, draftToFilters, readDraft, type FilterDraft } from './filter-model';
import { useDirectoryNav } from './useListingParams';
import { tokens } from '@/design-system';

/** Colleges rendered before "Show N more colleges". */
export const DIRECTORY_PAGE_SIZE = 24;

export type DirectoryListingProps = {
  colleges: ListingCollege[];
  breadcrumbs: { name: string; href?: string }[];
} & (
  | { mode: 'state'; state: string; stateName: string; states?: StateOption[] }
  | {
      mode: 'category';
      category: CategoryInfo;
      /** The page's own filter, never offered as a filter here. */
      hide?: readonly HideableGroup[];
      locked?: { label: string; changeHref: string };
      /** False on a city page (one state already). */
      stateFilter?: boolean;
    }
);

type Params = { get(key: string): string | null };
const NO_PARAMS: Params = { get: () => null };

/**
 * The college directory body shared by /colleges/[state] and the category
 * pages (accreditation, type, city, counselling, fees, TNEA, JoSAA). The page
 * is ISR and passes the full list once; URL filters are applied here, so the
 * counts per filter option are exact.
 *
 * Server render (and crawlers) get the default view: the Suspense fallback is
 * this same body with no params. After hydration it re-renders with the real
 * search params.
 */
export default function DirectoryListing(props: DirectoryListingProps) {
  return (
    <Suspense fallback={<ListingBody {...props} params={NO_PARAMS} />}>
      <ListingWithParams {...props} />
    </Suspense>
  );
}

function ListingWithParams(props: DirectoryListingProps) {
  const params = useSearchParams();
  return <ListingBody {...props} params={params ?? NO_PARAMS} />;
}

function ListingBody(props: DirectoryListingProps & { params: Params }) {
  const { colleges, params, breadcrumbs } = props;
  const routeState = props.mode === 'state' ? props.state : undefined;
  const key = params === NO_PARAMS ? '' : String(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseListingFilters(params, { state: routeState }), [key, routeState]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const draft = useMemo(() => readDraft(params), [key]);
  const results = useMemo(() => filterAndSortColleges(colleges, filters), [colleges, filters]);
  const facets = useMemo(() => facetCounts(colleges, filters), [colleges, filters]);
  const states = useMemo(() => stateCountsOf(colleges), [colleges]);
  const stateNames = useMemo(() => Object.fromEntries(states.map((s) => [s.state_slug, s.state])), [states]);

  // Category pages offer cities once one state is picked (canvas: "Pick one state to filter by city").
  const pickedStates = splitMulti(filters.state);
  const cityScope = useMemo(
    () => (props.mode === 'category' && pickedStates.length === 1 ? colleges.filter((c) => c.state_slug === pickedStates[0]) : colleges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colleges, props.mode, pickedStates.join(',')]
  );
  const stateFilter = props.mode === 'category' && props.stateFilter !== false && states.length > 1;
  const cities = useMemo(
    () => (props.mode === 'category' && stateFilter && pickedStates.length !== 1 ? [] : cityCountsOf(cityScope)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cityScope, stateFilter, pickedStates.length, props.mode]
  );
  const cityHint = stateFilter && pickedStates.length !== 1 ? 'Pick one state to filter by city.' : undefined;
  const cityNames = useMemo(() => Object.fromEntries(cityCountsOf(colleges).map((c) => [c.city_slug, c.city])), [colleges]);
  const histogram = useMemo(() => feeHistogram(colleges), [colleges]);
  const letters = useMemo(() => lettersOf(colleges), [colleges]);
  const showRating = useMemo(() => colleges.some((c) => c.review_avg != null), [colleges]);
  const view = parseViewMode(params.get('view') ?? undefined);

  const nav = useDirectoryNav(params);
  const [sheet, setSheet] = useState<SheetCategory | null>(null);
  const [limit, setLimit] = useState(DIRECTORY_PAGE_SIZE);
  useEffect(() => setLimit(DIRECTORY_PAGE_SIZE), [key]);

  const countFor = useCallback((d: FilterDraft) => countMatches(colleges, draftToFilters(d, routeState)), [colleges, routeState]);
  const facetsFor = useCallback((d: FilterDraft) => facetCounts(colleges, draftToFilters(d, routeState)), [colleges, routeState]);

  const hide = props.mode === 'category' ? props.hide ?? [] : [];
  const shown = results.slice(0, limit);
  const more = results.length - shown.length;

  const crumbs = <Breadcrumbs items={breadcrumbs} />;
  const hero =
    props.mode === 'state' ? (
      <>
        <MobileDirectoryHeader
          stateSlug={props.state}
          stateName={props.stateName}
          states={props.states}
          totalCount={results.length}
          draft={draft}
          onChange={nav.applyDraft}
          onOpenSheet={setSheet}
        />
        <DirectoryHero
          stateSlug={props.state}
          stateName={props.stateName}
          states={props.states}
          colleges={colleges}
          totalCount={colleges.length}
          cities={cities}
          q={draft.q}
          city={draft.city}
          onSearch={(q, city) => nav.applyDraft({ ...draft, q, city: city ? [city] : [] })}
          breadcrumbs={crumbs}
        />
      </>
    ) : (
      <>
        <MobileCategoryHeader
          category={props.category}
          subtitle={
            pickedStates.length === 1
              ? `Showing ${results.length} in ${stateNames[pickedStates[0]] ?? pickedStates[0]}`
              : `${results.length.toLocaleString('en-IN')} ${results.length === 1 ? 'college' : 'colleges'}${stateFilter ? ' · All India' : ''}`
          }
          states={states}
          draft={draft}
          onChange={nav.applyDraft}
          onOpenSheet={setSheet}
          showStates={stateFilter}
        />
        <CategoryHero category={props.category} breadcrumbs={crumbs} />
      </>
    );

  return (
    <CollegeListingLayout
      hero={hero}
      activeFilters={activeFilterCount(draft)}
      sidebar={({ onCollapse }) => (
        <FilterRail
          draft={draft}
          onChange={nav.applyDraft}
          onClear={nav.clearAll}
          onCollapse={onCollapse}
          facets={facets}
          cities={cities}
          cityHint={cityHint}
          states={stateFilter ? states : undefined}
          hide={hide}
          locked={props.mode === 'category' ? props.locked : undefined}
          histogram={histogram}
          matchCount={results.length}
          showRating={showRating}
        />
      )}
    >
      <Box sx={{ pt: { xs: 1.5, md: 0 } }}>
        <ResultsToolbar
          // "Showing 24 of 68 colleges": cards on screen of the colleges that match.
          shown={shown.length}
          total={results.length}
          draft={draft}
          onChange={nav.applyDraft}
          onClear={nav.clearAll}
          view={view}
          viewHref={nav.viewHref}
          cityNames={cityNames}
          stateNames={stateNames}
          showRatingSort={showRating}
        />
        <LetterJump available={letters} current={draft.letter} onPick={(letter) => nav.applyDraft({ ...draft, letter })} />

        {colleges.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, p: { xs: 2.5, md: 3.5 }, bgcolor: tokens.surface, border: '1px solid', borderColor: tokens.line, borderRadius: 1 }}>
            <Typography sx={{ m: 0, fontSize: '1.1rem', fontWeight: 700 }}>No colleges in this list yet</Typography>
            <Typography sx={{ m: 0, fontSize: '0.95rem', color: tokens.inkMuted }}>We add colleges as their details are confirmed. Browse every college in the meantime.</Typography>
            <Box component="a" href="/colleges#browse" sx={{ mt: 1, minHeight: 44, display: 'inline-flex', alignItems: 'center', px: 2, border: '1px solid', borderColor: tokens.navy900, borderRadius: 1, color: tokens.navy900, fontWeight: 700, textDecoration: 'none' }}>
              Browse all colleges
            </Box>
          </Box>
        ) : results.length === 0 ? (
          <DirectoryEmpty query={draft.q} onClear={nav.clearAll} allStatesHref="/colleges" />
        ) : (
          <>
            <DirectoryResults colleges={shown} view={view} startRank={1} sort={draft.sort} onSort={(sort) => nav.applyDraft({ ...draft, sort })} />
            {more > 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, pt: 2.5, pb: 1 }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setLimit((n) => n + DIRECTORY_PAGE_SIZE)}
                  sx={{ minHeight: 48, px: 3, border: '1px solid', borderColor: tokens.navy900, borderRadius: 1, bgcolor: tokens.surface, color: tokens.navy900, font: 'inherit', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', '&:hover': { bgcolor: tokens.surfaceHover }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
                >
                  Show {Math.min(more, DIRECTORY_PAGE_SIZE)} more {Math.min(more, DIRECTORY_PAGE_SIZE) === 1 ? 'college' : 'colleges'}
                </Box>
                <Typography sx={{ m: 0, fontSize: '0.84rem', color: tokens.inkMuted }}>
                  Showing {shown.length} of {results.length}
                </Typography>
              </Box>
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
        countFor={countFor}
        facetsFor={facetsFor}
        cities={cities}
        cityHint={cityHint}
        states={stateFilter ? states : undefined}
        hide={hide}
        histogram={histogram}
        showRating={showRating}
      />
    </CollegeListingLayout>
  );
}
