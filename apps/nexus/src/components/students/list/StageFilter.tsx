'use client';

import { useState } from 'react';
import { Badge, Box, Button, Checkbox, Drawer, Typography, useMediaQuery, useTheme } from '@neram/ui';
import TuneIcon from '@mui/icons-material/Tune';
import { stageColor } from '@/lib/student-stage';
import type { FilterSection } from './FilterMenu';
import {
  STAGE_FILTER_HINT,
  STAGE_FILTER_LABEL,
  STAGE_FILTER_ORDER,
  STAGE_FILTER_RING,
  type StageFilterKey,
} from '@/lib/student-list-view';

/**
 * Filter by the ring on the avatar: Exam this year (Break Year and Class 12),
 * Class 11, Class 10, Not set. Picking several shows any of them.
 *
 * Each option carries the ring colour as a dot AND its name, so colour is never
 * the only cue. Chips on a wider screen, where a teacher scans them at once; a
 * bottom sheet on a phone, where four chips beside search would wrap into a
 * second and third line.
 */

/**
 * The same stage filter as one section of a FilterMenu, for the compact
 * toolbar. Same labels, hints, counts and ring colours as the chips.
 */
export function useStageFilterSection({
  value,
  counts,
  onToggle,
  onClear,
  disabled = false,
}: {
  value: readonly StageFilterKey[];
  counts: Record<StageFilterKey, number>;
  onToggle: (key: StageFilterKey) => void;
  onClear: () => void;
  disabled?: boolean;
}): FilterSection {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  return {
    id: 'stage',
    title: 'Stage',
    mode: 'multi',
    value,
    onToggle: (key) => onToggle(key as StageFilterKey),
    onClear,
    disabled,
    options: STAGE_FILTER_ORDER.map((key) => ({
      key,
      label: STAGE_FILTER_LABEL[key],
      hint: STAGE_FILTER_HINT[key],
      count: counts[key],
      color: stageColor(STAGE_FILTER_RING[key], mode),
      dotStyle: key === 'unset' ? 'dotted' : 'ring',
    })),
  };
}

const RESET_BUTTON = { appearance: 'none', font: 'inherit', cursor: 'pointer', textAlign: 'left' } as const;

export default function StageFilter({
  value,
  counts,
  onToggle,
  onClear,
  disabled = false,
}: {
  value: readonly StageFilterKey[];
  counts: Record<StageFilterKey, number>;
  onToggle: (key: StageFilterKey) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const mode = theme.palette.mode === 'dark' ? 'dark' : 'light';
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);

  const dot = (key: StageFilterKey) => (
    <Box
      aria-hidden
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        flexShrink: 0,
        borderWidth: 2,
        borderColor: stageColor(STAGE_FILTER_RING[key], mode),
        borderStyle: key === 'unset' ? 'dotted' : 'solid',
      }}
    />
  );

  if (isPhone) {
    const summary = value.length === 0 ? 'Stage' : value.length === 1 ? STAGE_FILTER_LABEL[value[0]] : `${value.length} stages`;
    return (
      <>
        <Badge color="primary" badgeContent={value.length > 1 ? value.length : 0} invisible={value.length < 2} overlap="rectangular">
          <Button
            size="small"
            variant={value.length ? 'contained' : 'outlined'}
            disableElevation
            startIcon={<TuneIcon />}
            disabled={disabled}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={value.length ? `Stage filter: ${value.map((v) => STAGE_FILTER_LABEL[v]).join(', ')}` : 'Filter by stage'}
            data-testid="stage-filter-button"
            sx={{
              minHeight: 48,
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 2,
              whiteSpace: 'nowrap',
              ...(value.length ? {} : { bgcolor: 'background.paper' }),
            }}
          >
            {summary}
          </Button>
        </Badge>
        <Drawer
          anchor="bottom"
          open={open}
          onClose={() => setOpen(false)}
          PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'calc(8px + env(safe-area-inset-bottom))' } }}
        >
          <Box sx={{ px: 2, pt: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 }}>
            <Typography component="h2" sx={{ fontWeight: 800, fontSize: 16 }}>Filter by stage</Typography>
            {value.length > 0 && (
              <Button onClick={onClear} sx={{ minHeight: 44, textTransform: 'none' }}>
                Clear
              </Button>
            )}
          </Box>
          <Box role="group" aria-label="Stages">
            {STAGE_FILTER_ORDER.map((key) => {
              const checked = value.includes(key);
              return (
                <Box
                  component="button"
                  type="button"
                  key={key}
                  onClick={() => onToggle(key)}
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`${STAGE_FILTER_LABEL[key]}, ${counts[key]}. ${STAGE_FILTER_HINT[key]}`}
                  data-testid={`stage-option-${key}`}
                  sx={{
                    ...RESET_BUTTON,
                    width: '100%',
                    minHeight: 56,
                    px: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    border: 0,
                    bgcolor: checked ? 'action.selected' : 'transparent',
                    color: 'text.primary',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                  }}
                >
                  <Checkbox checked={checked} tabIndex={-1} disableRipple sx={{ p: 0 }} inputProps={{ 'aria-hidden': true }} />
                  {dot(key)}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>{STAGE_FILTER_LABEL[key]}</Typography>
                    <Typography variant="caption" color="text.secondary">{STAGE_FILTER_HINT[key]}</Typography>
                  </Box>
                  <Typography sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>{counts[key]}</Typography>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ px: 2, pt: 1 }}>
            <Button fullWidth variant="contained" onClick={() => setOpen(false)} sx={{ minHeight: 48 }}>
              Done
            </Button>
          </Box>
        </Drawer>
      </>
    );
  }

  return (
    <Box role="group" aria-label="Filter by stage" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {STAGE_FILTER_ORDER.map((key) => {
        const selected = value.includes(key);
        return (
          <Box
            component="button"
            type="button"
            key={key}
            onClick={() => onToggle(key)}
            disabled={disabled}
            aria-pressed={selected}
            title={STAGE_FILTER_HINT[key]}
            data-testid={`stage-chip-${key}`}
            sx={{
              ...RESET_BUTTON,
              display: 'inline-flex',
              alignItems: 'center',
              minHeight: 44,
              px: 1.5,
              gap: 1,
              borderRadius: 999,
              border: '1px solid',
              borderColor: selected ? 'primary.main' : 'divider',
              bgcolor: selected ? 'action.selected' : 'background.paper',
              color: selected ? 'primary.main' : 'text.primary',
              fontWeight: selected ? 700 : 500,
              fontSize: 14,
              transition: 'border-color 150ms ease, background-color 150ms ease',
              '&:hover:not(:disabled)': { borderColor: selected ? 'primary.main' : 'text.secondary' },
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              '&:disabled': { opacity: 0.5, cursor: 'default' },
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            {dot(key)}
            {STAGE_FILTER_LABEL[key]}
            <Box component="span" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {counts[key]}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
