'use client';

import { useCallback, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Skeleton, TextField, Typography } from '@neram/ui';
import { EmptyNote } from './FieldGrid';
import ProfileSection from './ProfileSection';
import { formatDay, todayIst } from '@/lib/assistant/format';

/**
 * Why this student does or does not get AI answers, and the teacher's lever.
 *
 * The status line is the route's own sentence, so a teacher reads the same
 * reason the system acted on. Always on / Always off need a written reason so
 * the next teacher knows why; setting one replaces the active override.
 */

const MAX_REASON = 200;

interface AiView {
  on: boolean;
  line: string;
  override: {
    mode: 'on' | 'off';
    reason: string;
    ends_on: string | null;
    set_at: string;
    set_by_name: string | null;
  } | null;
}

export default function AiAnswersSection({
  studentId,
  getToken,
}: {
  studentId: string;
  getToken: () => Promise<string | null>;
}) {
  const [view, setView] = useState<AiView | null>(null);
  const [loading, setLoading] = useState(false);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'on' | 'off' | null>(null);
  const [reason, setReason] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const call = useCallback(
    async (method: 'GET' | 'POST' | 'DELETE', body?: unknown) => {
      const token = await getToken();
      if (!token) throw new Error('Please sign in again.');
      const res = await fetch(`/api/students/${studentId}/ai-access`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 404) {
        setOff(true);
        setView(null);
        return null;
      }
      if (!res.ok) throw new Error(data?.error || 'Something went wrong.');
      return data as AiView;
    },
    [getToken, studentId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const v = await call('GET');
      if (v) setView(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load AI answers.');
    } finally {
      setLoading(false);
    }
  }, [call]);

  const cancel = () => {
    setMode(null);
    setReason('');
    setEndsOn('');
  };

  const run = async (method: 'POST' | 'DELETE', body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const v = await call(method, body);
      if (v) {
        setView(v);
        cancel();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const o = view?.override ?? null;
  const headline = off ? 'Switched off' : view ? view.line : 'Whether this student gets AI answers';
  const button = { textTransform: 'none', minHeight: 48, fontWeight: 700, borderRadius: 2 } as const;

  return (
    <ProfileSection id="profile-ai-answers" title="AI answers" headline={headline} onFirstOpen={load}>
      {error && (
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && !view && !off && <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />}

      {off && <EmptyNote>Neram Assistant is switched off, so there is nothing to manage here.</EmptyNote>}

      {view && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography>{view.line}</Typography>
          {o && (
            <Typography variant="body2" color="text.secondary">
              Set by {o.set_by_name || 'a teacher'} on {formatDay(o.set_at.slice(0, 10))}
              {o.ends_on ? `, until ${formatDay(o.ends_on)}` : ''}: {o.reason}
            </Typography>
          )}

          {!mode && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
              <Button variant="outlined" disabled={busy} onClick={() => setMode('on')} sx={button}>
                Always on
              </Button>
              <Button variant="outlined" disabled={busy} onClick={() => setMode('off')} sx={button}>
                Always off
              </Button>
              {o && (
                <Button
                  disabled={busy}
                  onClick={() => run('DELETE')}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                  sx={{ ...button, fontWeight: 600 }}
                >
                  Clear override
                </Button>
              )}
            </Box>
          )}

          {mode && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {mode === 'on' ? 'Keep AI answers on' : 'Keep AI answers off'}
              </Typography>
              <TextField
                label="Reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                inputProps={{ maxLength: MAX_REASON }}
                helperText={`${reason.length}/${MAX_REASON}`}
                fullWidth
              />
              <TextField
                type="date"
                label="Until (optional)"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                inputProps={{ min: todayIst(new Date()) }}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
                <Button onClick={cancel} disabled={busy} sx={{ ...button, fontWeight: 600 }}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  disabled={busy || !reason.trim()}
                  onClick={() => run('POST', { mode, reason: reason.trim(), ends_on: endsOn || null })}
                  startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                  sx={button}
                >
                  Save
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </ProfileSection>
  );
}
