'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import TuneIcon from '@mui/icons-material/Tune';
import SearchIcon from '@mui/icons-material/Search';
import type { FacetCounts } from '@/lib/college-hub/listing-filter';
import { activeFilterCount, type FilterDraft } from './filter-model';
import Link from 'next/link';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { CityGroup, CoaSwitch, ExamGroup, FeeGroup, NaacGroup, RatingGroup, StateGroup, TypeGroup } from './FilterGroups';
import { legendSx } from './hub-styles';

interface Props {
  draft: FilterDraft;
  /** Applies a change straight to the URL (results update as you pick). */
  onChange: (next: FilterDraft) => void;
  onClear: () => void;
  facets?: FacetCounts;
  cities: { city: string; city_slug: string; count: number }[];
  histogram?: number[];
  matchCount: number;
  showRating: boolean;
  /** Filter groups this page fixes (a category page never filters by its own category). */
  hide?: readonly HideableGroup[];
  /** Category pages: what the page always shows, and where to pick another category. */
  locked?: { label: string; changeHref: string };
  /** Category pages: the state filter. */
  states?: { state: string; state_slug: string; count: number }[];
  /** Shown instead of the city list when cities need a state first. */
  cityHint?: string;
  /** Collapses the rail (button in the header row, as in the canvas). */
  onCollapse?: () => void;
}

export type HideableGroup = 'coa' | 'exam' | 'type' | 'naac' | 'fee' | 'city' | 'state';

function Group({ legend, children, first }: { legend: string; children: React.ReactNode; first?: boolean }) {
  return (
    <Box
      component="fieldset"
      sx={{ m: 0, border: 0, borderTop: first ? 0 : '1px solid', borderColor: 'divider', px: 2.5, py: 1.75, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}
    >
      <Box component="legend" sx={{ ...legendSx, float: 'left', width: '100%', p: 0, pb: 0.75 }}>
        {legend}
      </Box>
      {children}
    </Box>
  );
}

/** Desktop filter rail (canvas: Component · Filter rail). */
export default function FilterRail({ draft: applied, onChange: apply, onClear, facets, cities, histogram, matchCount, showRating, hide = [], locked, states, cityHint, onCollapse }: Props) {
  const shows = (g: HideableGroup) => !hide.includes(g);
  // Controls update at once; the URL (and the results) follow a moment later.
  const [draft, setDraft] = useState(applied);
  useEffect(() => setDraft(applied), [applied]);
  const onChange = (next: FilterDraft) => {
    setDraft(next);
    apply(next);
  };

  const cityGroup = shows('city') && (cities.length > 0 || cityHint) && (
    <Group legend="City">
      {cities.length > 0 ? (
        <CityGroup draft={draft} onChange={onChange} facets={facets} cities={cities} />
      ) : (
        <Typography sx={{ m: 0, fontSize: 13.5, lineHeight: 1.5, color: 'text.secondary' }}>{cityHint}</Typography>
      )}
    </Group>
  );

  const active = activeFilterCount(draft);
  const [q, setQ] = useState(draft.q);
  useEffect(() => setQ(applied.q), [applied.q]);

  // Search applies after a short pause in typing.
  useEffect(() => {
    if (q === draft.q) return;
    const t = window.setTimeout(() => onChange({ ...draft, q }), 450);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <Box component="section" aria-label="Filters" sx={{ bgcolor: 'background.paper' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, pl: 2.5, pr: 1, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography component="h2" sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 1, fontSize: 16, fontWeight: 700 }}>
          <TuneIcon aria-hidden sx={{ fontSize: 18 }} />
          Filters
          {active > 0 && (
            <Box component="span" sx={{ minWidth: 22, height: 22, px: 0.75, boxSizing: 'border-box', borderRadius: 11, bgcolor: 'primary.main', color: 'primary.contrastText', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {active}
            </Box>
          )}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          {active > 0 && (
            <Box
              component="button"
              type="button"
              onClick={onClear}
              sx={{ minHeight: 44, px: 1, border: 0, bgcolor: 'transparent', color: 'primary.dark', font: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', borderRadius: 1, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
            >
              Clear all
            </Box>
          )}
          {onCollapse && (
            <Box
              component="button"
              type="button"
              onClick={onCollapse}
              aria-label="Collapse filters"
              sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, bgcolor: 'transparent', color: 'text.secondary', cursor: 'pointer', borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover', color: 'text.primary' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
            >
              <Box component="span" sx={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <ChevronLeftIcon aria-hidden sx={{ fontSize: 18 }} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {locked && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25, px: 2.5, py: 1.5, bgcolor: 'success.light', borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
            <Box component="span" sx={{ ...legendSx, color: 'success.dark' }}>This page shows</Box>
            <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 14, fontWeight: 700, color: 'success.dark' }}>
              <LockOutlinedIcon aria-hidden sx={{ fontSize: 16 }} />
              {locked.label}
            </Box>
          </Box>
          <Box component={Link} href={locked.changeHref} sx={{ flex: '0 0 auto', minHeight: 40, display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 600, color: 'primary.dark', textDecoration: 'none' }}>
            Change
          </Box>
        </Box>
      )}

      {shows('coa') && (
        <Box sx={{ px: 2.5, py: 1.75, bgcolor: (t) => (t.palette.mode === 'light' ? t.palette.grey[50] : 'transparent'), borderBottom: '1px solid', borderColor: 'divider' }}>
          <CoaSwitch draft={draft} onChange={onChange} />
        </Box>
      )}

      <Box sx={{ px: 2.5, py: 1.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box component="label" htmlFor="rail-q" sx={legendSx}>
          Search in results
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 44, px: 1.5, boxSizing: 'border-box', border: '1px solid', borderColor: 'grey.400', borderRadius: 1.5, color: 'text.secondary', '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', borderColor: 'primary.main' } }}>
          <SearchIcon aria-hidden sx={{ fontSize: 18 }} />
          <Box
            component="input"
            id="rail-q"
            type="search"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') onChange({ ...draft, q });
            }}
            placeholder="College name or city"
            sx={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: 14, color: 'text.primary', bgcolor: 'transparent' }}
          />
        </Box>
      </Box>

      {states && states.length > 1 && shows('state') && (
        <Group legend="State">
          <StateGroup draft={draft} onChange={onChange} facets={facets} states={states} />
        </Group>
      )}
      {states && cityGroup}
      {shows('exam') && (
        <Group legend="Entrance exam">
          <ExamGroup draft={draft} onChange={onChange} facets={facets} />
        </Group>
      )}
      {shows('type') && (
        <Group legend="College type">
          <TypeGroup draft={draft} onChange={onChange} facets={facets} />
        </Group>
      )}
      {shows('naac') && (
        <Group legend="NAAC grade">
          <NaacGroup draft={draft} onChange={onChange} facets={facets} />
        </Group>
      )}
      {shows('fee') && (
        <Group legend="Annual fee">
          <FeeGroup draft={draft} onChange={onChange} histogram={histogram} />
        </Group>
      )}
      {/* State pages keep City last, as in the canvas filter rail. */}
      {!states && cityGroup}
      {showRating && (
        <Group legend="Rating">
          <RatingGroup draft={draft} onChange={onChange} facets={facets} />
        </Group>
      )}

      <Box sx={{ px: 2.5, py: 1.75, borderTop: '1px solid', borderColor: 'divider' }}>
        <Typography role="status" sx={{ m: 0, fontSize: 13, color: 'text.secondary', textAlign: 'center' }}>
          <Box component="b" sx={{ color: 'text.primary' }}>
            {matchCount.toLocaleString('en-IN')} {matchCount === 1 ? 'college' : 'colleges'}
          </Box>{' '}
          match. Results update as you pick.
        </Typography>
      </Box>
    </Box>
  );
}
