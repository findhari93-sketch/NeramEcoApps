'use client';

/**
 * Count an attempt a student made through another door of this paper.
 *
 * A student who did the chapter test well in Study Materials, outside the exam
 * window, has done the work and still reads as "Not started". This lets a
 * teacher point at the attempt that should count. The count also closes their
 * reopen, so they stop being told to do it again.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Skeleton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

interface OtherAttempt {
  id: string;
  percentage: number | null;
  score: number | null;
  total_marks: number | null;
  submitted_at: string | null;
  door: string;
}

export interface CountedAttempt {
  studentId: string;
  percentage: number | null;
  submittedAt: string | null;
  closedReopen: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  placementId: string;
  student: { id: string; name: string | null } | null;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onCounted: (counted: CountedAttempt) => void;
}

function formatDay(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function describe(a: OtherAttempt): string {
  const pct = a.percentage == null ? 'No score' : `${Math.round(a.percentage)}%`;
  const marks = a.score != null && a.total_marks ? ` (${a.score}/${a.total_marks})` : '';
  return `${pct}${marks} · ${a.door} · ${formatDay(a.submitted_at)}`;
}

export default function CountAttemptSheet({ open, onClose, placementId, student, authFetch, onCounted }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [attempts, setAttempts] = useState<OtherAttempt[] | null>(null);
  const [chosen, setChosen] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !student) return;
    let cancelled = false;
    setAttempts(null);
    setChosen('');
    setNote('');
    setError(null);
    authFetch(`/api/tests/runs/${placementId}/credits?student_id=${encodeURIComponent(student.id)}`)
      .then((json) => {
        if (cancelled) return;
        const list: OtherAttempt[] = json.data?.attempts || [];
        setAttempts(list);
        // The best one is the usual choice; the teacher can pick another.
        const best = [...list].sort((x, y) => (y.percentage ?? -1) - (x.percentage ?? -1))[0];
        setChosen(json.data?.credit?.attempt_id || best?.id || '');
      })
      .catch((err) => {
        if (cancelled) return;
        setAttempts([]);
        setError(err instanceof Error ? err.message : 'Could not load their attempts');
      });
    return () => {
      cancelled = true;
    };
  }, [open, student, placementId, authFetch]);

  const picked = attempts?.find((a) => a.id === chosen) ?? null;

  async function count() {
    if (!student || !picked) return;
    setSaving(true);
    setError(null);
    try {
      const json = await authFetch(`/api/tests/runs/${placementId}/credits`, {
        method: 'POST',
        body: JSON.stringify({ student_id: student.id, attempt_id: picked.id, note: note.trim() || null }),
      });
      onCounted({
        studentId: student.id,
        percentage: picked.percentage,
        submittedAt: picked.submitted_at,
        closedReopen: Boolean(json.data?.closed_reopen),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not count that attempt');
    } finally {
      setSaving(false);
    }
  }

  const firstName = student?.name?.split(/\s+/)[0] || 'this student';

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullScreen={fullScreen} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <Typography component="span" sx={{ fontWeight: 700, flex: 1 }}>
          Count {firstName}&apos;s own attempt
        </Typography>
        <IconButton onClick={onClose} disabled={saving} aria-label="Close" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 1.5, sm: 3 } }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          They did this paper through another door. Pick the attempt that should count here. Their
          reopen closes, so they are not asked to do it again.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        )}

        {attempts === null ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1.5 }} />
            ))}
          </Box>
        ) : attempts.length === 0 ? (
          <Typography variant="body2">They have no finished attempt through another door.</Typography>
        ) : (
          <RadioGroup
            value={chosen}
            onChange={(e) => setChosen(e.target.value)}
            aria-label="Attempt to count"
            sx={{ mb: 1.5 }}
          >
            {attempts.map((a) => (
              <FormControlLabel
                key={a.id}
                value={a.id}
                control={<Radio />}
                label={<Typography variant="body2">{describe(a)}</Typography>}
                sx={{ minHeight: 48, mx: 0 }}
              />
            ))}
          </RadioGroup>
        )}

        {attempts && attempts.length > 0 && (
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            InputProps={{ sx: { fontSize: 16 } }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 1.5, sm: 3 }, py: 1.5, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 48, textTransform: 'none' }}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          onClick={count}
          disabled={!picked || saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          {picked
            ? `Count ${picked.percentage == null ? 'it' : `${Math.round(picked.percentage)}%`} from ${formatDay(picked.submitted_at)}`
            : 'Count it'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
