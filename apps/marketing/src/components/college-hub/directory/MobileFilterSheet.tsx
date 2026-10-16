'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, SwipeableDrawer, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { FacetCounts } from '@/lib/college-hub/listing-filter';
import { EMPTY_DRAFT, type FilterDraft } from './filter-model';
import { CityGroup, CoaSwitch, ExamGroup, FeeGroup, NaacGroup, RatingGroup, SortGroup, StateGroup, TypeGroup } from './FilterGroups';
import type { HideableGroup } from './FilterRail';
import { tokens } from '@/design-system';

export type SheetCategory = 'sort' | 'coa' | 'state' | 'exam' | 'type' | 'naac' | 'fee' | 'city' | 'rating';

interface Props {
  open: boolean;
  onClose: () => void;
  /** The applied filters (from the URL). */
  applied: FilterDraft;
  onApply: (draft: FilterDraft) => void;
  initialCategory?: SheetCategory;
  /** Live result count for the draft; undefined when it can only be known after Apply. */
  countFor?: (draft: FilterDraft) => number;
  facetsFor?: (draft: FilterDraft) => FacetCounts;
  cities: { city: string; city_slug: string; count: number }[];
  histogram?: number[];
  showRating: boolean;
  hide?: readonly HideableGroup[];
  states?: { state: string; state_slug: string; count: number }[];
  cityHint?: string;
}

const CATEGORIES: { id: SheetCategory; label: string; title: string; hint: string }[] = [
  { id: 'sort', label: 'Sort', title: 'Sort results', hint: 'Choose one' },
  { id: 'coa', label: 'COA', title: 'COA approval', hint: '' },
  { id: 'state', label: 'State', title: 'State', hint: 'Choose any' },
  { id: 'exam', label: 'Exam', title: 'Entrance exam', hint: 'Choose any' },
  { id: 'type', label: 'Type', title: 'College type', hint: 'Choose any' },
  { id: 'naac', label: 'NAAC', title: 'NAAC grade', hint: 'Choose any' },
  { id: 'fee', label: 'Fee', title: 'Annual fee', hint: 'Choose one' },
  { id: 'city', label: 'City', title: 'City', hint: 'Choose any' },
  { id: 'rating', label: 'Rating', title: 'Student rating', hint: 'Choose one' },
];

function countIn(d: FilterDraft, id: SheetCategory): number {
  switch (id) {
    case 'sort':
      return d.sort !== 'arch_index' ? 1 : 0;
    case 'coa':
      return d.coa ? 1 : 0;
    case 'fee':
      return d.minFee || d.maxFee ? 1 : 0;
    case 'rating':
      return d.rating ? 1 : 0;
    default:
      return d[id].length;
  }
}

function resetCategory(d: FilterDraft, id: SheetCategory): FilterDraft {
  switch (id) {
    case 'fee':
      return { ...d, minFee: undefined, maxFee: undefined };
    case 'rating':
      return { ...d, rating: undefined };
    default:
      return { ...d, [id]: EMPTY_DRAFT[id] };
  }
}

/** Phone filter sheet (canvas: Mobile · Filter sheet). Edits a draft; Apply writes the URL. */
export default function MobileFilterSheet({
  open,
  onClose,
  applied,
  onApply,
  initialCategory = 'sort',
  countFor,
  facetsFor,
  cities,
  histogram,
  showRating,
  hide = [],
  states,
  cityHint,
}: Props) {
  const [draft, setDraft] = useState<FilterDraft>(applied);
  const [cat, setCat] = useState<SheetCategory>(initialCategory);

  // Start from the applied filters every time the sheet opens.
  useEffect(() => {
    if (open) {
      setDraft(applied);
      setCat(initialCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categories = CATEGORIES.filter((c) => {
    if ((hide as readonly string[]).includes(c.id)) return false;
    if (c.id === 'rating') return showRating;
    if (c.id === 'state') return Boolean(states && states.length > 1);
    if (c.id === 'city') return cities.length > 0 || Boolean(cityHint);
    return true;
  });
  const current = categories.find((c) => c.id === cat) ?? categories[0];
  const facets = useMemo(() => facetsFor?.(draft), [facetsFor, draft]);
  const matches = countFor?.(draft);
  const total = categories.reduce((n, c) => (c.id === 'sort' ? n : n + countIn(draft, c.id)), 0);
  const none = matches === 0;

  const group = (() => {
    const props = { draft, onChange: setDraft, facets, touch: true };
    switch (current.id) {
      case 'sort':
        return <SortGroup {...props} hideRating={!showRating} />;
      case 'coa':
        return <CoaSwitch {...props} />;
      case 'exam':
        return <ExamGroup {...props} />;
      case 'type':
        return <TypeGroup {...props} />;
      case 'naac':
        return <NaacGroup {...props} />;
      case 'fee':
        return <FeeGroup {...props} histogram={histogram} />;
      case 'state':
        return <StateGroup {...props} states={states ?? []} initial={50} />;
      case 'city':
        return cities.length > 0 ? (
          <CityGroup {...props} cities={cities} initial={50} />
        ) : (
          <Typography sx={{ m: 0, px: 2, py: 1.5, fontSize: '0.92rem', color: tokens.inkMuted }}>{cityHint}</Typography>
        );
      case 'rating':
        return <RatingGroup {...props} />;
    }
  })();

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => undefined}
      disableSwipeToOpen
      // Above the broadcast banner (1400) and the chat button (1300).
      sx={{ zIndex: 1450 }}
      PaperProps={{
        role: 'dialog',
        'aria-modal': true,
        'aria-labelledby': 'filter-sheet-title',
        sx: { height: 'calc(100dvh - 64px)', maxHeight: 'calc(100vh - 64px)', borderTopLeftRadius: 20, borderTopRightRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      } as object}
      ModalProps={{ keepMounted: false }}
    >
      <Box aria-hidden sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
        <Box sx={{ width: 36, height: 4, borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.lineStrong }} />
      </Box>

      <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, height: 52, pl: 2, pr: 0.5, borderBottom: '1px solid', borderColor: tokens.line }}>
        <Typography id="filter-sheet-title" component="h2" sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.1rem', fontWeight: 700 }}>
          Filters
          {total > 0 && (
            <Box component="span" sx={{ minWidth: 20, height: 20, px: 0.75, boxSizing: 'border-box', borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.navy900, color: tokens.paper, fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {total}
            </Box>
          )}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box
            component="button"
            type="button"
            onClick={() => setDraft({ ...EMPTY_DRAFT, q: draft.q })}
            sx={{ height: 44, px: 1.25, border: 0, bgcolor: 'transparent', color: tokens.navy900, font: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
          >
            Clear all
          </Box>
          <Box
            component="button"
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, bgcolor: 'transparent', color: tokens.inkMuted, cursor: 'pointer', borderRadius: '50%', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
          >
            <CloseIcon aria-hidden />
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}>
        <Box component="nav" aria-label="Filter categories" sx={{ flex: '0 0 124px', overflowY: 'auto', bgcolor: tokens.surfaceHover }}>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {categories.map((k) => {
              const on = k.id === current.id;
              const n = countIn(draft, k.id);
              return (
                <li key={k.id}>
                  <Box
                    component="button"
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    onClick={() => setCat(k.id)}
                    sx={{
                      width: '100%',
                      minHeight: 52,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 0.75,
                      pl: 1.75,
                      pr: 1.25,
                      boxSizing: 'border-box',
                      border: 0,
                      borderLeft: '3px solid',
                      borderLeftColor: on ? tokens.navy900 : 'transparent',
                      bgcolor: on ? tokens.surface : 'transparent',
                      color: on ? tokens.navy900 : tokens.ink,
                      font: 'inherit',
                      fontSize: '0.88rem',
                      fontWeight: on ? 700 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: -2 },
                    }}
                  >
                    <span>{k.label}</span>
                    {n > 0 && (
                      <Box component="span" sx={{ minWidth: 18, height: 18, px: 0.6, boxSizing: 'border-box', borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.navy900, color: tokens.paper, fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {n}
                      </Box>
                    )}
                  </Box>
                </li>
              );
            })}
          </Box>
        </Box>

        <Box sx={{ flex: '1 1 auto', minWidth: 0, overflowY: 'auto', overscrollBehavior: 'contain', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, px: 2, pt: 1.75, pb: 0.75 }}>
            <Typography component="h3" sx={{ m: 0, fontSize: '0.98rem', fontWeight: 700 }}>
              {current.title}
            </Typography>
            {current.hint && (
              <Box component="span" sx={{ fontSize: '0.78rem', color: tokens.inkMuted }}>
                {current.hint}
              </Box>
            )}
          </Box>
          <Box role="group" aria-label={current.title} sx={{ display: 'flex', flexDirection: 'column' }}>
            {group}
          </Box>
        </Box>
      </Box>

      <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 1.25, px: 2, pt: 1.25, pb: 'max(14px, env(safe-area-inset-bottom))', borderTop: '1px solid', borderColor: tokens.line, bgcolor: tokens.surface }}>
        <Box
          component="button"
          type="button"
          onClick={() => setDraft(resetCategory(draft, current.id))}
          sx={{ flex: '0 0 auto', height: 48, px: 2, border: '1px solid', borderColor: tokens.lineStrong, borderRadius: 1, bgcolor: tokens.surface, color: tokens.ink, font: 'inherit', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
        >
          Reset
        </Box>
        <Box
          component="button"
          type="button"
          disabled={none}
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          sx={{
            flex: '1 1 auto',
            height: 48,
            border: 0,
            borderRadius: 1,
            bgcolor: none ? tokens.statusIdle : tokens.navy900,
            color: tokens.paper,
            font: 'inherit',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: none ? 'not-allowed' : 'pointer',
            '&:hover': { bgcolor: none ? tokens.statusIdle : tokens.navy700 },
            '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 },
          }}
        >
          {matches === undefined ? 'Show colleges' : none ? 'No colleges match' : `Show ${matches} ${matches === 1 ? 'college' : 'colleges'}`}
        </Box>
      </Box>
    </SwipeableDrawer>
  );
}
