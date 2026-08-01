'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Drawer,
  Alert,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import { useAuthFetch } from '@/components/curriculum/shared';

/**
 * The four numbers behind checkpoint generation.
 *
 * They are not independent, and the relationship is the point: banking more
 * questions than are served is what lets a retry ask different ones, so a
 * student who failed has to rewatch rather than remember which option they
 * clicked. A teacher should not have to hold that in their head, so the sheet
 * states the consequence in a sentence and the server clamps the rest.
 *
 * Bottom sheet on mobile, side drawer on desktop. Teachers set this on a phone
 * between classes as often as at a desk.
 */

export interface RecapSettings {
  target_segment_seconds: number;
  question_pool_per_segment: number;
  questions_per_segment: number;
  /** Share of the served questions needed to pass, 50 to 100. */
  pass_percentage: number;
}

interface Props {
  open: boolean;
  recapId: string;
  initial: RecapSettings;
  videoDurationSeconds?: number | null;
  onClose: () => void;
  onSaved: (s: RecapSettings) => void;
}

export default function RecapSettingsSheet({
  open,
  recapId,
  initial,
  videoDurationSeconds,
  onClose,
  onSaved,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const authFetch = useAuthFetch();

  const [minutes, setMinutes] = useState(String(Math.round(initial.target_segment_seconds / 60)));
  const [pool, setPool] = useState(String(initial.question_pool_per_segment));
  const [serve, setServe] = useState(String(initial.questions_per_segment));
  const [pass, setPass] = useState(String(initial.pass_percentage));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = (v: string, fallback: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x) : fallback;
  };

  /** Live arithmetic, so the numbers stop being abstract. */
  const preview = useMemo(() => {
    const mins = n(minutes, 15);
    const p = n(pool, 15);
    const s = Math.min(n(serve, 10), p);
    const pct = Math.max(50, Math.min(100, n(pass, 70)));
    // The same rounding the server and the quiz engine use, so what a teacher
    // reads here is exactly what a student will be asked for.
    const correct = Math.max(1, Math.min(s, Math.ceil((s * pct) / 100)));
    const segments = videoDurationSeconds
      ? Math.max(2, Math.round(videoDurationSeconds / (mins * 60)))
      : null;
    return { mins, p, s, pct, correct, segments };
  }, [minutes, pool, serve, pass, videoDurationSeconds]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/class-recaps/${recapId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          target_segment_seconds: preview.mins * 60,
          question_pool_per_segment: preview.p,
          questions_per_segment: preview.s,
          pass_percentage: preview.pct,
        }),
      });
      onSaved(res.settings as RecapSettings);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [authFetch, onClose, onSaved, preview, recapId]);

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    helper: string,
  ) => (
    <TextField
      label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      type="number"
      inputProps={{ min: 1, inputMode: 'numeric' }}
      helperText={helper}
      fullWidth
      size="small"
      sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
    />
  );

  return (
    <Drawer
      anchor={isMobile ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: isMobile
          ? { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88dvh' }
          : { width: 400 },
      }}
    >
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', mb: 0.5 }}>
          Checkpoint settings
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          How the recording is split, and what a student has to do to get through it.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {field(
            'Checkpoint length (minutes)',
            minutes,
            setMinutes,
            'The class is divided evenly, then nudged to the nearest pause.',
          )}
          {field('Questions to write per checkpoint', pool, setPool, 'The bank the quiz draws from.')}
          {field('Questions shown per attempt', serve, setServe, 'Fewer than the bank, so a retry differs.')}
          {field('Pass mark (%)', pass, setPass, 'Of the questions shown. 50% or higher.')}
        </Box>

        <Box
          sx={{
            mt: 2.5,
            p: 1.75,
            borderRadius: 2,
            bgcolor: (t) => (t.palette.mode === 'light' ? '#F5F7FA' : 'action.hover'),
          }}
        >
          <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
            {preview.segments
              ? `${preview.segments} checkpoints of about ${preview.mins} minutes. `
              : `Checkpoints of about ${preview.mins} minutes. `}
            {`${preview.p} questions written per checkpoint, ${preview.s} shown each attempt, ${preview.correct} of those ${preview.s} right to pass.`}
          </Typography>
          {preview.p <= preview.s && (
            <Typography variant="body2" color="warning.main" sx={{ mt: 1, fontWeight: 600 }}>
              With the bank the same size as the number shown, a retry asks the same
              questions again. Write more than you show.
            </Typography>
          )}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
          <Button onClick={onClose} sx={{ minHeight: 48, flex: 1, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving}
            sx={{ minHeight: 48, flex: 2, textTransform: 'none', fontWeight: 700 }}
          >
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
