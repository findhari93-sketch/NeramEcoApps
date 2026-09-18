'use client';

import { useCallback, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Skeleton,
  TextField,
  Typography,
} from '@neram/ui';
import { EmptyNote } from './FieldGrid';
import ProfileSection from './ProfileSection';
import { RSVP_REASONS, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { covers, describeWindow, formatDay, type AwayWindow } from '@/lib/away-windows';

/**
 * Days this student has told us they cannot attend, and the place a teacher
 * records the ones they were told on the phone.
 *
 * This half of the feature exists because the students most likely to disappear
 * are the least likely to open an app and declare anything. A parent rings to
 * say their daughter has board exams for three weeks; without this the teacher
 * has nowhere to put that, and the register spends three weeks reporting a
 * student who did tell somebody as having silently vanished.
 *
 * Recording is allowed to backdate, unlike the student's own route, because a
 * teacher writing down what they were told on Tuesday about last Monday is
 * recording history rather than rewriting their own record. Ending a window
 * early is deliberately NOT here: that is the student's own action, and a
 * teacher who wants a class not to count has the audited lever for exactly that,
 * excusing it.
 */

interface AwayResponse {
  today: string;
  windows: Array<AwayWindow & { summary: string }>;
}

export default function AwayWindowsSection({
  studentId,
  studentName,
  getToken,
  canRecord,
}: {
  studentId: string;
  studentName: string;
  getToken: () => Promise<string | null>;
  /** teach.attendance.mark. Without it the section is read only. */
  canRecord: boolean;
}) {
  const [data, setData] = useState<AwayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [openEnded, setOpenEnded] = useState(false);
  const [reasonCode, setReasonCode] = useState<RsvpReasonCode>('clash');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch(`/api/students/${studentId}/away-windows`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || 'Could not load away dates.');
      setData(body as AwayResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load away dates.');
    } finally {
      setLoading(false);
    }
  }, [getToken, studentId]);

  const reset = () => {
    setAdding(false);
    setStartsOn('');
    setEndsOn('');
    setOpenEnded(false);
    setReasonCode('clash');
    setNote('');
  };

  const save = async () => {
    setError(null);
    if (!startsOn) return setError('Pick the first day they are away.');
    if (!openEnded && !endsOn) return setError('Pick a return date, or tick that it is not known.');
    if (reasonCode === 'other' && !note.trim()) return setError('Add a short note.');
    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch(`/api/students/${studentId}/away-windows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          starts_on: startsOn,
          ends_on: openEnded ? null : endsOn,
          reason_code: reasonCode,
          reason_note: note.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'Could not save those dates.');
        return;
      }
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save those dates.');
    } finally {
      setBusy(false);
    }
  };

  const today = data?.today || '';
  const live = data?.windows.find((w) => covers(w, today)) || null;
  const headline = !data
    ? 'Days they told us they cannot attend'
    : live
      ? describeWindow(live, today)
      : data.windows.length
        ? `${data.windows.length} recorded, none active`
        : 'None recorded';

  return (
    <ProfileSection
      id="profile-away-dates"
      title="Away dates"
      headline={headline}
      onFirstOpen={load}
    >
      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !data && <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />}

      {data && data.windows.length === 0 && (
        <EmptyNote>
          {studentName.split(' ')[0]} has not told us about any away dates, and none have
          been recorded for them.
        </EmptyNote>
      )}

      {data && data.windows.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 2 }}>
          {data.windows.map((w) => (
            <Box
              key={w.id}
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                opacity: w.cancelled_at ? 0.7 : 1,
              }}
            >
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{w.summary}</Typography>
                {/* Who told us. A window a teacher typed in and one a student
                    declared are different facts, and the register shows both. */}
                <Chip
                  size="small"
                  label={w.source === 'teacher' ? 'Recorded by staff' : 'Told us themselves'}
                />
                {w.cancelled_at && (
                  <Chip size="small" label={`Ended ${formatDay(w.cancelled_at.slice(0, 10))}`} />
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {RSVP_REASONS.find((r) => r.code === w.reason_code)?.label || 'Reason given'}
                {w.reason_note ? `: ${w.reason_note}` : ''}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {data && canRecord && !adding && (
        <Button
          variant="outlined"
          onClick={() => setAdding(true)}
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 700, borderRadius: 2 }}
        >
          Record away dates
        </Button>
      )}

      {adding && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            <TextField
              type="date"
              label="First day away"
              value={startsOn}
              onChange={(e) => setStartsOn(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              type="date"
              label="Back on"
              value={endsOn}
              disabled={openEnded}
              onChange={(e) => setEndsOn(e.target.value)}
              inputProps={{ min: startsOn || undefined }}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Box>
          <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}>
            <Checkbox
              checked={openEnded}
              onChange={(e) => {
                setOpenEnded(e.target.checked);
                if (e.target.checked) setEndsOn('');
              }}
              sx={{ p: 1 }}
            />
            <Typography variant="body2">Return date not known</Typography>
          </Box>

          <Box role="radiogroup" aria-label="Reason" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {RSVP_REASONS.map((r) => (
              <Chip
                key={r.code}
                label={r.label}
                role="radio"
                aria-checked={reasonCode === r.code}
                onClick={() => setReasonCode(r.code)}
                color={reasonCode === r.code ? 'primary' : 'default'}
                variant={reasonCode === r.code ? 'filled' : 'outlined'}
                sx={{ minHeight: 44, fontWeight: 600, cursor: 'pointer' }}
              />
            ))}
          </Box>

          <TextField
            label={reasonCode === 'other' ? 'What did they say?' : 'Anything to add (optional)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />

          <Typography variant="caption" color="text.secondary">
            Every class in this period will read as &quot;Away&quot; on the register instead of
            an unexplained miss. It does not change their attendance percentage, and they
            still owe the catch-up work.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
            <Button
              onClick={reset}
              disabled={busy}
              sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={save}
              disabled={busy}
              startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', minHeight: 48, fontWeight: 700 }}
            >
              {busy ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        </Box>
      )}
    </ProfileSection>
  );
}
