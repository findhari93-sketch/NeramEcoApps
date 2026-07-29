'use client';

import {
  Box,
  Chip,
  Badge,
  Button,
  IconButton,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import TranslateIcon from '@mui/icons-material/Translate';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import CancelIcon from '@mui/icons-material/Cancel';
import type { QBFilterState, QBExamType } from '@neram/database';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import { getFilterChips, removeFilterValue, type ActiveChip } from './FilterChips';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TopFilterBarProps {
  // Filter state
  filters: QBFilterState;
  onFilterChange: (filters: QBFilterState) => void;
  onOpenDrawer: () => void;
  activeFilterCount: number;

  // Results
  totalCount: number;
  filteredCount: number;

  // Selection mode
  selectionMode: boolean;
  selectedCount: number;
  onToggleSelectionMode: () => void;
  onSelectAll: () => void;
  onCreateTest: () => void;

  // Context (for year paper view)
  contextLabel?: string; // e.g., "JEE 2026"
  isYearPaperView?: boolean;

  // Language
  lang: 'en' | 'hi';
  onLangChange: (lang: 'en' | 'hi') => void;

  /**
   * slug -> label for the subject tag tree, so a collapsed parent selection
   * renders as "Coordinate Geometry" and not the raw slug. Parent slugs are not
   * members of QBCategory, so QB_CATEGORY_LABELS cannot resolve them.
   */
  categoryLabels?: Record<string, string>;
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

const PURPLE_ACCENT = '#7c4dff';
const ORANGE_BG = '#fff3e0';
const ORANGE_BORDER = '#ffe0b2';
const ORANGE_TEXT = '#e65100';

// ─── Component ──────────────────────────────────────────────────────────────

export default function TopFilterBar({
  filters,
  onFilterChange,
  onOpenDrawer,
  activeFilterCount,
  totalCount,
  filteredCount,
  selectionMode,
  selectedCount,
  onToggleSelectionMode,
  onSelectAll,
  onCreateTest,
  contextLabel,
  isYearPaperView,
  lang,
  onLangChange,
  categoryLabels,
}: TopFilterBarProps) {
  const activeChips: ActiveChip[] = getFilterChips(filters, categoryLabels);

  function handleDismissChip(key: keyof QBFilterState, value?: string | number) {
    onFilterChange(removeFilterValue(filters, key, value));
  }

  function handleClearAll() {
    onFilterChange({});
  }

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        px: { xs: 0.75, sm: 1.5 },
        py: { xs: 0.75, sm: 1.5 },
      }}
    >
      {/* ── Row 1: Quick filter chips + Filters button + Language toggle ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Context label for year paper view */}
        {contextLabel && (
          <Chip
            label={contextLabel}
            size="small"
            sx={{
              flexShrink: 0,
              height: 30,
              fontWeight: 600,
              fontSize: '0.8125rem',
              bgcolor: PURPLE_ACCENT,
              color: '#fff',
              borderRadius: '15px',
            }}
          />
        )}

        {/* Quick-access filter chips */}
        {!isYearPaperView &&
          QUICK_CHIPS.map((chip) => {
            const active = isQuickChipActive(filters, chip);
            return (
              <Chip
                key={chip.filterKey}
                label={getQuickChipLabel(filters, chip)}
                size="small"
                variant={active ? 'filled' : 'outlined'}
                onClick={onOpenDrawer}
                sx={{
                  flexShrink: 0,
                  height: { xs: 26, sm: 30 },
                  fontSize: { xs: '0.675rem', sm: '0.75rem' },
                  fontWeight: 500,
                  borderRadius: '13px',
                  cursor: 'pointer',
                  ...(active
                    ? {
                        bgcolor: PURPLE_ACCENT,
                        color: '#fff',
                        '&:hover': { bgcolor: '#651fff' },
                      }
                    : {
                        borderColor: 'grey.300',
                        color: 'text.secondary',
                        '&:hover': { borderColor: PURPLE_ACCENT, color: PURPLE_ACCENT },
                      }),
                }}
              />
            );
          })}

        {/* Filters button with badge */}
        <Badge
          badgeContent={activeFilterCount}
          color="error"
          invisible={activeFilterCount === 0}
          sx={{
            flexShrink: 0,
            '& .MuiBadge-badge': { fontSize: '0.65rem', height: 16, minWidth: 16 },
          }}
        >
          <Chip
            icon={<FilterListIcon sx={{ fontSize: 16 }} />}
            label="Filters"
            size="small"
            variant="outlined"
            onClick={onOpenDrawer}
            sx={{
              height: { xs: 26, sm: 30 },
              fontSize: { xs: '0.675rem', sm: '0.75rem' },
              fontWeight: 600,
              borderRadius: '13px',
              borderColor: activeFilterCount > 0 ? PURPLE_ACCENT : 'grey.400',
              color: activeFilterCount > 0 ? PURPLE_ACCENT : 'text.secondary',
              cursor: 'pointer',
              '&:hover': { borderColor: PURPLE_ACCENT, color: PURPLE_ACCENT },
              '& .MuiChip-icon': { color: 'inherit' },
            }}
          />
        </Badge>

        {/* Spacer */}
        <Box sx={{ flexGrow: 1, minWidth: 8 }} />

        {/* Language toggle */}
        <ToggleButtonGroup
          value={lang}
          exclusive
          size="small"
          onChange={(_e, val) => {
            if (val) onLangChange(val as 'en' | 'hi');
          }}
          sx={{
            flexShrink: 0,
            height: 30,
            '& .MuiToggleButton-root': {
              px: 1,
              py: 0,
              fontSize: '0.7rem',
              fontWeight: 600,
              textTransform: 'none',
              borderColor: 'grey.300',
              '&.Mui-selected': {
                bgcolor: PURPLE_ACCENT,
                color: '#fff',
                borderColor: PURPLE_ACCENT,
                '&:hover': { bgcolor: '#651fff' },
              },
            },
          }}
        >
          <ToggleButton value="en">EN</ToggleButton>
          <ToggleButton value="hi">HI</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── Row 2 (conditional): Active filter chips ── */}
      {activeChips.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            mt: 1,
          }}
        >
          {activeChips.map((chip, idx) => (
            <Chip
              key={`${String(chip.key)}-${chip.value ?? idx}`}
              label={chip.label}
              size="small"
              deleteIcon={<CloseIcon sx={{ fontSize: 12 }} />}
              onDelete={() => handleDismissChip(chip.key, chip.value)}
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 500,
                borderRadius: '12px',
                bgcolor: ORANGE_BG,
                border: `1px solid ${ORANGE_BORDER}`,
                color: ORANGE_TEXT,
                '& .MuiChip-deleteIcon': {
                  color: ORANGE_TEXT,
                  fontSize: 12,
                  '&:hover': { color: '#bf360c' },
                },
              }}
            />
          ))}
          {activeChips.length > 1 && (
            <Chip
              label="Clear all"
              size="small"
              onClick={handleClearAll}
              sx={{
                height: 24,
                fontSize: '0.7rem',
                fontWeight: 500,
                borderRadius: '12px',
                bgcolor: 'transparent',
                border: '1px solid',
                borderColor: 'error.light',
                color: 'error.main',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'error.50' },
              }}
            />
          )}
        </Box>
      )}

      {/* ── Row 3: Results count + Selection controls ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mt: { xs: 0.5, sm: 1 },
          gap: 0.5,
        }}
      >
        {/* Result count */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
        >
          Showing{' '}
          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {filteredCount}
          </Box>{' '}
          of {totalCount} questions
        </Typography>

        {/* Selection controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {!selectionMode ? (
            <>
              <IconButton
                size="small"
                onClick={onToggleSelectionMode}
                sx={{
                  width: 28,
                  height: 28,
                  border: '1px solid',
                  borderColor: 'grey.300',
                  color: 'text.secondary',
                  '&:hover': { borderColor: PURPLE_ACCENT, color: PURPLE_ACCENT },
                  display: { xs: 'inline-flex', sm: 'none' },
                }}
              >
                <CheckBoxOutlineBlankIcon sx={{ fontSize: 16 }} />
              </IconButton>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CheckBoxOutlineBlankIcon sx={{ fontSize: 16 }} />}
                onClick={onToggleSelectionMode}
                sx={{
                  height: 28,
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  borderRadius: '14px',
                  borderColor: 'grey.300',
                  color: 'text.secondary',
                  '&:hover': { borderColor: PURPLE_ACCENT, color: PURPLE_ACCENT },
                  display: { xs: 'none', sm: 'inline-flex' },
                }}
              >
                Select
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 14, display: { xs: 'none', sm: 'inline-flex' } }} />}
                onClick={onCreateTest}
                sx={{
                  height: 28,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '14px',
                  bgcolor: PURPLE_ACCENT,
                  px: { xs: 1.5, sm: 2 },
                  minWidth: 'auto',
                  '&:hover': { bgcolor: '#651fff' },
                }}
              >
                <AddIcon sx={{ fontSize: 14, mr: 0.25, display: { sm: 'none' } }} />
                Test
              </Button>
            </>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: PURPLE_ACCENT,
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedCount} selected
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SelectAllIcon sx={{ fontSize: 16 }} />}
                onClick={onSelectAll}
                sx={{
                  height: 28,
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  borderRadius: '14px',
                  borderColor: 'grey.300',
                  color: 'text.secondary',
                  '&:hover': { borderColor: PURPLE_ACCENT, color: PURPLE_ACCENT },
                }}
              >
                Select All ({filteredCount})
              </Button>
              <IconButton
                size="small"
                onClick={onToggleSelectionMode}
                sx={{
                  width: 28,
                  height: 28,
                  color: 'text.secondary',
                  '&:hover': { color: 'error.main' },
                }}
              >
                <CancelIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                disabled={selectedCount === 0}
                onClick={onCreateTest}
                sx={{
                  height: 28,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '14px',
                  bgcolor: PURPLE_ACCENT,
                  '&:hover': { bgcolor: '#651fff' },
                  '&.Mui-disabled': { bgcolor: 'grey.200' },
                }}
              >
                Create Test
              </Button>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
