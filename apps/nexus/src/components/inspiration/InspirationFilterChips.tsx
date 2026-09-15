'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@neram/ui';
import TuneIcon from '@mui/icons-material/Tune';
import SortIcon from '@mui/icons-material/Sort';
import type { InspirationFacet, InspirationSort } from '@neram/database/queries/nexus';
import { SORT_LABELS, chipsFor, type InspirationQueryState } from '@/lib/inspiration-query';
import { BY_LABELS, EXAM_LABELS, typeLabel } from '@/lib/inspiration-types';

export interface InspirationFilterChipsProps {
  state: InspirationQueryState;
  facets: InspirationFacet[];
  onChange: (patch: Partial<InspirationQueryState>) => void;
  /** Staff only: the Hidden chip. */
  scope?: 'visible' | 'hidden';
  onScopeChange?: (scope: 'visible' | 'hidden') => void;
}

const TYPE_CHIPS_INLINE = 8;
const SORTS: InspirationSort[] = ['relevant', 'newest', 'saved'];

const rowSx = {
  display: 'flex',
  gap: 1,
  overflowX: 'auto',
  py: 0.5,
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
} as const;

const chipSx = { height: 44, flexShrink: 0, fontWeight: 600 } as const;

/**
 * Filters as chips, with counts, so a student narrows a search without leaving
 * it. Each row scrolls inside itself, so the page never scrolls sideways.
 */
export default function InspirationFilterChips({ state, facets, onChange, scope, onScopeChange }: InspirationFilterChipsProps) {
  const [typesOpen, setTypesOpen] = useState(false);
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null);

  const of = (facet: InspirationFacet['facet']) => facets.filter((f) => f.facet === facet);
  const allTypes = chipsFor(of('type'), state.types);
  const inlineTypes = chipsFor(of('type'), state.types, TYPE_CHIPS_INLINE);
  const toggleType = (slug: string) =>
    onChange({ types: state.types.includes(slug) ? state.types.filter((t) => t !== slug) : [...state.types, slug] });

  const single = <T extends string | number>(label: string, on: boolean, count: number, next: () => void, key: T) => (
    <Chip
      key={String(key)}
      label={`${label} (${count})`}
      color={on ? 'primary' : 'default'}
      variant={on ? 'filled' : 'outlined'}
      aria-pressed={on}
      onClick={next}
      sx={chipSx}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2, minWidth: 0 }}>
      <Box role="group" aria-label="Drawing type" sx={rowSx}>
        {inlineTypes.map((f) =>
          single(f.label ?? typeLabel(f.value), state.types.includes(f.value), f.item_count, () => toggleType(f.value), f.value),
        )}
        {allTypes.length > inlineTypes.length && (
          <Chip icon={<TuneIcon />} label="All types" variant="outlined" onClick={() => setTypesOpen(true)} sx={chipSx} />
        )}
      </Box>

      <Box role="group" aria-label="Exam, drawn by and year" sx={rowSx}>
        {chipsFor(of('exam'), state.exam ? [state.exam] : []).map((f) =>
          single(EXAM_LABELS[f.value] ?? f.value, state.exam === f.value, f.item_count, () =>
            onChange({ exam: state.exam === f.value ? null : (f.value as InspirationQueryState['exam']) }), f.value),
        )}
        {chipsFor(of('by'), state.by ? [state.by] : []).map((f) =>
          single(BY_LABELS[f.value] ?? f.value, state.by === f.value, f.item_count, () =>
            onChange({ by: state.by === f.value ? null : (f.value as InspirationQueryState['by']) }), f.value),
        )}
        {chipsFor(of('year'), state.year ? [String(state.year)] : [])
          .sort((a, b) => Number(b.value) - Number(a.value))
          .map((f) =>
            single(f.value, state.year === Number(f.value), f.item_count, () =>
              onChange({ year: state.year === Number(f.value) ? null : Number(f.value) }), f.value),
          )}
        {onScopeChange && (
          <Chip
            label="Hidden"
            color={scope === 'hidden' ? 'primary' : 'default'}
            variant={scope === 'hidden' ? 'filled' : 'outlined'}
            aria-pressed={scope === 'hidden'}
            onClick={() => onScopeChange(scope === 'hidden' ? 'visible' : 'hidden')}
            sx={chipSx}
          />
        )}
        <Chip
          icon={<SortIcon />}
          label={`Sort: ${SORT_LABELS[state.sort]}`}
          variant="outlined"
          aria-haspopup="menu"
          onClick={(e) => setSortAnchor(e.currentTarget)}
          sx={chipSx}
        />
      </Box>

      <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)}>
        {SORTS.map((s) => (
          <MenuItem
            key={s}
            selected={state.sort === s}
            onClick={() => {
              onChange({ sort: s });
              setSortAnchor(null);
            }}
            sx={{ minHeight: 48 }}
          >
            {SORT_LABELS[s]}
          </MenuItem>
        ))}
      </Menu>

      <Drawer
        anchor="bottom"
        open={typesOpen}
        onClose={() => setTypesOpen(false)}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80dvh' } }}
      >
        <Box sx={{ px: 2, pt: 2 }}>
          <Typography variant="h6" component="h2">
            Drawing types
          </Typography>
        </Box>
        <List>
          {allTypes.map((f) => {
            const on = state.types.includes(f.value);
            const id = `inspiration-type-${f.value}`;
            return (
              <ListItemButton key={f.value} onClick={() => toggleType(f.value)} sx={{ minHeight: 48 }}>
                <Checkbox edge="start" checked={on} tabIndex={-1} disableRipple inputProps={{ 'aria-labelledby': id }} />
                <ListItemText
                  id={id}
                  primary={f.label ?? typeLabel(f.value)}
                  secondary={`${f.item_count} ${f.item_count === 1 ? 'drawing' : 'drawings'}`}
                />
              </ListItemButton>
            );
          })}
        </List>
        <Box sx={{ p: 2, pt: 0 }}>
          <Button fullWidth variant="contained" onClick={() => setTypesOpen(false)} sx={{ minHeight: 48 }}>
            Done
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}
