'use client';

import { Box, Chip } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import type { QBFilterState } from '@neram/database';
import { QB_CATEGORY_LABELS, type QBCategory } from '@neram/database';

interface FilterChipsProps {
  filters: QBFilterState;
  onRemove: (key: keyof QBFilterState, value?: string | number) => void;
  onClearAll: () => void;
}

function getFilterChips(filters: QBFilterState): { key: keyof QBFilterState; label: string; value?: string | number }[] {
  const chips: { key: keyof QBFilterState; label: string; value?: string | number }[] = [];

  if (filters.exam_relevance) {
    chips.push({
      key: 'exam_relevance',
      label: filters.exam_relevance === 'NATA' ? 'NATA' : filters.exam_relevance === 'JEE_PAPER_2' ? 'JEE' : 'Both',
    });
  }
  if (filters.exam_years?.length) {
    for (const y of filters.exam_years) {
      chips.push({ key: 'exam_years', label: `Year: ${y}`, value: y });
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
      chips.push({ key: 'difficulty', label: d.charAt(0) + d.slice(1).toLowerCase(), value: d });
    }
  }
  if (filters.attempt_status && filters.attempt_status !== 'all') {
    const statusLabels: Record<string, string> = {
      unattempted: 'Unattempted',
      correct: 'Correct',
      incorrect: 'Incorrect',
    };
    chips.push({ key: 'attempt_status', label: statusLabels[filters.attempt_status] || filters.attempt_status });
  }
  if (filters.search_text) {
    chips.push({ key: 'search_text', label: `"${filters.search_text}"` });
  }
  if (filters.question_format?.length) {
    for (const f of filters.question_format) {
      chips.push({ key: 'question_format', label: f === 'MCQ' ? 'MCQ' : f === 'NUMERICAL' ? 'Numerical' : 'MSQ', value: f });
    }
  }

  return chips;
}

export function countActiveFilters(filters: QBFilterState): number {
  return getFilterChips(filters).length;
}

export default function FilterChips({ filters, onRemove, onClearAll }: FilterChipsProps) {
  const chips = getFilterChips(filters);

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
