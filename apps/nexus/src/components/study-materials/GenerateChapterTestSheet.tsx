'use client';

import { useCallback, useEffect, useState } from 'react';
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
import ChapterTestUploadPanel, { type UploadedTestSummary } from './ChapterTestUploadPanel';

/**
 * Put a test on one chapter, either by writing it or by bringing one.
 *
 * Writing it is three decisions and a button. Everything else the old route
 * asked for (the chapter name, the folder, the title, which duplicates to keep)
 * is either read off the document or resolved without a human, because a teacher
 * facing nine chapters will not answer twenty-seven questions to get nine tests.
 *
 * The wait is 60 to 120 seconds: a multi-megabyte PDF has to reach the model and
 * 40 questions have to come back. A bare spinner over that long reads as a hang,
 * so the stages are named and they advance on a timer. They are an honest
 * description of what the route does in order, not a progress measurement, and
 * the last one waits rather than completing on its own.
 *
 * Bringing one is the second mode, and it is here rather than in its own dialog
 * because "put a test on this chapter" is one intention with two answers. It
 * also lifts the ceiling: one model call tops out around 40 questions, and a
 * teacher who wrote 150 in their own session should not have to file them
 * through another module and come back to link the result.
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
  /** Generated only: questions the model could not quote from the chapter. */
  dropped_ungrounded?: number;
  /** Uploaded only: rows the file carried that could not be read. */
  skipped?: number;
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

type Mode = 'ai' | 'upload';

export default function GenerateChapterTestSheet({ open, file, onClose, onGenerated, authFetch }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // Deliberately NOT reset when the dialog reopens. A teacher working through a
  // folder of chapters picks their answer once and gets it back on the next one.
  const [mode, setMode] = useState<Mode>('ai');

  const [poolSize, setPoolSize] = useState(40);
  const [serve, setServe] = useState(20);
  const [exam, setExam] = useState<'NATA' | 'JEE' | 'BOTH'>('NATA');
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when the server refuses the call and hands back the prompt instead:
   * the feature is switched to Manual, or the AI budget for the month is spent.
   * Not a failure, an alternative route, so it renders as instructions rather
   * than as an error.
   */
  const [manualPrompt, setManualPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<GeneratedTestSummary | null>(null);
  /**
   * Bumped on every open so the upload panel remounts. Without it the dialog
   * would reopen on the next chapter still holding the previous chapter's
   * pasted JSON, which is the one way this could quietly file the wrong paper.
   */
  const [session, setSession] = useState(0);

  useEffect(() => {
    if (!open) return;
    setBusy(false);
    setUploadBusy(false);
    setStage(0);
    setError(null);
    setManualPrompt(null);
    setCopied(false);
    setDone(null);
    setSession((s) => s + 1);
  }, [open]);

  // Advances while the single request is in flight. Stops one short of the end
  // so the sheet never claims to have finished before the server says so.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 22000);
    return () => clearInterval(timer);
  }, [busy]);

  const handleUploadBusy = useCallback((value: boolean) => setUploadBusy(value), []);

  const handleUploaded = useCallback(
    (summary: UploadedTestSummary) => {
      setDone(summary);
      onGenerated(summary);
    },
    [onGenerated],
  );

  async function generate() {
    if (!file) return;
    setBusy(true);
    setStage(0);
    setError(null);
    setManualPrompt(null);
    try {
      const json = await authFetch(`/api/study-materials/files/${file.id}/test/generate`, {
        method: 'POST',
        body: JSON.stringify({ pool_size: poolSize, serve, exam }),
      });
      setDone(json.data as GeneratedTestSummary);
      onGenerated(json.data as GeneratedTestSummary);
    } catch (err) {
      const prompt = (err as { manualPrompt?: string })?.manualPrompt;
      if (prompt) {
        // Budget spent or Manual mode. Show the prompt and move to the paste
        // tab, so the next thing the teacher does is the thing that works.
        setManualPrompt(prompt);
        setMode('upload');
      }
      setError(err instanceof Error ? err.message : 'Could not generate a test');
    } finally {
      setBusy(false);
    }
  }

  /** Any in-flight write. Closing mid-write would orphan a half-built test. */
  const locked = busy || uploadBusy;
  const showModeSwitch = !done && !busy;

  return (
    <Dialog
      open={open}
      onClose={locked ? undefined : onClose}
      fullWidth
      maxWidth={mode === 'upload' && !done ? 'sm' : 'xs'}
      fullScreen={fullScreen}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeOutlinedIcon color="primary" />
        Add a test
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          {file?.title}
        </Typography>

        {showModeSwitch && (
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={mode}
            onChange={(_, v) => v && setMode(v as Mode)}
            sx={{ mb: 2.5, '& .MuiToggleButton-root': { minHeight: 48, textTransform: 'none' } }}
          >
            <ToggleButton value="ai">Write with AI</ToggleButton>
            <ToggleButton value="upload">Upload JSON</ToggleButton>
          </ToggleButtonGroup>
        )}

        {done ? (
          <Stack spacing={1.5}>
            <Alert severity="success" icon={<CheckCircleOutlineIcon />}>
              <strong>{done.title}</strong> is live on this chapter.
            </Alert>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`${done.pool_size} questions`} />
              <Chip size="small" label={`${done.serve} asked each time`} />
              {done.reused > 0 && <Chip size="small" label={`${done.reused} reused from the bank`} />}
            </Stack>
            {!!done.dropped_ungrounded && done.dropped_ungrounded > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {done.dropped_ungrounded} question{done.dropped_ungrounded === 1 ? ' was' : 's were'} dropped for
                not quoting the chapter.
              </Typography>
            )}
            {!!done.skipped && done.skipped > 0 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {done.skipped} row{done.skipped === 1 ? '' : 's'} in the file could not be read and{' '}
                {done.skipped === 1 ? 'was' : 'were'} left out.
              </Typography>
            )}
          </Stack>
        ) : mode === 'upload' ? (
          file && (
            <Stack spacing={2}>
              {manualPrompt && (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {error}
                  </Typography>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1.5 }}>
                    Copy the prompt below into Gemini or Claude, attach this chapter&apos;s PDF, then
                    paste the JSON it gives you into the box underneath. The result is identical, it
                    just does not come out of the AI budget.
                  </Typography>
                  <TextField
                    value={manualPrompt}
                    multiline
                    minRows={4}
                    maxRows={10}
                    fullWidth
                    size="small"
                    InputProps={{ readOnly: true, sx: { fontSize: 12, fontFamily: 'monospace' } }}
                    inputProps={{ 'aria-label': 'Prompt to run by hand' }}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    sx={{ mt: 1, textTransform: 'none', fontWeight: 600, minHeight: 40 }}
                    onClick={async () => {
                      // Falls back to the textarea's own select-all when the
                      // clipboard API is unavailable, which is every browser
                      // on an insecure origin.
                      try {
                        await navigator.clipboard.writeText(manualPrompt);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        setCopied(false);
                      }
                    }}
                  >
                    {copied ? 'Copied' : 'Copy prompt'}
                  </Button>
                </Alert>
              )}
              <ChapterTestUploadPanel
                key={session}
                file={file}
                authFetch={authFetch}
                onCreated={handleUploaded}
                onBusyChange={handleUploadBusy}
                onCancel={onClose}
              />
            </Stack>
          )
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

            {error && !manualPrompt && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>

      {/* The upload panel carries its own actions, because which button is the
          primary one changes as it moves from reading a file to creating. */}
      {(done || mode === 'ai') && (
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
      )}
    </Dialog>
  );
}
