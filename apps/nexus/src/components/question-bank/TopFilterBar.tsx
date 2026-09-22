'use client';

import type { ReactNode } from 'react';
import { Box, Chip, Badge, useTheme } from '@neram/ui';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import type { QBFilterState, QBExamType } from '@neram/database';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import { getFilterChips, removeFilterValue, type ActiveChip } from './FilterChips';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TopFilterBarProps {
  filters: QBFilterState;
  onFilterChange: (filters: QBFilterState) => void;
  onOpenDrawer: () => void;
  activeFilterCount: number;

  /** One paper, or one exam: the quick chips below are the drawer's job there. */
  isYearPaperView?: boolean;

  /**
   * slug -> label for the subject tag tree, so a collapsed parent selection
   * renders as "Coordinate Geometry" and not the raw slug. Parent slugs are not
   * members of QBCategory, so QB_CATEGORY_LABELS cannot resolve them.
   */
  categoryLabels?: Record<string, string>;

  /** Pinned to the end of the chip row, e.g. the Grid / List switch. */
  trailing?: ReactNode;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
//
// Chip derivation and removal both live in FilterChips.tsx so the chip row and
// the filter-button badge cannot disagree. This file used to carry a parallel
// copy of both, and the two had already drifted apart.

// ─── Quick-access chip config ───────────────────────────────────────────────

interface QuickChip {
  label: string;
  filterKey: keyof QBFilterState;
  /**
   * Extra state keys this chip also reflects.
   *
   * "Exam" is one control over two fields: the drawer's Exam Type accordion
   * writes `exam_type`, while a preset or a shared URL can carry
   * `exam_relevance`. Without this the chip sat unlit while an exam filter was
   * plainly applied.
   */
  alsoKeys?: (keyof QBFilterState)[];
}

/** Every state key a quick chip speaks for, primary first. */
function chipKeys(chip: QuickChip): (keyof QBFilterState)[] {
  return [chip.filterKey, ...(chip.alsoKeys || [])];
}

const QUICK_CHIPS: QuickChip[] = [
  { label: 'Exam', filterKey: 'exam_type', alsoKeys: ['exam_relevance'] },
  { label: 'Difficulty', filterKey: 'difficulty' },
  { label: 'Category', filterKey: 'categories' },
  { label: 'Format', filterKey: 'question_format' },
  { label: 'Status', filterKey: 'attempt_status' },
];

function isSet(val: unknown): boolean {
  if (val === undefined || val === null) return false;
  if (Array.isArray(val)) return val.length > 0;
  if (val === 'all') return false;
  return true;
}

function getQuickChipLabel(filters: QBFilterState, chip: QuickChip): string {
  // Label from whichever of the chip's keys is actually set.
  const key = chipKeys(chip).find((k) => isSet(filters[k]));
  if (!key) return chip.label;
  const val = filters[key];

  if (Array.isArray(val)) return `${chip.label} (${val.length})`;
  if (key === 'exam_relevance') return val === 'BOTH' ? 'Both Exams' : String(val);
  if (key === 'exam_type') return QB_EXAM_TYPE_LABELS[val as QBExamType] ?? String(val);
  if (key === 'attempt_status') return String(val).charAt(0).toUpperCase() + String(val).slice(1);
  return String(val);
}

function isQuickChipActive(filters: QBFilterState, chip: QuickChip): boolean {
  return chipKeys(chip).some((k) => isSet(filters[k]));
}

// ─── Styles ─────────────────────────────────────────────────────────────────

/**
 * A 36px chip with a 44px hit area.
 *
 * The hit area used to be an `::after` inside a row that scrolled sideways, and
 * `overflow-x: auto` forces `overflow-y` to auto as well: the 44px box stuck
 * out of a 32px row, the row gained a few pixels of hidden vertical scroll, and
 * a wheel or a focus scroll slid every chip up under the row's top edge. That
 * was the clipped "JEE Paper 2 2014" / "Video solutions" row. The row now
 * wraps and never scrolls, and a 4px row gap per side keeps each hit area
 * inside it.
 */
const CHIP_HIT = {
  height: 36,
  position: 'relative',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: '0.8125rem',
  borderRadius: '18px',
  '&::after': { content: '""', position: 'absolute', left: 0, right: 0, top: -4, bottom: -4 },
  '& .MuiChip-icon': { color: 'inherit' },
  '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

// ─── Component ──────────────────────────────────────────────────────────────

export default function TopFilterBar({
  filters,
  onFilterChange,
  onOpenDrawer,
  activeFilterCount,
  isYearPaperView,
  categoryLabels,
  trailing,
}: TopFilterBarProps) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const accentDark = theme.palette.primary.dark;

  const activeChips: ActiveChip[] = getFilterChips(filters, categoryLabels);
  const videoOn = filters.solution_filter === 'has_video';

  const on = { bgcolor: accent, color: theme.palette.primary.contrastText, '&:hover': { bgcolor: accentDark } };
  const off = {
    borderColor: 'divider',
    color: 'text.secondary',
    '&:hover': { borderColor: accent, color: accent },
  };

  function handleDismissChip(key: keyof QBFilterState, value?: string | number) {
    onFilterChange(removeFilterValue(filters, key, value));
  }

  return (
    <Box>
      {/* Quick filters, the Filters drawer, and whatever the page pins after them */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 1,
          py: 0.5,
          overflow: 'visible',
        }}
      >
        {/* Quick chips. Below sm they are hidden: each only opens the drawer,
            and the active-filter row underneath says what is applied. */}
        {!isYearPaperView &&
          QUICK_CHIPS.map((chip) => {
            const active = isQuickChipActive(filters, chip);
            return (
              <Chip
                key={chip.filterKey}
                label={getQuickChipLabel(filters, chip)}
                variant={active ? 'filled' : 'outlined'}
                onClick={onOpenDrawer}
                sx={{ ...CHIP_HIT, fontWeight: 500, display: { xs: 'none', sm: 'inline-flex' }, ...(active ? on : off) }}
              />
            );
          })}

        {/* Video solutions: a one-tap lens rather than a drawer setting, and
            shown on a year paper too, where the quick chips above are hidden
            but where students actually practise. */}
        <Chip
          icon={<PlayCircleOutlineIcon aria-hidden sx={{ fontSize: 18 }} />}
          label="Video solutions"
          variant={videoOn ? 'filled' : 'outlined'}
          onClick={() => onFilterChange({ ...filters, solution_filter: videoOn ? undefined : 'has_video' })}
          aria-pressed={videoOn}
          sx={{ ...CHIP_HIT, ...(videoOn ? on : off) }}
        />

        <Badge
          badgeContent={activeFilterCount}
          color="error"
          invisible={activeFilterCount === 0}
          sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 18, minWidth: 18 } }}
        >
          <Chip
            icon={<FilterListIcon aria-hidden sx={{ fontSize: 18 }} />}
            label="Filters"
            variant="outlined"
            onClick={onOpenDrawer}
            sx={{
              ...CHIP_HIT,
              ...(activeFilterCount > 0 ? { borderColor: accent, color: accent } : off),
            }}
          />
        </Badge>

        {trailing && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>{trailing}</Box>
        )}
      </Box>

      {/* What is applied, each removable in one tap */}
      {activeChips.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, pt: 0.5, pb: 0.5 }}>
          {activeChips.map((chip, idx) => (
            <Chip
              key={`${String(chip.key)}-${chip.value ?? idx}`}
              label={chip.label}
              deleteIcon={<CloseIcon aria-label={`Remove ${chip.label}`} sx={{ fontSize: 16 }} />}
              onDelete={() => handleDismissChip(chip.key, chip.value)}
              sx={{
                height: 32,
                fontSize: '0.8125rem',
                fontWeight: 500,
                borderRadius: '16px',
                bgcolor: 'warning.light',
                border: '1px solid',
                borderColor: 'warning.main',
                color: 'warning.dark',
                '& .MuiChip-deleteIcon': { color: 'warning.dark', '&:hover': { color: 'error.main' } },
              }}
            />
          ))}
          {activeChips.length > 1 && (
            <Chip
              label="Clear all"
              onClick={() => onFilterChange({})}
              sx={{
                height: 32,
                fontSize: '0.8125rem',
                fontWeight: 500,
                borderRadius: '16px',
                bgcolor: 'transparent',
                border: '1px solid',
                borderColor: 'error.light',
                color: 'error.main',
                cursor: 'pointer',
              }}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
