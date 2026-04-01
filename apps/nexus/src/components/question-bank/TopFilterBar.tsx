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
import type { QBFilterState } from '@neram/database';
import { QB_CATEGORY_LABELS, type QBCategory } from '@neram/database';

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
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ActiveChip {
  key: keyof QBFilterState;
  label: string;
  value?: string | number;
}

function getActiveChips(filters: QBFilterState): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (filters.exam_relevance) {
    chips.push({
      key: 'exam_relevance',
      label: filters.exam_relevance === 'NATA' ? 'NATA' : filters.exam_relevance === 'JEE' ? 'JEE' : 'Both Exams',
    });
  }

  if (filters.exam_type) {
    chips.push({ key: 'exam_type', label: filters.exam_type });
  }

  if (filters.exam_years?.length) {
    for (const y of filters.exam_years) {
      chips.push({ key: 'exam_years', label: `Year: ${y}`, value: y });
    }
  }

  if (filters.exam_sessions?.length) {
    for (const s of filters.exam_sessions) {
      chips.push({ key: 'exam_sessions', label: `Session: ${s}`, value: s });
    }
  }

  if (filters.categories?.length) {
    for (const c of filters.categories) {
      const label = QB_CATEGORY_LABELS[c as QBCategory] ?? c;
      chips.push({ key: 'categories', label, value: c });
    }
  }

  if (filters.difficulty?.length) {
    for (const d of filters.difficulty) {
      chips.push({
        key: 'difficulty',
        label: d.charAt(0) + d.slice(1).toLowerCase(),
        value: d,
      });
    }
  }

  if (filters.question_format?.length) {
    for (const f of filters.question_format) {
      const formatLabels: Record<string, string> = {
        MCQ: 'MCQ',
        NUMERICAL: 'Numerical',
        DRAWING_PROMPT: 'Drawing',
        IMAGE_BASED: 'Image Based',
      };
      chips.push({ key: 'question_format', label: formatLabels[f] ?? f, value: f });
    }
  }

  if (filters.attempt_status && filters.attempt_status !== 'all') {
    const statusLabels: Record<string, string> = {
      unattempted: 'Unattempted',
      correct: 'Correct',
      incorrect: 'Incorrect',
    };
    chips.push({
      key: 'attempt_status',
      label: statusLabels[filters.attempt_status] ?? filters.attempt_status,
    });
  }

  if (filters.solution_filter) {
    const solLabels: Record<string, string> = {
      has_video: 'Has Video',
      has_image: 'Has Image',
      has_explanation: 'Has Explanation',
      no_solution: 'No Solution',
    };
    chips.push({
      key: 'solution_filter',
      label: solLabels[filters.solution_filter] ?? filters.solution_filter,
    });
  }

  if (filters.search_text) {
    chips.push({ key: 'search_text', label: `"${filters.search_text}"` });
  }

  return chips;
}

function removeFilter(
  filters: QBFilterState,
  key: keyof QBFilterState,
  value?: string | number,
): QBFilterState {
  const next = { ...filters };

  // Array-valued filters: remove specific value
  if (value !== undefined) {
    if (key === 'exam_years' && next.exam_years) {
      next.exam_years = next.exam_years.filter((y) => y !== value);
      if (next.exam_years.length === 0) delete next.exam_years;
    } else if (key === 'exam_sessions' && next.exam_sessions) {
      next.exam_sessions = next.exam_sessions.filter((s) => s !== value);
      if (next.exam_sessions.length === 0) delete next.exam_sessions;
    } else if (key === 'categories' && next.categories) {
      next.categories = next.categories.filter((c) => c !== value);
      if (next.categories.length === 0) delete next.categories;
    } else if (key === 'difficulty' && next.difficulty) {
      next.difficulty = next.difficulty.filter((d) => d !== value) as typeof next.difficulty;
      if (next.difficulty.length === 0) delete next.difficulty;
    } else if (key === 'question_format' && next.question_format) {
      next.question_format = next.question_format.filter((f) => f !== value) as typeof next.question_format;
      if (next.question_format.length === 0) delete next.question_format;
    }
  } else {
    // Scalar-valued filters: clear entirely
    delete next[key];
  }

  return next;
}

// ─── Quick-access chip config ───────────────────────────────────────────────

interface QuickChip {
  label: string;
  filterKey: keyof QBFilterState;
}

const QUICK_CHIPS: QuickChip[] = [
  { label: 'Exam', filterKey: 'exam_relevance' },
  { label: 'Difficulty', filterKey: 'difficulty' },
  { label: 'Category', filterKey: 'categories' },
  { label: 'Format', filterKey: 'question_format' },
  { label: 'Status', filterKey: 'attempt_status' },
];

function getQuickChipLabel(filters: QBFilterState, chip: QuickChip): string {
  const val = filters[chip.filterKey];
  if (!val || (Array.isArray(val) && val.length === 0) || val === 'all') {
    return chip.label;
  }
  if (Array.isArray(val)) return `${chip.label} (${val.length})`;
  if (chip.filterKey === 'exam_relevance') {
    return val === 'BOTH' ? 'Both Exams' : String(val);
  }
  if (chip.filterKey === 'attempt_status') {
    return String(val).charAt(0).toUpperCase() + String(val).slice(1);
  }
  return String(val);
}

function isQuickChipActive(filters: QBFilterState, chip: QuickChip): boolean {
  const val = filters[chip.filterKey];
  if (!val) return false;
  if (Array.isArray(val) && val.length === 0) return false;
  if (val === 'all') return false;
  return true;
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
}: TopFilterBarProps) {
  const activeChips = getActiveChips(filters);

  function handleDismissChip(key: keyof QBFilterState, value?: string | number) {
    onFilterChange(removeFilter(filters, key, value));
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
        px: 1.5,
        py: 1.5,
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
                  height: 30,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  borderRadius: '15px',
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
              height: 30,
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '15px',
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
          mt: 1,
          gap: 1,
          flexWrap: 'wrap',
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
              <Button
                size="small"
                variant="outlined"
                startIcon={<CheckBoxOutlineBlankIcon sx={{ fontSize: 16 }} />}
                onClick={onToggleSelectionMode}
                sx={{
                  height: 30,
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  textTransform: 'none',
                  borderRadius: '15px',
                  borderColor: 'grey.300',
                  color: 'text.secondary',
                  '&:hover': { borderColor: PURPLE_ACCENT, color: PURPLE_ACCENT },
                }}
              >
                Select
              </Button>
              <Button
                size="small"
                variant="contained"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={onCreateTest}
                sx={{
                  height: 30,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '15px',
                  bgcolor: PURPLE_ACCENT,
                  '&:hover': { bgcolor: '#651fff' },
                }}
              >
                Create Test
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
