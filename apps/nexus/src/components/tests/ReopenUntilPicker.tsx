'use client';

/**
 * When a reopened test closes, picked as a day.
 *
 * The founder asked for days, not times ("till tomorrow, one day or two days"),
 * so the choices are days and every one ends at 11:59 PM IST. The resolved line
 * underneath says exactly what the student will be told.
 */

import { useMemo } from 'react';
import { Box, Chip, TextField, Typography } from '@neram/ui';
import {
  MAX_REOPEN_DAYS,
  REOPEN_PRESETS,
  REOPEN_PRESET_LABELS,
  endOfIstDay,
  formatReopenUntil,
  istDatePlusDays,
  presetDate,
  type ReopenPreset,
} from '@/lib/reopen-deadline';

interface Props {
  /** The close as an ISO instant, always the end of an IST day. */
  value: string;
  onChange: (iso: string) => void;
}

/** The IST calendar date an end-of-day instant belongs to. */
function istDateOf(iso: string): string {
  // 11:59:59 PM IST is 18:29:59 UTC the same day, so shifting by the IST offset
  // and reading the UTC date is exact for every value this picker produces.
  const shifted = new Date(Date.parse(iso) + 5.5 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

export default function ReopenUntilPicker({ value, onChange }: Props) {
  const chosenDate = useMemo(() => istDateOf(value), [value]);
  const activePreset = useMemo(
    () => REOPEN_PRESETS.find((p) => presetDate(p) === chosenDate) ?? null,
    [chosenDate],
  );

  const chipSx = { minHeight: 44, px: 0.75, fontSize: 15, fontWeight: 600 };

  return (
    <Box>
      <Box role="group" aria-label="Open until" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        {REOPEN_PRESETS.map((preset: ReopenPreset) => {
          const active = preset === activePreset;
          return (
            <Chip
              key={preset}
              label={REOPEN_PRESET_LABELS[preset]}
              clickable
              color={active ? 'primary' : 'default'}
              variant={active ? 'filled' : 'outlined'}
              aria-pressed={active}
              onClick={() => onChange(endOfIstDay(presetDate(preset)))}
              sx={chipSx}
            />
          );
        })}
      </Box>

      <TextField
        type="date"
        label="Or pick a date"
        value={chosenDate}
        onChange={(e) => {
          if (e.target.value) onChange(endOfIstDay(e.target.value));
        }}
        size="small"
        InputLabelProps={{ shrink: true }}
        inputProps={{ min: istDatePlusDays(0), max: istDatePlusDays(MAX_REOPEN_DAYS - 1) }}
        InputProps={{ sx: { minHeight: 44, fontSize: 16 } }}
        sx={{ width: { xs: '100%', sm: 220 } }}
      />

      <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
        Open until {formatReopenUntil(value)}
      </Typography>
    </Box>
  );
}
