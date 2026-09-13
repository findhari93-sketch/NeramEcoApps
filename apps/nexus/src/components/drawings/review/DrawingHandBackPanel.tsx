'use client';

/**
 * Handing drawing reviews back to a class, on the assignment page.
 *
 * Two things live here. The switch that decides whether Complete tells the
 * student at once (as it always has) or holds the review. And, once something
 * is held, the hand-back itself: a preflight that says what would block it and
 * what is only worth knowing, then the release, then the announcements in
 * chunks with progress the teacher can watch.
 *
 * Rolling, not a publish event. Late joiners keep submitting for weeks, so this
 * panel is meant to be used again and again: hand back what is ready today,
 * hand back the three late ones next Tuesday.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, FormControlLabel, LinearProgress, Paper, Switch, Typography,
} from '@neram/ui';
import AssignmentReturnOutlinedIcon from '@mui/icons-material/AssignmentReturnOutlined';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';

interface Preflight {
  assignment: { id: string; title: string; mode: 'immediate' | 'held' };
  counts: { held: number; complete: number; redo: number };
  summary: string;
  blockers: string[];
  warnings: string[];
  canRelease: boolean;
}

export interface DrawingHandBackPanelProps {
  assignmentId: string;
  /** The teacher token, so each student's card can land in their own Teams chat. */
  getToken: () => Promise<string | null>;
  /** Called after a hand-back so the roster can refresh its buckets. */
  onReleased?: () => void;
  /** Bump to re-read what is held, after something outside this panel held more. */
  refreshKey?: number;
}

type Phase = 'idle' | 'releasing' | 'notifying' | 'done' | 'error';

export default function DrawingHandBackPanel({ assignmentId, getToken, onReleased, refreshKey = 0 }: DrawingHandBackPanelProps) {
  const [pre, setPre] = useState<Preflight | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modeSaving, setModeSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ notified: number; total: number }>({ notified: 0, total: 0 });
  const [error, setError] = useState('');

  // getToken is a fresh function every render; see RubricScorePanel.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;

  const authed = useCallback(async (input: string, init?: RequestInit) => {
    const token = await tokenRef.current();
    return fetch(input, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  }, []);

  const loadPreflight = useCallback(async () => {
    try {
      const res = await authed(`/api/drawing/assignments/${assignmentId}/release`);
      if (res.status === 503) { setUnavailable(true); return; }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load');
      setPre(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the hand-back');
    } finally {
      setLoading(false);
    }
  }, [assignmentId, authed]);

  useEffect(() => { void loadPreflight(); }, [loadPreflight, refreshKey]);

  const setMode = async (held: boolean) => {
    setModeSaving(true);
    setError('');
    try {
      const res = await authed(`/api/drawing/assignments/${assignmentId}/release`, {
        method: 'PUT',
        body: JSON.stringify({ mode: held ? 'held' : 'immediate' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save');
      await loadPreflight();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the setting');
    } finally {
      setModeSaving(false);
    }
  };

  const handBack = async () => {
    setError('');
    setPhase('releasing');
    try {
      const res = await authed(`/api/drawing/assignments/${assignmentId}/release`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'all' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'The hand-back did not go through');

      // The records are written. Everything from here is announcing, and a
      // failure while announcing leaves the hand-back itself intact.
      setPhase('notifying');
      setProgress({ notified: 0, total: body.released ?? 0 });
      let remaining = 1;
      let notified = 0;
      let guard = 0;
      while (remaining > 0 && guard < 50) {
        guard += 1;
        const n = await authed(`/api/drawing/release-batches/${body.batch_id}/notify`, { method: 'POST' });
        const chunk = await n.json().catch(() => ({}));
        if (!n.ok) throw new Error(chunk.error || 'Some students may not have been told yet');
        notified += chunk.notified ?? 0;
        remaining = chunk.remaining ?? 0;
        setProgress({ notified, total: chunk.total ?? body.released ?? 0 });
      }

      setPhase('done');
      onReleased?.();
      await loadPreflight();
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'The hand-back did not finish');
      await loadPreflight();
    }
  };

  const closeSheet = () => {
    if (phase === 'releasing' || phase === 'notifying') return;
    setSheetOpen(false);
    setPhase('idle');
    setError('');
  };

  if (loading) return null;
  if (unavailable) return null;
  if (!pre) {
    return error ? <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert> : null;
  }

  const held = pre.assignment.mode === 'held';
  const busy = phase === 'releasing' || phase === 'notifying';

  return (
    <>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, borderRadius: 2 }}>
        <FormControlLabel
          sx={{ m: 0, alignItems: 'flex-start', width: '100%' }}
          control={
            <Switch
              checked={held}
              disabled={modeSaving}
              onChange={(e) => setMode(e.target.checked)}
              inputProps={{ 'aria-describedby': `handback-hint-${assignmentId}` }}
            />
          }
          label={
            <Box sx={{ pt: 0.75, pl: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Hold reviews until I hand them back
              </Typography>
              <Typography
                id={`handback-hint-${assignmentId}`}
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', lineHeight: 1.4 }}
              >
                {held
                  ? 'Complete and Redo finish a review without telling the student. Nobody hears until you hand them back.'
                  : 'Off: Complete and Redo tell the student straight away, as they always have.'}
              </Typography>
            </Box>
          }
        />

        {pre.counts.held > 0 && (
          <Box
            sx={{
              mt: 1.5, pt: 1.5, borderTop: '1px solid', borderColor: 'divider',
              display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {pre.counts.held} waiting to hand back
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {pre.counts.complete} complete, {pre.counts.redo} sent for redo
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<AssignmentReturnOutlinedIcon />}
              onClick={() => setSheetOpen(true)}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
            >
              Hand back
            </Button>
          </Box>
        )}
      </Paper>

      <ResponsiveSheet
        open={sheetOpen}
        onClose={closeSheet}
        disableClose={busy}
        title={phase === 'done' ? 'Handed back' : `Hand back ${pre.assignment.title}`}
        description={phase === 'idle' || phase === 'error' ? pre.summary : undefined}
        actions={
          phase === 'done' ? (
            <Button variant="contained" onClick={closeSheet} sx={{ minHeight: 48 }}>Done</Button>
          ) : (
            <>
              <Button onClick={closeSheet} disabled={busy} sx={{ minHeight: 48 }}>Not yet</Button>
              <Button
                variant="contained"
                onClick={handBack}
                disabled={busy || !pre.canRelease}
                startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
                sx={{ minHeight: 48, fontWeight: 700 }}
              >
                {busy ? 'Handing back' : `Hand back ${pre.counts.held}`}
              </Button>
            </>
          )
        }
      >
        <Box sx={{ px: { xs: 2, sm: 3 }, pb: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {phase === 'notifying' && (
            <Box role="status" aria-live="polite">
              <Typography variant="body2" sx={{ mb: 0.75 }}>
                Telling students: {progress.notified} of {progress.total}
              </Typography>
              <LinearProgress
                variant={progress.total ? 'determinate' : 'indeterminate'}
                value={progress.total ? (progress.notified / progress.total) * 100 : 0}
              />
            </Box>
          )}

          {phase === 'done' && (
            <Alert severity="success">
              {progress.notified} {progress.notified === 1 ? 'student has' : 'students have'} been told.
              Anyone who submits late can be handed back the same way later.
            </Alert>
          )}

          {(phase === 'idle' || phase === 'error') && (
            <>
              {pre.blockers.map((b) => (
                <Alert key={b} severity="error">{b}</Alert>
              ))}
              {pre.warnings.map((w) => (
                <Alert key={w} severity="info">{w}</Alert>
              ))}
            </>
          )}

          {error && <Alert severity="warning">{error}</Alert>}
        </Box>
      </ResponsiveSheet>
    </>
  );
}
