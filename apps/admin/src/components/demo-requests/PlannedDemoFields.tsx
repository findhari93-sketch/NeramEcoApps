'use client';

import { Box, FormControlLabel, MenuItem, Radio, RadioGroup, TextField, Typography } from '@neram/ui';
import { istDateKey, istDateTime } from '@neram/database/demo-schedule';
import { DEFAULT_HELD_TUTOR } from '@/lib/demo/staff-add';
import { MEETING_CHOICES, type MeetingChoice } from './ScheduleDialog';
import type { DemoHost } from './types';

/** A demo fixed on WhatsApp or a call: when, who takes it, how they meet. */
export interface PlannedValue {
  date: string;
  time: string;
  tutorUpn: string;
  meeting: MeetingChoice;
  joinUrl: string;
}

export function defaultPlannedValue(hosts: DemoHost[], defaultTutorUpn: string | null): PlannedValue {
  const upns = hosts.map((h) => h.upn.toLowerCase());
  const tutor = upns.includes(DEFAULT_HELD_TUTOR.upn) ? DEFAULT_HELD_TUTOR.upn : (defaultTutorUpn || upns[0] || '').toLowerCase();
  return {
    date: istDateKey(new Date(Date.now() + 24 * 60 * 60_000)),
    time: '17:00',
    tutorUpn: tutor,
    meeting: 'later',
    joinUrl: '',
  };
}

export function checkPlanned(v: PlannedValue, now = new Date()) {
  const start = v.date && /^\d{2}:\d{2}$/.test(v.time) ? istDateTime(v.date, v.time) : null;
  const inPast = start ? start.getTime() < now.getTime() : false;
  const linkOk = v.meeting !== 'own_link' || /^https:\/\/\S+\.\S+/.test(v.joinUrl.trim());
  return { start, inPast, linkOk, ok: !!start && !inPast && linkOk && !!v.tutorUpn };
}

export function plannedPayload(v: PlannedValue): Record<string, unknown> {
  return {
    start: checkPlanned(v).start?.toISOString(),
    tutorUpn: v.tutorUpn,
    meeting: v.meeting,
    ...(v.meeting === 'own_link' ? { joinUrl: v.joinUrl.trim() } : {}),
  };
}

export default function PlannedDemoFields({
  value,
  onChange,
  hosts,
}: {
  value: PlannedValue;
  onChange: (v: PlannedValue) => void;
  hosts: DemoHost[];
}) {
  const set = (patch: Partial<PlannedValue>) => onChange({ ...value, ...patch });
  const { inPast, linkOk } = checkPlanned(value);
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
        <TextField
          label="Date"
          type="date"
          value={value.date}
          onChange={(e) => set({ date: e.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: istDateKey(new Date()) }}
          required
        />
        <TextField
          label="Start time (India)"
          type="time"
          value={value.time}
          onChange={(e) => set({ time: e.target.value })}
          InputLabelProps={{ shrink: true }}
          error={inPast}
          helperText={inPast ? 'This time has passed. Use Demo already held.' : ' '}
          required
        />
        <TextField select label="Who takes it" value={value.tutorUpn} onChange={(e) => set({ tutorUpn: e.target.value })} required>
          {hosts.map((h) => (
            <MenuItem key={h.upn} value={h.upn.toLowerCase()}>
              {h.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <Box>
        <Typography variant="body2" id="planned-meeting" sx={{ mb: 0.5 }}>
          How will they join?
        </Typography>
        <RadioGroup row value={value.meeting} onChange={(e) => set({ meeting: e.target.value as MeetingChoice })} aria-labelledby="planned-meeting">
          {MEETING_CHOICES.map((m) => (
            <FormControlLabel key={m.id} value={m.id} control={<Radio />} label={m.label} sx={{ minHeight: 44, mr: 3 }} />
          ))}
        </RadioGroup>
        <Typography variant="body2" color="text.secondary">
          {value.meeting === 'teams'
            ? 'Creates the Teams meeting, emails the invite and sends the WhatsApp confirmation.'
            : value.meeting === 'later'
              ? 'Saved as scheduled. Add the link from the demo when you have it, then send it to the student.'
              : value.meeting === 'in_person'
                ? 'Saved as scheduled at the centre. Confirm the time with the student yourself.'
                : 'Nothing is sent to the student. Share the link yourself on WhatsApp.'}{' '}
          The team gets reminders either way.
        </Typography>
      </Box>
      {value.meeting === 'own_link' && (
        <TextField
          label="Meeting link"
          value={value.joinUrl}
          onChange={(e) => set({ joinUrl: e.target.value })}
          placeholder="https://meet.google.com/abc-defg-hij"
          error={!!value.joinUrl.trim() && !linkOk}
          helperText={value.joinUrl.trim() && !linkOk ? 'Paste the full link, starting with https://' : ' '}
          type="url"
          required
        />
      )}
    </Box>
  );
}
