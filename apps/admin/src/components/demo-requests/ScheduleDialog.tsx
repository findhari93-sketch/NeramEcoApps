'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from '@neram/ui';
import {
  defaultStartFor,
  formatDemoDateTime,
  formatDemoPreference,
  formatDemoTime,
  isOutsidePreference,
  istDateKey,
  istDateTime,
} from '@neram/database/demo-schedule';
import AvailabilityTimeline, { clashesFor, type Availability } from './AvailabilityTimeline';
import type { DemoRequest, DeskSettings } from './types';

export interface ScheduleSubmit {
  start: string;
  minutes: number;
  reason: string;
  teamUpns?: string[];
  tutorUpn?: string;
  organizerUpn?: string;
  conflictNote?: string;
  parentEmail?: string;
}

function istTime(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2.5, mb: 1 }}>
      {children}
    </Typography>
  );
}

/**
 * Confirm a requested demo (creates the Teams meeting) or move a confirmed one.
 * Times are India time whatever the laptop's timezone is. The tutor's Outlook
 * calendar is shown so the time suits the person teaching.
 */
export default function ScheduleDialog({
  open,
  mode,
  request,
  settings,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: 'confirm' | 'reschedule';
  request: DemoRequest;
  settings: DeskSettings;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (v: ScheduleSubmit) => void;
}) {
  const people = settings.hosts;
  const initial = useMemo(() => {
    const from =
      mode === 'reschedule' && request.scheduled_start
        ? new Date(request.scheduled_start)
        : defaultStartFor(request.preferred_date, request.preferred_window, settings.schedule);
    const d = from ?? new Date(Date.now() + 24 * 60 * 60_000);
    return { date: istDateKey(d), time: from ? istTime(d) : '18:00' };
  }, [mode, request, settings.schedule]);

  const initialTeam = mode === 'reschedule' && request.staff_upns?.length ? request.staff_upns : people.map((p) => p.upn);
  const initialTutor =
    (mode === 'reschedule' && request.tutor_upn) ||
    (settings.defaultTutorUpn && initialTeam.includes(settings.defaultTutorUpn) ? settings.defaultTutorUpn : initialTeam[0]) ||
    '';

  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [minutes, setMinutes] = useState(request.scheduled_minutes || settings.schedule.durationMinutes);
  const [team, setTeam] = useState<string[]>(initialTeam);
  const [tutorUpn, setTutorUpn] = useState(initialTutor);
  const [organizerUpn, setOrganizerUpn] = useState(request.organizer_upn || initialTutor);
  const [parentEmail, setParentEmail] = useState(request.parent_email || '');
  const [reason, setReason] = useState('');
  const [conflictNote, setConflictNote] = useState('');
  const [av, setAv] = useState<Availability | null>(null);

  useEffect(() => {
    if (open) {
      setDate(initial.date);
      setTime(initial.time);
      setReason('');
      setConflictNote('');
    }
  }, [open, initial]);

  // Keep tutor and organizer inside the chosen team.
  useEffect(() => {
    if (team.length && !team.includes(tutorUpn)) setTutorUpn(team[0]);
    if (team.length && !team.includes(organizerUpn)) setOrganizerUpn(team.includes(tutorUpn) ? tutorUpn : team[0]);
  }, [team, tutorUpn, organizerUpn]);

  const nameOf = (upn: string) => people.find((p) => p.upn === upn)?.name ?? upn;
  const start = date && /^\d{2}:\d{2}$/.test(time) ? istDateTime(date, time) : null;
  const outside =
    mode === 'confirm' && start
      ? isOutsidePreference(start, { date: request.preferred_date, window: request.preferred_window }, settings.schedule)
      : false;
  const reasonRequired = mode === 'reschedule' || outside;
  const inPast = start ? start.getTime() < Date.now() : false;
  const tutorClash = clashesFor(av, tutorUpn, start, minutes);
  const othersClashing = team.filter((u) => u !== tutorUpn && clashesFor(av, u, start, minutes).length);
  const otherDemo = av?.demos.find((d) => {
    if (!start || d.id === request.id) return false;
    const s = new Date(d.start).getTime();
    return s < start.getTime() + minutes * 60_000 && s + d.minutes * 60_000 > start.getTime();
  });
  const needsConflictNote = mode === 'confirm' && tutorClash.length > 0;
  const canSubmit =
    !!start &&
    !inPast &&
    (!reasonRequired || reason.trim().length > 2) &&
    (!needsConflictNote || conflictNote.trim().length > 2) &&
    (mode === 'reschedule' || (team.length > 0 && !!tutorUpn && !!organizerUpn));

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="schedule-title">
      <DialogTitle id="schedule-title">{mode === 'confirm' ? 'Confirm demo' : 'Move demo'}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary">
          {request.name} asked for <b>{formatDemoPreference(request.preferred_date, request.preferred_window, settings.schedule)}</b>.
          {mode === 'confirm'
            ? ' Confirming creates the Teams meeting on the organizer’s calendar, invites the team and the student’s Gmail, and sends the WhatsApp confirmation.'
            : ' Moving updates the same Teams meeting; everyone’s calendar gets the change and WhatsApp tells the student why.'}
        </Typography>

        {mode === 'confirm' && (
          <>
            <SectionLabel>Who is on this demo</SectionLabel>
            {people.length === 0 ? (
              <Alert severity="warning">Add the demo team in Demo settings first.</Alert>
            ) : (
              <>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {people.map((p) => (
                    <FormControlLabel
                      key={p.upn}
                      control={
                        <Checkbox
                          checked={team.includes(p.upn)}
                          onChange={(e) =>
                            setTeam(e.target.checked ? [...team, p.upn] : team.filter((u) => u !== p.upn))
                          }
                        />
                      }
                      label={p.name}
                      sx={{ minHeight: 44, mr: 2 }}
                    />
                  ))}
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
                  <TextField
                    select
                    label="Tutor (teaches the demo)"
                    value={team.includes(tutorUpn) ? tutorUpn : ''}
                    onChange={(e) => setTutorUpn(e.target.value)}
                    helperText="Students see this name"
                    disabled={!team.length}
                  >
                    {team.map((u) => (
                      <MenuItem key={u} value={u}>
                        {nameOf(u)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Organizer (whose calendar)"
                    value={team.includes(organizerUpn) ? organizerUpn : ''}
                    onChange={(e) => setOrganizerUpn(e.target.value)}
                    helperText="The meeting lives on this calendar"
                    disabled={!team.length}
                  >
                    {team.map((u) => (
                      <MenuItem key={u} value={u}>
                        {nameOf(u)}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>
              </>
            )}
          </>
        )}

        <SectionLabel>When</SectionLabel>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
          <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} required />
          <TextField
            label="Time (India)"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ step: 300 }}
            required
          />
          <TextField select label="Length" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[30, 45, 60, 90].map((m) => (
              <MenuItem key={m} value={m}>
                {m} min
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box sx={{ mt: 2 }}>
          <AvailabilityTimeline
            date={date}
            team={mode === 'confirm' ? team : request.staff_upns?.length ? request.staff_upns : team}
            people={people}
            start={start}
            minutes={minutes}
            excludeId={request.id}
            onLoaded={setAv}
          />
        </Box>

        {start && (
          <Typography variant="body2" sx={{ mt: 1.5 }} role="status">
            {inPast ? (
              <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>
                That time has already passed.
              </Box>
            ) : (
              <>
                Demo: <b>{formatDemoDateTime(start)}</b>
                {mode === 'confirm' && tutorUpn ? ` with ${nameOf(tutorUpn)}` : ''}
              </>
            )}
          </Typography>
        )}

        {tutorClash.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {nameOf(tutorUpn || request.tutor_upn || '')} is busy then in Outlook (
            {tutorClash.map((b) => `${formatDemoTime(new Date(b.start))} to ${formatDemoTime(new Date(b.end))}`).join(', ')}).
            {mode === 'confirm' ? ' Pick another time, or add a note below.' : ''}
          </Alert>
        )}
        {othersClashing.length > 0 && (
          <Alert severity="info" sx={{ mt: 1 }}>
            {othersClashing.map(nameOf).join(', ')} {othersClashing.length > 1 ? 'are' : 'is'} busy then. They will still be invited.
          </Alert>
        )}
        {otherDemo && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Overlaps another confirmed demo ({otherDemo.name}, {formatDemoTime(new Date(otherDemo.start))}).
          </Alert>
        )}
        {needsConflictNote && (
          <TextField
            label="Internal note: why this time still works"
            value={conflictNote}
            onChange={(e) => setConflictNote(e.target.value)}
            helperText="Goes in the activity log only, never to the student"
            fullWidth
            required
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 200 }}
          />
        )}

        {mode === 'confirm' && (
          <TextField
            label="Parent email (optional)"
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            helperText="Gets the calendar invite too"
            fullWidth
            sx={{ mt: 2 }}
          />
        )}

        {outside && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This is outside what they asked for. Add the reason; it goes in their WhatsApp message.
          </Alert>
        )}
        {reasonRequired && (
          <TextField
            label={mode === 'reschedule' ? 'Reason for the change (sent to the student)' : 'Reason for this time (sent to the student)'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={mode === 'reschedule' ? 'e.g. You asked for a later time' : 'e.g. As agreed on the call'}
            fullWidth
            required
            sx={{ mt: 2 }}
            inputProps={{ maxLength: 200 }}
          />
        )}

        {!request.email && mode === 'confirm' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            No email on this request, so only WhatsApp will carry the link.
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button
          variant="contained"
          disabled={!canSubmit || busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
          onClick={() =>
            start &&
            onSubmit({
              start: start.toISOString(),
              minutes,
              reason: reason.trim(),
              ...(mode === 'confirm'
                ? {
                    teamUpns: team,
                    tutorUpn,
                    organizerUpn,
                    conflictNote: conflictNote.trim() || undefined,
                    parentEmail: parentEmail.trim(),
                  }
                : {}),
            })
          }
        >
          {busy ? 'Saving' : mode === 'confirm' ? 'Confirm and send' : 'Move and notify'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
