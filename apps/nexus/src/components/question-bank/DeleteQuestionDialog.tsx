'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { QBDeletePreflight } from '@neram/database';

/**
 * Deleting a bank question, with the consequences shown first.
 *
 * Five tables reference nexus_qb_questions with ON DELETE CASCADE, and one of
 * them is nexus_test_questions, so a permanent delete can quietly remove a
 * question from a paper students have already sat and been scored on. Nothing
 * in the database stops that. This dialog is the thing that does: it asks the
 * server what points at the question before offering the button, and when
 * something does, the permanent option is not merely discouraged, it is gone.
 *
 * Deactivate is always offered, because it is what a teacher almost always
 * actually wants: the question stops reaching students and every record of it
 * survives.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  questionId: string;
  /** Shown while the preflight loads, so the dialog is never a blank box. */
  questionText?: string | null;
  getToken: () => Promise<string | null>;
  /** Called after either kind of delete succeeds. */
  onDeleted: (mode: 'soft' | 'hard') => void;
}

export default function DeleteQuestionDialog({
  open,
  onClose,
  questionId,
  questionText,
  getToken,
  onDeleted,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [preflight, setPreflight] = useState<QBDeletePreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'soft' | 'hard' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreflight(null);
      setError(null);
      setBusy(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await fetch(`/api/question-bank/questions/${questionId}/delete-preflight`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || 'Could not check this question');
        setPreflight(json.data as QBDeletePreflight);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not check this question');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, questionId, getToken]);

  const run = useCallback(
    async (mode: 'soft' | 'hard') => {
      setBusy(mode);
      setError(null);
      try {
        const token = await getToken();
        const url =
          mode === 'hard'
            ? `/api/question-bank/questions/${questionId}?hard=1`
            : `/api/question-bank/questions/${questionId}`;
        const res = await fetch(url, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'That did not work');
        onDeleted(mode);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not work');
      } finally {
        setBusy(null);
      }
    },
    [questionId, getToken, onDeleted, onClose],
  );

  const blockers = preflight?.blockers ?? [];
  const canDeleteForever = !loading && !!preflight && blockers.length === 0;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>Remove this question?</DialogTitle>

      <DialogContent dividers>
        {questionText ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 2,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {questionText}
          </Typography>
        ) : null}

        {loading ? (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
            <Typography variant="body2">Checking what uses this question...</Typography>
          </Stack>
        ) : null}

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {!loading && preflight && blockers.length > 0 ? (
          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              This question is in use
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {blockers.map((b) => (
                <li key={b}>
                  <Typography variant="body2">{b}</Typography>
                </li>
              ))}
            </Box>
          </Alert>
        ) : null}

        {!loading && preflight && blockers.length === 0 ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Nothing points at this question. No student has answered it and no test is holding it.
          </Alert>
        ) : null}

        <Typography variant="body2" color="text.secondary">
          Hiding it stops it reaching students and keeps every record. Deleting it permanently cannot
          be undone.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
        <Button onClick={onClose} disabled={!!busy} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<VisibilityOffIcon />}
          onClick={() => run('soft')}
          disabled={!!busy}
          sx={{ minHeight: 44 }}
        >
          {busy === 'soft' ? 'Hiding...' : 'Hide it'}
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteForeverIcon />}
          onClick={() => run('hard')}
          disabled={!canDeleteForever || !!busy}
          sx={{ minHeight: 44 }}
        >
          {busy === 'hard' ? 'Deleting...' : 'Delete forever'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
