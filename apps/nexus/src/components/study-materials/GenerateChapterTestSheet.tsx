'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

/**
 * Turn one chapter PDF into a published test.
 *
 * Three decisions and a button. Everything else the old route asked for (the
 * chapter name, the folder, the title, which duplicates to keep) is either read
 * off the document or resolved without a human, because a teacher facing nine
 * chapters will not answer twenty-seven questions to get nine tests.
 *
 * The wait is 60 to 120 seconds: a multi-megabyte PDF has to reach the model
 * and 40 questions have to come back. A bare spinner over that long reads as a
 * hang, so the stages are named and they advance on a timer. They are an honest
 * description of what the route does in order, not a progress measurement, and
 * the last one waits rather than completing on its own.
 */

const STAGES = [
  'Reading the chapter',
  'Writing the questions',
  'Checking them against the bank',
  'Filing the test',
];

export interface GeneratedTestSummary {
  test_id: string;
  title: string;
  created: number;
  reused: number;
  pool_size: number;
  serve: number;
  dropped_ungrounded: number;
}

interface Props {
  open: boolean;
  file: { id: string; title: string } | null;
  onClose: () => void;
  onGenerated: (summary: GeneratedTestSummary) => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
}

const EXAMS = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE', label: 'JEE Paper 2' },
  { value: 'BOTH', label: 'Both' },
] as const;

export default function GenerateChapterTestSheet({ open, file, onClose, onGenerated, authFetch }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [poolSize, setPoolSize] = useState(40);
  const [serve, setServe] = useState(20);
  const [exam, setExam] = useState<'NATA' | 'JEE' | 'BOTH'>('NATA');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<GeneratedTestSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setStage(0);
    setError(null);
    setDone(null);
  }, [open]);

  // Advances while the single request is in flight. Stops one short of the end
  // so the sheet never claims to have finished before the server says so.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 22000);
    return () => clearInterval(timer);
  }, [busy]);

  async function generate() {
    if (!file) return;
    setBusy(true);
    setStage(0);
    setError(null);
    try {
      const json = await authFetch(`/api/study-materials/files/${file.id}/test/generate`, {
        method: 'POST',
        body: JSON.stringify({ pool_size: poolSize, serve, exam }),
      });
      setDone(json.data as GeneratedTestSummary);
      onGenerated(json.data as GeneratedTestSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate a test');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeOutlinedIcon color="primary" />
        Generate a test
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {file?.title}
        </Typography>

        {done ? (
          <Stack spacing={1.5}>
            <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
              <strong>{done.title}</strong> is live on this chapter.
            </Alert>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`${done.pool_size} questions written`} />
              <Chip size="small" label={`${done.serve} asked each time`} />
              {done.reused > 0 && <Chip size="small" label={`${done.reused} reused from the bank`} />}
            </Stack>
            {done.dropped_ungrounded > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {done.dropped_ungrounded} question{done.dropped_ungrounded === 1 ? ' was' : 's were'} dropped for
                not quoting the chapter.
              </Typography>
            )}
          </Stack>
        ) : busy ? (
          <Box sx={{ py: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
              {STAGES[stage]}...
            </Typography>
            <LinearProgress />
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.5 }}>
              This takes a minute or two. Leaving this open is fine.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                Target exam
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={exam}
                onChange={(_, v) => v && setExam(v)}
                sx={{ mt: 0.5, '& .MuiToggleButton-root': { minHeight: 48 } }}
              >
                {EXAMS.map((e) => (
                  <ToggleButton key={e.value} value={e.value}>
                    {e.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>

            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Questions to write"
                type="number"
                size="small"
                fullWidth
                value={poolSize}
                onChange={(e) => {
                  const n = Math.max(5, Math.min(80, Number(e.target.value) || 0));
                  setPoolSize(n);
                  if (serve > n) setServe(n);
                }}
                inputProps={{ min: 5, max: 80, inputMode: 'numeric' }}
              />
              <TextField
                label="Asked each time"
                type="number"
                size="small"
                fullWidth
                value={serve}
                onChange={(e) => setServe(Math.max(1, Math.min(poolSize, Number(e.target.value) || 0)))}
                inputProps={{ min: 1, max: poolSize, inputMode: 'numeric' }}
              />
            </Stack>

            <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
              {serve < poolSize ? (
                <>
                  Each student is asked {serve} of the {poolSize}, drawn fresh every attempt, so a retry is mostly
                  questions they have not seen and no two students sit the same paper.
                </>
              ) : (
                <>Every student is asked all {poolSize}, reordered each attempt.</>
              )}
            </Alert>

            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              The test goes live on this chapter as soon as it is written. Questions the AI cannot quote from the
              PDF are dropped first.
            </Typography>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {done ? (
          <Button onClick={onClose} variant="contained" fullWidth sx={{ minHeight: 48 }}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy} sx={{ minHeight: 48 }}>
              Cancel
            </Button>
            <Button
              onClick={generate}
              disabled={busy || !file}
              variant="contained"
              startIcon={<AutoAwesomeOutlinedIcon />}
              sx={{ minHeight: 48 }}
            >
              {busy ? 'Working...' : 'Generate'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
