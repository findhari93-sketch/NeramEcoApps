'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, SwipeableDrawer, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import CheckIcon from '@mui/icons-material/Check';
import { alpha } from '@mui/material/styles';
import { activeFilterCount, type FilterDraft } from './filter-model';
import type { SheetCategory } from './MobileFilterSheet';
import type { StateOption } from './DirectoryHero';

interface Props {
  stateSlug?: string;
  stateName?: string;
  states?: StateOption[];
  totalCount: number;
  draft: FilterDraft;
  onChange: (next: FilterDraft) => void;
  onOpenSheet: (category: SheetCategory) => void;
}

const QUICK: { id: SheetCategory; label: string }[] = [
  { id: 'sort', label: 'Sort' },
  { id: 'fee', label: 'Fee' },
  { id: 'type', label: 'Type' },
  { id: 'city', label: 'City' },
  { id: 'naac', label: 'NAAC' },
  { id: 'exam', label: 'Exam' },
];

function quickActive(d: FilterDraft, id: SheetCategory): boolean {
  if (id === 'sort') return d.sort !== 'arch_index';
  if (id === 'fee') return Boolean(d.minFee || d.maxFee);
  if (id === 'type' || id === 'city' || id === 'naac' || id === 'exam') return d[id].length > 0;
  return false;
}

const chipSx = (on: boolean) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 0.25,
  height: 36,
  pl: 1.5,
  pr: 1,
  border: '1px solid',
  borderColor: on ? 'primary.main' : 'grey.400',
  borderRadius: 18,
  bgcolor: on ? 'primary.main' : 'background.paper',
  color: on ? 'primary.contrastText' : 'text.primary',
  font: 'inherit',
  fontSize: '0.84rem',
  fontWeight: on ? 700 : 500,
  whiteSpace: 'nowrap' as const,
  cursor: 'pointer',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
});

/** Phone header of the directory (canvas: Mobile · Results). */
export default function MobileDirectoryHeader({ stateSlug, stateName, states, totalCount, draft, onChange, onOpenSheet }: Props) {
  const [q, setQ] = useState(draft.q);
  const [statePicker, setStatePicker] = useState(false);
  useEffect(() => setQ(draft.q), [draft.q]);
  useEffect(() => {
    if (q === draft.q) return;
    const t = window.setTimeout(() => onChange({ ...draft, q }), 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = activeFilterCount(draft);

  return (
    <Box component="header" sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 1, mx: -2, mb: 0, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      {stateName && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, height: 52, pl: 0.5, pr: 1 }}>
          <Box
            component={Link}
            href="/colleges"
            aria-label="Back to colleges"
            sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.primary', borderRadius: '50%', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
          >
            <ArrowBackIcon aria-hidden />
          </Box>
          <Box
            component="button"
            type="button"
            onClick={() => setStatePicker(true)}
            aria-label={`Change state, current: ${stateName}`}
            disabled={!states || states.length < 2}
            sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', height: 48, px: 0.5, border: 0, bgcolor: 'transparent', color: 'text.primary', font: 'inherit', textAlign: 'left', cursor: 'pointer', borderRadius: 1, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
          >
            <Box component="span" sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.2 }}>
              {stateName}
              {states && states.length > 1 && <ExpandMoreIcon aria-hidden sx={{ fontSize: 20 }} />}
            </Box>
            <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
              {totalCount} B.Arch {totalCount === 1 ? 'college' : 'colleges'}
            </Box>
          </Box>
          <Box
            component={Link}
            href="/colleges/saved"
            aria-label="Saved colleges"
            sx={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.primary', borderRadius: '50%', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
          >
            <FavoriteBorderIcon aria-hidden />
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, px: 2, pt: stateName ? 0 : 1.5 }}>
        <Box sx={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 1, height: 44, px: 1.5, boxSizing: 'border-box', borderRadius: 1.5, bgcolor: (t) => (t.palette.mode === 'light' ? t.palette.grey[100] : t.palette.background.default), color: 'text.secondary', '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main' } }}>
          <SearchIcon aria-hidden sx={{ fontSize: 20 }} />
          <Box component="label" htmlFor="m-dir-q" sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
            Search colleges
          </Box>
          <Box
            component="input"
            id="m-dir-q"
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') onChange({ ...draft, q });
            }}
            placeholder="Search college or city"
            sx={{ flex: '1 1 auto', minWidth: 0, border: 0, outline: 'none', font: 'inherit', fontSize: '1rem', color: 'text.primary', bgcolor: 'transparent' }}
          />
        </Box>
        <Box
          component="button"
          type="button"
          onClick={() => onOpenSheet('sort')}
          aria-label={active ? `Filters, ${active} active` : 'Filters'}
          sx={{ position: 'relative', flex: '0 0 44px', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, borderRadius: 1.5, bgcolor: 'grey.900', color: 'common.white', cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
        >
          <TuneIcon aria-hidden />
          {active > 0 && (
            <Box component="span" sx={{ position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, px: 0.5, boxSizing: 'border-box', borderRadius: 10, bgcolor: 'primary.main', color: 'primary.contrastText', border: '2px solid', borderColor: 'background.paper', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {active}
            </Box>
          )}
        </Box>
      </Box>

      <Box component="ul" aria-label="Quick filters" sx={{ listStyle: 'none', m: 0, px: 2, pt: 0.25, pb: 1.25, display: 'flex', gap: 0.75, overflowX: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        <li>
          <Box component="button" type="button" aria-pressed={draft.coa} onClick={() => onChange({ ...draft, coa: !draft.coa })} sx={{ ...chipSx(draft.coa), pr: 1.5, gap: 0.5 }}>
            {draft.coa && <CheckIcon aria-hidden sx={{ fontSize: 15 }} />}
            COA approved
          </Box>
        </li>
        {QUICK.map((k) => {
          const on = quickActive(draft, k.id);
          return (
            <li key={k.id}>
              <Box component="button" type="button" onClick={() => onOpenSheet(k.id)} aria-haspopup="dialog" sx={chipSx(on)}>
                {k.label}
                <ExpandMoreIcon aria-hidden sx={{ fontSize: 18 }} />
              </Box>
            </li>
          );
        })}
      </Box>

      {states && stateSlug && (
        <SwipeableDrawer
          anchor="bottom"
          open={statePicker}
          onClose={() => setStatePicker(false)}
          onOpen={() => undefined}
          disableSwipeToOpen
          sx={{ zIndex: 1450 }}
          PaperProps={{ role: 'dialog', 'aria-modal': true, sx: { maxHeight: '80dvh', borderTopLeftRadius: 20, borderTopRightRadius: 20 }, 'aria-label': 'Choose a state' } as object}
        >
          <Box aria-hidden sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
            <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'grey.400' }} />
          </Box>
          <Typography component="h2" sx={{ m: 0, px: 2, py: 1.5, fontSize: '1.05rem', fontWeight: 700 }}>
            Choose a state
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, overflowY: 'auto', pb: 'max(16px, env(safe-area-inset-bottom))' }}>
            {states.map((s) => {
              const on = s.state_slug === stateSlug;
              return (
                <li key={s.state_slug}>
                  <Box
                    component={Link}
                    href={`/colleges/${s.state_slug}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={() => setStatePicker(false)}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, px: 2, borderTop: '1px solid', borderColor: 'divider', color: on ? 'primary.dark' : 'text.primary', bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.06) : 'transparent'), fontWeight: on ? 700 : 500, textDecoration: 'none' }}
                  >
                    {s.state}
                    <Box component="span" sx={{ fontSize: '0.84rem', color: 'text.secondary', fontWeight: 400 }}>
                      {s.count}
                    </Box>
                  </Box>
                </li>
              );
            })}
          </Box>
        </SwipeableDrawer>
      )}
    </Box>
  );
}
