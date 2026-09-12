'use client';

import { useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@neram/ui';
import TuneIcon from '@mui/icons-material/Tune';
import {
  ACCOUNT_FILTER_LABEL,
  DEFAULT_FILTERS,
  FORM_FILTER_LABEL,
  SIGN_IN_FILTER_LABEL,
  activeFilterCount,
  type AccountFilter,
  type FormFilter,
  type RosterFilters,
  type SignInFilter,
} from '@/lib/student-roster-view';
import type { StudentBatch } from './studentRow.types';

export const DEFAULT_EXAM_BATCH_FILTER = 'current';

export interface RosterFilterState {
  filters: RosterFilters;
  examBatchFilter: string;
  batchFilter: string | null;
}

export interface StudentFilterSheetProps extends RosterFilterState {
  onFiltersChange: (filters: RosterFilters) => void;
  onExamBatchFilterChange: (value: string) => void;
  onBatchFilterChange: (value: string | null) => void;
  examBatches: { code: string }[];
  /** The Not set and Dormant views always show every exam year. */
  examYearLocked: boolean;
  batches: StudentBatch[];
}

/** How many facets narrow the list, the exam year and the section included. */
export function narrowingCount({ filters, examBatchFilter, batchFilter }: RosterFilterState): number {
  return (
    activeFilterCount(filters) +
    (examBatchFilter !== DEFAULT_EXAM_BATCH_FILTER ? 1 : 0) +
    (batchFilter ? 1 : 0)
  );
}

function examYearChipLabel(value: string): string {
  if (value === 'all') return 'All exam years';
  if (value === 'none') return 'No exam year';
  return `Exam year ${value}`;
}

/**
 * Every way to narrow the roster, in one bottom sheet.
 *
 * Choices apply the moment they are made, so there is no "Apply" to forget on a
 * phone. The exam year and section moved in here from the toolbar, where they cost
 * two rows of a 375px screen that the list needs more.
 */
export default function StudentFilterSheet(props: StudentFilterSheetProps) {
  const {
    filters,
    examBatchFilter,
    batchFilter,
    onFiltersChange,
    onExamBatchFilterChange,
    onBatchFilterChange,
    examBatches,
    examYearLocked,
    batches,
  } = props;
  const [open, setOpen] = useState(false);
  const count = narrowingCount(props);

  const clearAll = () => {
    onFiltersChange({ ...DEFAULT_FILTERS });
    onExamBatchFilterChange(DEFAULT_EXAM_BATCH_FILTER);
    onBatchFilterChange(null);
  };

  const sections: Array<{ id: string | null; name: string }> = [
    { id: null, name: 'All sections' },
    ...batches.map((b) => ({ id: b.id, name: b.name })),
    { id: 'unassigned', name: 'Unassigned' },
  ];

  return (
    <>
      <Badge badgeContent={count} color="primary" invisible={count === 0} sx={{ flexShrink: 0 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<TuneIcon />}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: 2, bgcolor: 'background.paper' }}
        >
          Filters
        </Button>
      </Badge>

      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          role: 'dialog',
          'aria-labelledby': 'student-filters-title',
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '88dvh',
            width: '100%',
            maxWidth: 640,
            mx: 'auto',
          },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
          <Typography id="student-filters-title" sx={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Filter students
          </Typography>

          <TextField
            select
            label="Exam year"
            value={examBatchFilter}
            onChange={(e) => onExamBatchFilterChange(e.target.value)}
            disabled={examYearLocked}
            helperText={examYearLocked ? 'Not set and Dormant always show every exam year.' : undefined}
            sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
          >
            <MenuItem value="current">Current + upcoming</MenuItem>
            <MenuItem value="all">All with access</MenuItem>
            {examBatches.map((b) => (
              <MenuItem key={b.code} value={b.code}>
                {b.code}
              </MenuItem>
            ))}
            <MenuItem value="none">No exam year set</MenuItem>
          </TextField>

          {batches.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Section
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {sections.map((section) => (
                  <Chip
                    key={section.id ?? 'all'}
                    label={section.name}
                    clickable
                    onClick={() => onBatchFilterChange(section.id)}
                    color={batchFilter === section.id ? 'primary' : 'default'}
                    variant={batchFilter === section.id ? 'filled' : 'outlined'}
                    sx={{ height: 40 }}
                  />
                ))}
              </Box>
            </Box>
          )}

          <Divider />

          <FilterRadios<SignInFilter>
            title="Sign-in"
            name="sign-in"
            value={filters.signIn}
            labels={SIGN_IN_FILTER_LABEL}
            onChange={(signIn) => onFiltersChange({ ...filters, signIn })}
          />
          <FilterRadios<AccountFilter>
            title="Account"
            name="account"
            value={filters.account}
            labels={ACCOUNT_FILTER_LABEL}
            onChange={(account) => onFiltersChange({ ...filters, account })}
          />
          <FilterRadios<FormFilter>
            title="Application form"
            name="application-form"
            value={filters.form}
            labels={FORM_FILTER_LABEL}
            onChange={(form) => onFiltersChange({ ...filters, form })}
          />
        </Box>

        <Box
          sx={{
            p: 2,
            pt: 1,
            display: 'flex',
            gap: 1,
            borderTop: 1,
            borderColor: 'divider',
            pb: 'calc(16px + env(safe-area-inset-bottom))',
          }}
        >
          <Button onClick={clearAll} disabled={count === 0} sx={{ minHeight: 48, flex: 1 }}>
            Clear all
          </Button>
          <Button variant="contained" onClick={() => setOpen(false)} sx={{ minHeight: 48, flex: 2, fontWeight: 700 }}>
            Done
          </Button>
        </Box>
      </Drawer>
    </>
  );
}

function FilterRadios<T extends string>({
  title,
  name,
  value,
  labels,
  onChange,
}: {
  title: string;
  name: string;
  value: T;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Box component="fieldset" sx={{ border: 0, p: 0, m: 0 }}>
      <Typography component="legend" variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {title}
      </Typography>
      <RadioGroup name={name} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {(Object.keys(labels) as T[]).map((key) => (
          <FormControlLabel
            key={key}
            value={key}
            control={<Radio />}
            label={labels[key]}
            sx={{ minHeight: 44, mr: 0 }}
          />
        ))}
      </RadioGroup>
    </Box>
  );
}

/** Removable chips for whatever narrows the list, so no filter is ever invisible. */
export function ActiveFilterChips(props: Omit<StudentFilterSheetProps, 'examBatches' | 'examYearLocked'>) {
  const {
    filters,
    examBatchFilter,
    batchFilter,
    onFiltersChange,
    onExamBatchFilterChange,
    onBatchFilterChange,
    batches,
  } = props;

  const chips: Array<{ key: string; label: string; onDelete: () => void }> = [];
  if (examBatchFilter !== DEFAULT_EXAM_BATCH_FILTER) {
    chips.push({
      key: 'exam',
      label: examYearChipLabel(examBatchFilter),
      onDelete: () => onExamBatchFilterChange(DEFAULT_EXAM_BATCH_FILTER),
    });
  }
  if (batchFilter) {
    chips.push({
      key: 'section',
      label:
        batchFilter === 'unassigned'
          ? 'Unassigned section'
          : batches.find((b) => b.id === batchFilter)?.name ?? 'Section',
      onDelete: () => onBatchFilterChange(null),
    });
  }
  if (filters.signIn !== 'any') {
    chips.push({
      key: 'sign-in',
      label: SIGN_IN_FILTER_LABEL[filters.signIn],
      onDelete: () => onFiltersChange({ ...filters, signIn: 'any' }),
    });
  }
  if (filters.account !== 'any') {
    chips.push({
      key: 'account',
      label: ACCOUNT_FILTER_LABEL[filters.account],
      onDelete: () => onFiltersChange({ ...filters, account: 'any' }),
    });
  }
  if (filters.form !== 'any') {
    chips.push({
      key: 'form',
      label: FORM_FILTER_LABEL[filters.form],
      onDelete: () => onFiltersChange({ ...filters, form: 'any' }),
    });
  }

  if (!chips.length) return null;

  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          onDelete={chip.onDelete}
          color="primary"
          variant="outlined"
          sx={{ height: 40, fontWeight: 600 }}
        />
      ))}
    </Box>
  );
}
