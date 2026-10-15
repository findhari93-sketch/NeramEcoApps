'use client';

import { Box, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';
import { INTEREST_LABELS, firstFollowUpAt, type InterestLevel } from '@neram/database/demo-follow-up';
import { istDateKey } from '@neram/database/demo-schedule';

export interface AttendedValue {
  interest: InterestLevel | null;
  note: string;
  nextDate: string;
  nextTime: string;
}

export function defaultAttendedValue(now = new Date()): AttendedValue {
  return { interest: null, note: '', nextDate: istDateKey(firstFollowUpAt(now)), nextTime: '11:00' };
}

/** How the demo went and when to call next. */
export default function AttendedFields({ value, onChange }: { value: AttendedValue; onChange: (v: AttendedValue) => void }) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box>
        <Typography variant="body2" id="interest-label" sx={{ mb: 1 }}>
          How interested are they?
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={value.interest}
          onChange={(_, v) => v && onChange({ ...value, interest: v })}
          aria-labelledby="interest-label"
          sx={{ gap: 1, '& .MuiToggleButton-root': { minHeight: 44, px: 3, border: 1, borderColor: 'divider', borderRadius: '8px !important', textTransform: 'none', '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } } }}
        >
          {(Object.keys(INTEREST_LABELS) as InterestLevel[]).map((k) => (
            <ToggleButton key={k} value={k}>
              {INTEREST_LABELS[k]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <TextField
        label="What they said"
        value={value.note}
        onChange={(e) => onChange({ ...value, note: e.target.value })}
        placeholder="e.g. Liked the class, discussing fees with parents"
        multiline
        minRows={2}
        inputProps={{ maxLength: 1000 }}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField
          label="First follow-up"
          type="date"
          value={value.nextDate}
          onChange={(e) => onChange({ ...value, nextDate: e.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: istDateKey(new Date()) }}
          required
        />
        <TextField
          label="Time (India)"
          type="time"
          value={value.nextTime}
          onChange={(e) => onChange({ ...value, nextTime: e.target.value })}
          InputLabelProps={{ shrink: true }}
          required
        />
      </Box>
    </Box>
  );
}
