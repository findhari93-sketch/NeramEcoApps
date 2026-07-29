'use client';

import { Box, Chip } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import type { QBFilterState } from '@neram/database';
import { QB_CATEGORY_LABELS, QB_CONFIDENCE_TIER_LABELS, type QBCategory } from '@neram/database';

interface FilterChipsProps {
  filters: QBFilterState;
  onRemove: (key: keyof QBFilterState, value?: string | number) => void;
  onClearAll: () => void;
  categoryLabels?: Record<string, string>;
}

export interface ActiveChip {
  key: keyof QBFilterState;
  label: string;
  value?: string | number;
}

const STATUS_LABELS: Record<string, string> = {
  unattempted: 'Unattempted',
  correct: 'Correct',
  incorrect: 'Incorrect',
};

const FORMAT_LABELS: Record<string, string> = {
  MCQ: 'MCQ',
  NUMERICAL: 'Numerical',
  DRAWING_PROMPT: 'Drawing',
  IMAGE_BASED: 'Image Based',
};

const SOLUTION_LABELS: Record<string, string> = {
  has_video: 'Has Video',
  has_image: 'Has Image',
  has_explanation: 'Has Explanation',
  no_solution: 'No Solution',
};

/**
 * The single source of truth for "what is currently filtered".
 *
 * Both the chip row and the filter-button badge read this, so they can never
 * disagree. TopFilterBar used to keep a parallel copy that had already drifted:
 * it knew about exam_type and solution_filter while this one did not, and
 * neither knew about topic_ids or confidence_tier, so the badge under-counted.
 *
 * `categoryLabels` resolves parent slugs such as coordinate_geometry, which are
 * deliberately not members of QBCategory and so are unknown to
 * QB_CATEGORY_LABELS. Pass the map from the subject tag tree.
 */
export function getFilterChips(
  filters: QBFilterState,
  categoryLabels?: Record<string, string>,
): ActiveChip[] {
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
      // A collapsed parent selection is ONE chip reading "Coordinate Geometry",
      // not seven. That falls out of keeping filter state collapsed.
      const label = categoryLabels?.[c] ?? QB_CATEGORY_LABELS[c as QBCategory] ?? c;
      chips.push({ key: 'categories', label, value: c });
    }
  }
  if (filters.topic_ids?.length) {
    // Topic names are not in filter state, so this is one clear-all chip.
    chips.push({ key: 'topic_ids', label: `Chapters (${filters.topic_ids.length})` });
  }
  if (filters.difficulty?.length) {
    for (const d of filters.difficulty) {
      chips.push({ key: 'difficulty', label: d.charAt(0) + d.slice(1).toLowerCase(), value: d });
    }
  }
  if (filters.question_format?.length) {
    for (const f of filters.question_format) {
      chips.push({ key: 'question_format', label: FORMAT_LABELS[f] ?? f, value: f });
    }
  }
  if (filters.confidence_tier?.length) {
    for (const t of filters.confidence_tier) {
      chips.push({ key: 'confidence_tier', label: QB_CONFIDENCE_TIER_LABELS[t] ?? `Tier ${t}`, value: t });
    }
  }
  if (filters.attempt_status && filters.attempt_status !== 'all') {
    chips.push({ key: 'attempt_status', label: STATUS_LABELS[filters.attempt_status] ?? filters.attempt_status });
  }
  if (filters.solution_filter) {
    chips.push({ key: 'solution_filter', label: SOLUTION_LABELS[filters.solution_filter] ?? filters.solution_filter });
  }
  if (filters.search_text) {
    chips.push({ key: 'search_text', label: `"${filters.search_text}"` });
  }

  return chips;
}

export function countActiveFilters(filters: QBFilterState): number {
  return getFilterChips(filters).length;
}

/** Drop one chip's contribution from the filter state. */
export function removeFilterValue(
  filters: QBFilterState,
  key: keyof QBFilterState,
  value?: string | number,
): QBFilterState {
  const next = { ...filters };

  if (value === undefined) {
    delete next[key];
    return next;
  }

  const current = next[key];
  if (Array.isArray(current)) {
    const remaining = (current as Array<string | number>).filter((v) => v !== value);
    if (remaining.length === 0) {
      delete next[key];
    } else {
      (next as Record<string, unknown>)[key] = remaining;
    }
  } else {
    delete next[key];
  }

  return next;
}

export default function FilterChips({ filters, onRemove, onClearAll, categoryLabels }: FilterChipsProps) {
  const chips = getFilterChips(filters, categoryLabels);

  if (chips.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 0.5,
        overflowX: 'auto',
        py: 1,
        '&::-webkit-scrollbar': { height: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 2 },
      }}
    >
      {chips.map((chip, idx) => (
        <Chip
          key={`${String(chip.key)}-${chip.value ?? idx}`}
          label={chip.label}
          size="small"
          onDelete={() => onRemove(chip.key, chip.value)}
          deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
          variant="outlined"
          color="primary"
          sx={{ flexShrink: 0, fontWeight: 500, fontSize: '0.75rem' }}
        />
      ))}
      {chips.length > 1 && (
        <Chip
          label="Clear all"
          size="small"
          onClick={onClearAll}
          variant="outlined"
          color="error"
          sx={{ flexShrink: 0, fontWeight: 500, fontSize: '0.75rem' }}
        />
      )}
    </Box>
  );
}
