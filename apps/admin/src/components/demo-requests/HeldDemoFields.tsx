'use client';

import {
  Box,
  Checkbox,
  FormControlLabel,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import { istDateKey, istDateTime } from '@neram/database/demo-schedule';
import { DEFAULT_HELD_TUTOR, STAFF_DEMO_PLATFORMS } from '@/lib/demo/staff-add';
import AttendedFields, { defaultAttendedValue, type AttendedValue } from './AttendedFields';

/** A demo held outside the desk: when, where, who took it, and how it went. */
export interface HeldValue {
  date: string;
  time: string;
  platform: string;
  joinUrl: string;
  tutorUpn: string;
  outcome: 'attended' | 'no_show';
  attended: AttendedValue;
  note: string;
  sendFollowUp: boolean;
}

function nowIstTime(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

export function defaultHeldValue(): HeldValue {
  return {
    date: istDateKey(new Date()),
    time: nowIstTime(),
    platform: 'google_meet',
    joinUrl: '',
    tutorUpn: DEFAULT_HELD_TUTOR.upn,
    outcome: 'attended',
    attended: defaultAttendedValue(),
    note: '',
    sendFollowUp: false,
  };
}

/** What the form still needs, plus the parsed times. */
export function checkHeld(v: HeldValue, now = new Date()) {
  const heldAt = v.date && /^\d{2}:\d{2}$/.test(v.time) ? istDateTime(v.date, v.time) : null;
  const inFuture = heldAt ? heldAt.getTime() > now.getTime() + 5 * 60_000 : false;
  const linkOk = !v.joinUrl.trim() || /^https:\/\/\S+\.\S+/.test(v.joinUrl.trim());
  const nextAt =
    v.attended.nextDate && /^\d{2}:\d{2}$/.test(v.attended.nextTime) ? istDateTime(v.attended.nextDate, v.attended.nextTime) : null;
  const followUpOk = v.outcome !== 'attended' || (!!v.attended.interest && !!nextAt && nextAt.getTime() > now.getTime());
  return { heldAt, inFuture, linkOk, nextAt, ok: !!heldAt && !inFuture && linkOk && !!v.tutorUpn && followUpOk };
}

/** The request body fields the server's parseHeldDemo reads. */
export function heldPayload(v: HeldValue): Record<string, unknown> {
  const { heldAt, nextAt } = checkHeld(v);
  return {
    heldAt: heldAt?.toISOString(),
    platform: v.platform,
    joinUrl: v.joinUrl.trim(),
    tutorUpn: v.tutorUpn,
    outcome: v.outcome,
    interest: v.outcome === 'attended' ? v.attended.interest : null,
    note: v.outcome === 'attended' ? v.attended.note.trim() : v.note.trim(),
    nextFollowUpAt: v.outcome === 'attended' ? nextAt?.toISOString() : undefined,
    sendFollowUp: v.sendFollowUp,
  };
}

export default function HeldDemoFields({
  value,
  onChange,
  tutors,
}: {
  value: HeldValue;
  onChange: (v: HeldValue) => void;
  tutors: Array<{ upn: string; name: string }>;
}) {
  const set = (patch: Partial<HeldValue>) => onChange({ ...value, ...patch });
  const { inFuture, linkOk } = checkHeld(value);
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <TextField
          label="Date"
          type="date"
          value={value.date}
          onChange={(e) => set({ date: e.target.value })}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: istDateKey(new Date()) }}
          required
        />
        <TextField
          label="Start time (India)"
          type="time"
          value={value.time}
          onChange={(e) => set({ time: e.target.value })}
          InputLabelProps={{ shrink: true }}
          error={inFuture}
          helperText={inFuture ? 'This is in the future. Confirm the demo instead.' : ' '}
          required
        />
        <TextField select label="Held on" value={value.platform} onChange={(e) => set({ platform: e.target.value })}>
          {STAFF_DEMO_PLATFORMS.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Who took it"
          value={value.tutorUpn}
          onChange={(e) => set({ tutorUpn: e.target.value })}
          required
        >
          {tutors.map((t) => (
            <MenuItem key={t.upn} value={t.upn}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <TextField
        label="Meeting link (optional)"
        value={value.joinUrl}
        onChange={(e) => set({ joinUrl: e.target.value })}
        error={!linkOk}
        helperText={linkOk ? 'For the record, for example the Google Meet link you shared' : 'Paste the full link, starting with https://'}
        type="url"
      />
      <Box>
        <Typography variant="body2" sx={{ mb: 1 }} id="held-outcome">
          Did they join?
        </Typography>
        <ToggleButtonGroup
          exclusive
          value={value.outcome}
          onChange={(_, v) => v && set({ outcome: v })}
          aria-labelledby="held-outcome"
          sx={{
            gap: 1,
            '& .MuiToggleButton-root': {
              minHeight: 44,
              px: 2.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: '8px !important',
              textTransform: 'none',
              '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            },
          }}
        >
          <ToggleButton value="attended">Attended</ToggleButton>
          <ToggleButton value="no_show">No-show</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {value.outcome === 'attended' ? (
        <AttendedFields value={value.attended} onChange={(attended) => set({ attended })} />
      ) : (
        <TextField
          label="Note (optional)"
          value={value.note}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="e.g. Did not pick up, will try next week"
          multiline
          minRows={2}
          inputProps={{ maxLength: 1000 }}
        />
      )}
      <FormControlLabel
        control={<Checkbox checked={value.sendFollowUp} onChange={(e) => set({ sendFollowUp: e.target.checked })} />}
        label={value.outcome === 'attended' ? 'Send the thank-you and feedback WhatsApp' : 'Send the "we missed you" WhatsApp'}
        sx={{ minHeight: 44 }}
      />
    </Box>
  );
}
