'use client';

/**
 * Shared exam-year batch selector. The core of the "default to current batch,
 * older batches behind a selector" rule. Reads batches from BatchContext.
 *
 * value is one of: 'current' | 'all' | 'none' | a 'YYYY-YY' code. The API layer
 * resolves 'current' to the registry current batch, so pages can pass the value
 * straight through as ?batch=.
 *
 * Wording is "Exam Batch" (never bare "batch") to stay clear of the course-class
 * `batches` and the Nexus classroom `nexus_batches` concepts.
 */

import { Box, TextField, MenuItem } from '@neram/ui';
import { useBatches } from '@/contexts/BatchContext';

const MUTED = '#6b7280';

interface BatchSelectorProps {
  value: string;
  onChange: (v: string) => void;
  /** Show a count on the "No batch set" option (the needs-batch worklist). */
  needsScope?: 'lead' | 'student' | null;
  size?: 'small' | 'medium';
  minWidth?: number;
}

export default function BatchSelector({
  value,
  onChange,
  needsScope = null,
  size = 'small',
  minWidth = 230,
}: BatchSelectorProps) {
  const { current, batches, needsAssignment } = useBatches();
  const currentCode = current?.code || '';
  const noneCount = needsScope ? needsAssignment[needsScope] : 0;

  const label = (v: string) => {
    if (v === 'current') return `Current batch${currentCode ? ` (${currentCode})` : ''}`;
    if (v === 'all') return 'All batches';
    if (v === 'none') return 'No batch set';
    return v;
  };

  return (
    <TextField
      select
      size={size}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth, bgcolor: 'background.paper' }}
      SelectProps={{
        renderValue: (v: unknown) => (
          <Box component="span" sx={{ fontSize: 14 }}>
            <Box component="span" sx={{ color: MUTED, fontWeight: 600 }}>
              Exam Batch:
            </Box>{' '}
            {label(v as string)}
          </Box>
        ),
      }}
    >
      <MenuItem value="current">
        Current batch{currentCode ? ` (${currentCode})` : ''}
      </MenuItem>
      {batches.map((b) => (
        <MenuItem key={b.code} value={b.code}>
          {b.code}
          {b.status === 'closed' ? ' (closed)' : ''}
        </MenuItem>
      ))}
      <MenuItem value="none">No batch set{noneCount ? ` (${noneCount})` : ''}</MenuItem>
      <MenuItem value="all">All batches</MenuItem>
    </TextField>
  );
}
