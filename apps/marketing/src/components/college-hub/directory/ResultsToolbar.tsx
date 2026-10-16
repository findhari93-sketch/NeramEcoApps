'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { COLLEGE_TYPES, EXAM_FILTERS, SORT_OPTIONS } from '@/lib/college-hub/constants';
import { formatRupees } from '@/lib/college-hub/format';
import type { ViewMode } from '../view-mode';
import type { FilterDraft, SortKey } from './filter-model';
import HubSelect from './HubSelect';
import { hubType } from './hub-styles';
import { tokens } from '@/design-system';

interface Props {
  shown: number;
  total: number;
  draft: FilterDraft;
  onChange: (next: FilterDraft) => void;
  onClear: () => void;
  view: ViewMode;
  viewHref: (view: ViewMode) => string;
  cityNames: Record<string, string>;
  stateNames?: Record<string, string>;
  showRatingSort: boolean;
}

interface Chip {
  key: string;
  label: string;
  remove: (d: FilterDraft) => FilterDraft;
}

export function activeChips(d: FilterDraft, cityNames: Record<string, string>, stateNames: Record<string, string> = {}): Chip[] {
  const chips: Chip[] = [];
  if (d.coa) chips.push({ key: 'coa', label: 'COA approved', remove: (x) => ({ ...x, coa: false }) });
  if (d.q.trim()) chips.push({ key: 'q', label: `"${d.q.trim()}"`, remove: (x) => ({ ...x, q: '' }) });
  for (const e of d.exam) {
    chips.push({ key: `exam-${e}`, label: EXAM_FILTERS.find((x) => x.value === e)?.label ?? e, remove: (x) => ({ ...x, exam: x.exam.filter((v) => v !== e) }) });
  }
  for (const t of d.type) {
    chips.push({ key: `type-${t}`, label: COLLEGE_TYPES.find((x) => x.value.toLowerCase() === t)?.label ?? t, remove: (x) => ({ ...x, type: x.type.filter((v) => v !== t) }) });
  }
  for (const g of d.naac) {
    chips.push({ key: `naac-${g}`, label: g === 'none' ? 'No NAAC grade' : `NAAC ${g}`, remove: (x) => ({ ...x, naac: x.naac.filter((v) => v !== g) }) });
  }
  if (d.minFee || d.maxFee) {
    const label = d.minFee && d.maxFee ? `${formatRupees(d.minFee)} to ${formatRupees(d.maxFee)}` : d.maxFee ? `Under ${formatRupees(d.maxFee)}` : `Above ${formatRupees(d.minFee!)}`;
    chips.push({ key: 'fee', label: `${label} a year`, remove: (x) => ({ ...x, minFee: undefined, maxFee: undefined }) });
  }
  for (const st of d.state) {
    chips.push({ key: `state-${st}`, label: stateNames[st] ?? st.replace(/-/g, ' '), remove: (x) => ({ ...x, state: x.state.filter((v) => v !== st), city: [] }) });
  }
  for (const c of d.city) {
    chips.push({ key: `city-${c}`, label: cityNames[c] ?? c.replace(/-/g, ' '), remove: (x) => ({ ...x, city: x.city.filter((v) => v !== c) }) });
  }
  if (d.rating) chips.push({ key: 'rating', label: `Rated ${d.rating.toFixed(1)} and above`, remove: (x) => ({ ...x, rating: undefined }) });
  if (d.letter) chips.push({ key: 'letter', label: `Starts with ${d.letter}`, remove: (x) => ({ ...x, letter: undefined }) });
  return chips;
}

const VIEWS: { id: ViewMode; label: string; Icon: typeof ViewAgendaOutlinedIcon }[] = [
  { id: 'list', label: 'List', Icon: ViewAgendaOutlinedIcon },
  { id: 'grid', label: 'Grid', Icon: GridViewOutlinedIcon },
  { id: 'table', label: 'Table', Icon: TableChartOutlinedIcon },
];

/** Results count, active filter chips, sort and view switcher (canvas: Main toolbar, one row). */
export default function ResultsToolbar({ shown, total, draft, onChange, onClear, view, viewHref, cityNames, stateNames, showRatingSort }: Props) {
  const chips = activeChips(draft, cityNames, stateNames);
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 16px', mb: 1.75 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 10px', minWidth: 0, flex: '1 1 320px' }}>
        <Typography role="status" sx={{ m: 0, fontSize: hubType.body, color: tokens.inkMuted, whiteSpace: 'nowrap' }}>
          Showing <Box component="b" sx={{ color: tokens.ink }}>{shown.toLocaleString('en-IN')}</Box> of{' '}
          <Box component="b" sx={{ color: tokens.ink }}>{total.toLocaleString('en-IN')}</Box> {total === 1 ? 'college' : 'colleges'}
        </Typography>
        {chips.length > 0 && (
          <>
            <Box aria-hidden sx={{ width: '1px', height: 20, bgcolor: tokens.line, display: { xs: 'none', sm: 'block' } }} />
            <Box component="ul" aria-label="Active filters" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
              {chips.map((c) => (
                <li key={c.key}>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onChange(c.remove(draft))}
                    aria-label={`Remove filter: ${c.label}`}
                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 36, pl: 1.5, pr: 1, border: '1px solid', borderColor: tokens.lineStrong, borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.surfaceHover, color: tokens.navy900, font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
                  >
                    {c.label}
                    <CloseIcon aria-hidden sx={{ fontSize: 14 }} />
                  </Box>
                </li>
              ))}
              <li>
                <Box
                  component="button"
                  type="button"
                  onClick={onClear}
                  sx={{ minHeight: 36, px: 0.75, border: 0, bgcolor: 'transparent', color: tokens.navy900, font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
                >
                  Clear all
                </Box>
              </li>
            </Box>
          </>
        )}
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'flex' }, flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
        <Box component="label" htmlFor="results-sort" sx={{ fontSize: hubType.meta, color: tokens.inkMuted }}>
          Sort by
        </Box>
        <HubSelect id="results-sort" value={draft.sort} onChange={(e) => onChange({ ...draft, sort: e.target.value as SortKey })} fontSize={13.5} sx={{ minWidth: 190 }}>
          {SORT_OPTIONS.filter((o) => showRatingSort || o.value !== 'rating_high').map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </HubSelect>
        <Box component="nav" aria-label="Result view" sx={{ display: 'flex', border: '1px solid', borderColor: tokens.lineStrong, borderRadius: 1, overflow: 'hidden', bgcolor: tokens.surface }}>
          {VIEWS.map(({ id, label, Icon }, i) => {
            const on = view === id;
            return (
              <Box
                key={id}
                component={Link}
                href={viewHref(id)}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.75, height: 42, px: 1.5, borderLeft: i ? '1px solid' : 0, borderColor: tokens.lineStrong, bgcolor: on ? tokens.navy900 : 'transparent', color: on ? tokens.paper : tokens.inkMuted, fontSize: 13.5, fontWeight: 600, textDecoration: 'none', '&:hover': { color: on ? tokens.paper : tokens.ink }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: -3 } }}
              >
                <Icon aria-hidden sx={{ fontSize: 17 }} />
                {label}
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
