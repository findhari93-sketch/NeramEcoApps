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
  Divider,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';

/**
 * Generate a test for every chapter in a folder that has not got one.
 *
 * Strictly ONE AT A TIME. GEMINI_API_KEY is a single shared free-tier key
 * serving all four apps, so nine parallel calls would rate limit each other and
 * take class recaps and drawing feedback down with them for the afternoon. A
 * sequential run is also the only way a failure can be reported per chapter
 * rather than as one opaque "some of it worked".
 *
 * The loop is driven from the client rather than from a background job because
 * each chapter is its own request with its own 300 second budget, and Vercel
 * has nowhere to park a nine-chapter job that outlives them all.
 */

type RowState = 'waiting' | 'running' | 'done' | 'failed';

interface Row {
  id: string;
  title: string;
  state: RowState;
  message?: string;
}

interface Props {
  open: boolean;
  folderName: string;
  files: Array<{
    id: string;
    title: string;
    file_type: string | null;
    has_test?: boolean;
    /** Linked to a Question Bank paper: that paper's own questions are the test, not a fresh AI write. */
    qb_paper?: { id: string } | null;
  }>;
  onClose: () => void;
  onFinished: () => void;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
}

export default function GenerateFolderTestsDialog({
  open,
  folderName,
  files,
  onClose,
  onFinished,
  authFetch,
}: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const candidates = useMemo(
    () => files.filter((f) => f.file_type === 'application/pdf' && !f.has_test && !f.qb_paper),
    [files],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poolSize, setPoolSize] = useState(40);
  const [serve, setServe] = useState(20);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(candidates.map((c) => c.id)));
    setRows([]);
    setRunning(false);
    setStopRequested(false);
  }, [open, candidates]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function run() {
    const queue = candidates.filter((c) => selected.has(c.id));
    if (queue.length === 0) return;

    setRunning(true);
    setStopRequested(false);
    setRows(queue.map((c) => ({ id: c.id, title: c.title, state: 'waiting' as RowState })));

    let stopped = false;
    for (const item of queue) {
      if (stopped) break;
      setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, state: 'running' } : r)));
      try {
        const json = await authFetch(`/api/study-materials/files/${item.id}/test/generate`, {
          method: 'POST',
          body: JSON.stringify({ pool_size: poolSize, serve }),
        });
        const d = json.data || {};
        setRows((prev) =>
          prev.map((r) =>
            r.id === item.id
              ? { ...r, state: 'done', message: `${d.pool_size} written, ${d.serve} asked each time` }
              : r,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed';
        setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, state: 'failed', message } : r)));
        // A rate limit will hit every remaining chapter the same way, so the run
        // stops rather than burning through the rest to fail nine times.
        if (message.includes('rate limited')) {
          stopped = true;
          setStopRequested(true);
        }
      }
    }

    setRunning(false);
    onFinished();
  }

  const finished = rows.length > 0 && !running;
  const succeeded = rows.filter((r) => r.state === 'done').length;
  const failed = rows.filter((r) => r.state === 'failed');
  const progress = rows.length > 0 ? (rows.filter((r) => r.state !== 'waiting' && r.state !== 'running').length / rows.length) * 100 : 0;

  return (
    <Dialog open={open} onClose={running ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeOutlinedIcon color="primary" />
        Generate tests for {folderName}
      </DialogTitle>

      <DialogContent sx={{ overflowX: 'hidden' }}>
        {candidates.length === 0 ? (
          <Alert severity="success">Every PDF in this folder already has a test.</Alert>
        ) : rows.length === 0 ? (
          <Stack spacing={2.5}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {candidates.length} PDF{candidates.length === 1 ? '' : 's'} here have no test yet. Each one goes live
              as soon as it is written.
            </Typography>

            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Questions each"
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

            <Divider />

            <Stack spacing={0}>
              {candidates.map((c) => (
                <Box
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 48,
                    cursor: 'pointer',
                    borderRadius: 1,
                    px: 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Checkbox checked={selected.has(c.id)} size="small" />
                  <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    {c.title}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
              These run one after another, not all at once: the AI key is shared with class recaps and drawing
              feedback, and firing them together would rate limit all of it. Expect a minute or two per chapter.
            </Alert>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <LinearProgress variant="determinate" value={progress} />
            {rows.map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, minHeight: 40 }}>
                <Box sx={{ width: 22, display: 'flex', justifyContent: 'center', pt: 0.25 }}>
                  {r.state === 'running' && <CircularProgress size={16} />}
                  {r.state === 'done' && <CheckCircleOutlineIcon fontSize="small" color="success" />}
                  {r.state === 'failed' && <ErrorOutlineIcon fontSize="small" color="error" />}
                  {r.state === 'waiting' && (
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'action.disabled', mt: 0.75 }} />
                  )}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: r.state === 'running' ? 600 : 400, overflowWrap: 'anywhere' }}
                  >
                    {r.title}
                  </Typography>
                  {r.message && (
                    <Typography
                      variant="caption"
                      sx={{ color: r.state === 'failed' ? 'error.main' : 'text.secondary', overflowWrap: 'anywhere' }}
                    >
                      {r.message}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}

            {stopRequested && (
              <Alert severity="warning">
                The AI is rate limited, so the rest were left alone rather than failing one by one. Try again in a
                few minutes.
              </Alert>
            )}
            {finished && !stopRequested && (
              <Alert severity={failed.length === 0 ? 'success' : 'warning'}>
                {succeeded} of {rows.length} chapters now have a test.
                {failed.length > 0 && ' The rest can be retried.'}
              </Alert>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={running} sx={{ minHeight: 48 }}>
          {finished ? 'Close' : 'Cancel'}
        </Button>
        {candidates.length > 0 && (
          <Button
            onClick={run}
            disabled={running || selected.size === 0}
            variant="contained"
            startIcon={finished ? <ReplayOutlinedIcon /> : <AutoAwesomeOutlinedIcon />}
            sx={{ minHeight: 48 }}
          >
            {running
              ? 'Working...'
              : finished
                ? 'Run again'
                : `Generate ${selected.size} test${selected.size === 1 ? '' : 's'}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
