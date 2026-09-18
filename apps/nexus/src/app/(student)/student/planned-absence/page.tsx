'use client';

/**
 * Days you have told us you will be away.
 *
 * Declaring is usually done from the class you are declining, which is where
 * students already are. This page is the other half: seeing what you told us,
 * changing it, and saying you are back early. A declaration you cannot take back
 * would keep explaining absences for weeks after you returned, and you would
 * have no way of knowing.
 *
 * It also takes declarations of its own, for the case the decline sheet cannot
 * reach: knowing in September that you are away all of December, with no class
 * in front of you to decline.
 *
 * Built at 375px first, one column throughout. There is never much on it.
 */

import { useState } from 'react';
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
  useTheme,
} from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { RSVP_REASONS, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { covers, describeWindow, formatDay, type AwayWindow } from '@/lib/away-windows';

interface AwayResponse {
  today: string;
  windows: Array<AwayWindow & { summary: string }>;
}

/** Which of the three lists a window belongs in, from today's point of view. */
function bucketOf(w: AwayWindow, today: string): 'now' | 'upcoming' | 'past' {
  if (w.cancelled_at) return 'past';
  if (covers(w, today)) return 'now';
  return today < w.starts_on ? 'upcoming' : 'past';
}

export default function PlannedAbsencePage() {
  const theme = useTheme();
  const { tokenReady, getToken } = useNexusAuthContext();
  const { data, isLoading, mutate } = useAuthSWR<AwayResponse>(
    tokenReady ? '/api/student/away-windows' : null,
  );

  const [adding, setAdding] = useState(false);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [openEnded, setOpenEnded] = useState(false);
  const [reasonCode, setReasonCode] = useState<RsvpReasonCode>('clash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = data?.today || '';
  const windows = data?.windows || [];
  const now = windows.filter((w) => bucketOf(w, today) === 'now');
  const upcoming = windows.filter((w) => bucketOf(w, today) === 'upcoming');
  const past = windows.filter((w) => bucketOf(w, today) === 'past');

  const authedFetch = async (url: string, init: RequestInit) => {
    const token = await getToken();
    if (!token) throw new Error('Please sign in again.');
    return fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    });
  };

  const resetForm = () => {
    setAdding(false);
    setStartsOn('');
    setEndsOn('');
    setOpenEnded(false);
    setReasonCode('clash');
    setNote('');
    setError(null);
  };

  const save = async () => {
    setError(null);
    if (!startsOn) return setError('Pick the first day you will be away.');
    if (!openEnded && !endsOn) return setError('Pick a return date, or tick that you do not know yet.');
    if (reasonCode === 'other' && !note.trim()) return setError('Add a short note so your teacher knows.');
    setBusy(true);
    try {
      const res = await authedFetch('/api/student/away-windows', {
        method: 'POST',
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
      resetForm();
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save those dates.');
    } finally {
      setBusy(false);
    }
  };

  const endEarly = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/student/away-windows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Could not change those dates.');
        return;
      }
      await mutate();
    } finally {
      setBusy(false);
    }
  };

  const row = (w: AwayResponse['windows'][number], canEnd: boolean) => (
    <Box
      key={w.id}
      sx={{
        p: 2,
        borderRadius: 2,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.5,
        alignItems: { xs: 'stretch', sm: 'center' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>
          {w.summary || describeWindow(w, today)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {RSVP_REASONS.find((r) => r.code === w.reason_code)?.label || 'Reason given'}
          {w.reason_note ? `: ${w.reason_note}` : ''}
          {w.source === 'teacher' ? ', recorded by your teacher' : ''}
        </Typography>
        {w.cancelled_at && (
          <Chip size="small" label={`Ended early on ${formatDay(w.cancelled_at.slice(0, 10))}`} sx={{ mt: 0.75 }} />
        )}
      </Box>
      {canEnd && (
        <Button
          onClick={() => endEarly(w.id)}
          disabled={busy}
          variant="outlined"
          sx={{ textTransform: 'none', minHeight: 48, fontWeight: 700, flexShrink: 0 }}
        >
          I am back
        </Button>
      )}
    </Box>
  );

  const section = (title: string, list: AwayResponse['windows'], canEnd: boolean) =>
    list.length > 0 && (
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: 'text.secondary',
            display: 'block',
            mb: 1,
          }}
        >
          {title}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {list.map((w) => row(w, canEnd))}
        </Box>
      </Box>
    );

  return (
    <Box>
      <PageHeader
        title="Away dates"
        subtitle="Days you have told us you cannot attend"
      />

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          {error}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="rectangular" height={88} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {data && (
        <>
          {section('Away now', now, true)}
          {section('Coming up', upcoming, true)}
          {section('Past', past, false)}

          {windows.length === 0 && !adding && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
              You have not told us about any away dates. If you know you will miss
              classes for a stretch, say so here and your teacher will see it
              against every class in that period.
            </Typography>
          )}

          {!adding ? (
            <Button
              variant="contained"
              onClick={() => setAdding(true)}
              sx={{ textTransform: 'none', minHeight: 48, fontWeight: 700, borderRadius: 2 }}
            >
              Tell us about away dates
            </Button>
          ) : (
            <Box
              component="section"
              aria-label="New away dates"
              sx={{
                p: 2,
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: 'background.paper',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <TextField
                type="date"
                label="First day away"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                // Forward looking only, matching the route. A class already
                // missed is explained on that class, not from here.
                inputProps={{ min: today }}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                type="date"
                label="Back on"
                value={endsOn}
                disabled={openEnded}
                onChange={(e) => setEndsOn(e.target.value)}
                inputProps={{ min: startsOn || today }}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}>
                <Checkbox
                  checked={openEnded}
                  onChange={(e) => {
                    setOpenEnded(e.target.checked);
                    if (e.target.checked) setEndsOn('');
                  }}
                  sx={{ p: 1 }}
                />
                <Typography variant="body2">I do not know when I will be back</Typography>
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
                label={reasonCode === 'other' ? 'What is happening?' : 'Anything to add (optional)'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                rows={2}
                fullWidth
              />

              <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
                <Button
                  onClick={resetForm}
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
        </>
      )}
    </Box>
  );
}
