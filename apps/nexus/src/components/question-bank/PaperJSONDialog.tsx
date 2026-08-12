'use client';

/**
 * Upload an edited paper JSON.
 *
 * The write half of the round trip that starts with Download JSON. The step
 * that matters is the preview: this dialog fetches the paper as it stands,
 * diffs the uploaded file against it with the same pure function the writer
 * uses, and says exactly which questions change and which fields. Uploading a
 * file that silently rewrites 92 questions when you meant to fix one
 * explanation is the failure this exists to prevent.
 *
 * Mobile-first because teachers do this on a phone: full screen below 600px,
 * 48px targets, and 16px in the paste box so iOS does not zoom the page when
 * it gets focus.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import {
  diffPaperQuestions,
  parsePaperJSON,
  type PaperJSONDiff,
  type PaperJSONParsedQuestion,
} from '@/lib/paper-json';

interface Props {
  open: boolean;
  onClose: () => void;
  paperId: string;
  getToken: () => Promise<string | null>;
  onSuccess: (message: string) => void;
}

type Step = 'pick' | 'preview' | 'saving' | 'done';

interface ImportResult {
  questions: { created: number; updated: number; unchanged: number; untouched: number };
  test: { rebuilt: boolean; blocked_by_attempts: number; question_count: number };
  activated: number;
  unknown_tags: string[];
  images: { stored: number; failed: number[] };
  warnings: string[];
}

/** One number and what it means, big enough to read at arm's length. */
function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <Box sx={{ minWidth: 84 }}>
      <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1, color }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export default function PaperJSONDialog({ open, onClose, paperId, getToken, onSuccess }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [diff, setDiff] = useState<PaperJSONDiff | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parsed = useMemo(() => {
    if (!raw.trim()) return null;
    try {
      return parsePaperJSON(JSON.parse(raw));
    } catch {
      return null;
    }
  }, [raw]);

  const malformed = raw.trim().length > 0 && parsed === null;

  const reset = useCallback(() => {
    setStep('pick');
    setRaw('');
    setFileName('');
    setError('');
    setDiff(null);
    setWarnings([]);
    setResult(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const readFile = useCallback(async (file: File) => {
    setError('');
    setFileName(file.name);
    setRaw(await file.text());
  }, []);

  /**
   * Build the preview.
   *
   * Fetches the paper as it stands and diffs against it, rather than guessing.
   * Costs one GET, and it is the only thing that lets the confirm button say
   * what it is about to do.
   */
  const preview = useCallback(async () => {
    if (!parsed) return;
    if (!parsed.valid) {
      setError(parsed.errors[0] || 'That file could not be read.');
      return;
    }

    setChecking(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Sign in again.');

      const res = await fetch(`/api/question-bank/papers/${paperId}/json`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not read the current paper.');

      const current: PaperJSONParsedQuestion[] = parsePaperJSON(json.data).questions;
      setDiff(diffPaperQuestions(current, parsed.questions));
      setWarnings(parsed.warnings);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the current paper.');
    } finally {
      setChecking(false);
    }
  }, [parsed, getToken, paperId]);

  const apply = useCallback(async () => {
    if (!parsed) return;
    setStep('saving');
    setError('');
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has expired. Sign in again.');

      const res = await fetch('/api/question-bank/papers/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: JSON.parse(raw), expect_paper_id: paperId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'That import did not work.');

      setResult(json.data as ImportResult);
      setStep('done');
      const { created, updated } = json.data.questions;
      onSuccess(
        `${updated} question${updated === 1 ? '' : 's'} updated${created ? `, ${created} added` : ''}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That import did not work.');
      setStep('preview');
    }
  }, [parsed, raw, getToken, paperId, onSuccess]);

  const busy = step === 'saving';

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : close}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <UploadFileOutlinedIcon sx={{ color: 'primary.main' }} />
        <Box sx={{ flex: 1, fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>Upload edited JSON</Box>
        {!busy && (
          <IconButton aria-label="Close" onClick={close} sx={{ width: 48, height: 48 }}>
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* ── Pick ───────────────────────────────────────────────────────── */}
        {step === 'pick' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Download this paper&apos;s JSON, edit it, and drop it back here. Anything the file
              does not mention is left exactly as it is, so a file holding only the questions you
              fixed works as a patch.
            </Typography>

            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = '';
              }}
            />
            <Button
              fullWidth
              variant="outlined"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => fileInput.current?.click()}
              sx={{ minHeight: 48, textTransform: 'none', borderRadius: 2, mb: 2 }}
            >
              {fileName || 'Choose a .json file'}
            </Button>

            <Divider sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">
                or paste it
              </Typography>
            </Divider>

            <TextField
              label="Paper JSON"
              multiline
              minRows={fullScreen ? 6 : 8}
              maxRows={14}
              fullWidth
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setFileName('');
              }}
              error={malformed}
              helperText={malformed ? 'That is not valid JSON.' : ' '}
              sx={{
                // 16px, not the 0.85rem the other paste dialogs use: anything
                // smaller makes iOS zoom the whole page on focus and the
                // teacher has to pinch back out to reach the buttons.
                '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: 16, lineHeight: 1.6 },
              }}
            />

            {parsed?.valid && (
              <Chip
                label={`${parsed.questions.length} question${parsed.questions.length === 1 ? '' : 's'} in this file`}
                size="small"
                color="primary"
                variant="outlined"
              />
            )}
          </Box>
        )}

        {/* ── Preview ────────────────────────────────────────────────────── */}
        {step === 'preview' && diff && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Nothing has been written yet. This is what uploading would do.
            </Typography>

            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <Stat
                  value={diff.updated.length}
                  label="updated"
                  color={theme.palette.warning.dark}
                />
                <Stat value={diff.created.length} label="added" color={theme.palette.success.main} />
                <Stat
                  value={diff.unchanged.length}
                  label="unchanged"
                  color={theme.palette.text.secondary}
                />
                <Stat
                  value={diff.untouched.length}
                  label="left alone"
                  color={theme.palette.text.secondary}
                />
              </Box>
            </Paper>

            {diff.updated.length === 0 && diff.created.length === 0 && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                This file matches the paper exactly. Uploading it changes nothing.
              </Alert>
            )}

            {diff.updated.length > 0 && (
              <Paper
                variant="outlined"
                sx={{ borderRadius: 2, mb: 2, maxHeight: 240, overflow: 'auto' }}
              >
                {diff.updated.map((row) => (
                  <Box
                    key={row.question_number}
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      px: 2,
                      py: 1.25,
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Typography variant="body2" fontWeight={700} sx={{ minWidth: 40 }}>
                      Q{row.question_number}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ pt: 0.25 }}>
                      {row.fields.join(', ')}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            )}

            {diff.untouched.length > 0 && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                {diff.untouched.length} question{diff.untouched.length === 1 ? ' is' : 's are'} not
                in this file. {diff.untouched.length === 1 ? 'It stays' : 'They stay'} exactly as
                {diff.untouched.length === 1 ? ' it is' : ' they are'}, nothing is deleted.
              </Alert>
            )}

            {warnings.length > 0 && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                <AlertTitle sx={{ fontSize: '0.9rem' }}>
                  {warnings.length} thing{warnings.length === 1 ? '' : 's'} to check
                </AlertTitle>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  {warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>
                      <Typography variant="caption">{w}</Typography>
                    </li>
                  ))}
                </Box>
              </Alert>
            )}
          </Box>
        )}

        {/* ── Saving ─────────────────────────────────────────────────────── */}
        {step === 'saving' && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body1" fontWeight={600} sx={{ mb: 2 }}>
              Applying the file, then rebuilding the test...
            </Typography>
            <LinearProgress sx={{ height: 6, borderRadius: 3, maxWidth: 320, mx: 'auto' }} />
          </Box>
        )}

        {/* ── Done ───────────────────────────────────────────────────────── */}
        {step === 'done' && result && (
          <Box sx={{ py: 1 }}>
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <CheckCircleOutlinedIcon sx={{ fontSize: 48, color: 'success.main' }} />
              <Typography variant="h6" fontWeight={700}>
                {result.questions.updated} updated
                {result.questions.created > 0 ? `, ${result.questions.created} added` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {result.questions.unchanged} unchanged, {result.questions.untouched} left alone
              </Typography>
            </Box>

            {result.test.rebuilt && (
              <Alert severity="success" sx={{ borderRadius: 2, mb: 1.5 }}>
                The full paper test was rebuilt with {result.test.question_count} questions. Nobody
                had to press Build test.
              </Alert>
            )}

            {!result.test.rebuilt && result.test.blocked_by_attempts > 0 && (
              <Alert severity="warning" sx={{ borderRadius: 2, mb: 1.5 }}>
                <AlertTitle sx={{ fontSize: '0.9rem' }}>The test was left alone</AlertTitle>
                {result.test.blocked_by_attempts} student
                {result.test.blocked_by_attempts === 1 ? ' has' : 's have'} already sat it.
                Rebuilding would detach their results, so it was not rebuilt. Rebuild it by hand on
                the Student access tab when you are ready.
              </Alert>
            )}

            {result.images.stored > 0 && (
              <Alert severity="info" sx={{ borderRadius: 2, mb: 1.5 }}>
                {result.images.stored} inline image
                {result.images.stored === 1 ? '' : 's'} uploaded to storage.
              </Alert>
            )}

            {result.images.failed.length > 0 && (
              <Alert severity="warning" sx={{ borderRadius: 2, mb: 1.5 }}>
                Images could not be stored for Q{result.images.failed.join(', Q')}. The questions
                imported without them.
              </Alert>
            )}

            {result.unknown_tags.length > 0 && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                <AlertTitle sx={{ fontSize: '0.9rem' }}>Tags that do not exist yet</AlertTitle>
                {result.unknown_tags.join(', ')}. Uploaded files never create tags. Add them in the
                tag registry first, then upload again.
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1 }}>
        {step === 'pick' && (
          <>
            <Button onClick={close} sx={{ minHeight: 48, textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={preview}
              disabled={!parsed?.valid || checking}
              startIcon={checking ? <CircularProgress size={16} color="inherit" /> : undefined}
              sx={{ minHeight: 48, textTransform: 'none', borderRadius: 2 }}
            >
              {checking ? 'Checking' : 'See what changes'}
            </Button>
          </>
        )}

        {step === 'preview' && (
          <>
            <Button onClick={() => setStep('pick')} sx={{ minHeight: 48, textTransform: 'none' }}>
              Back
            </Button>
            <Button
              variant="contained"
              onClick={apply}
              disabled={diff !== null && diff.updated.length === 0 && diff.created.length === 0}
              sx={{ minHeight: 48, textTransform: 'none', borderRadius: 2 }}
            >
              Apply and rebuild the test
            </Button>
          </>
        )}

        {step === 'done' && (
          <Button
            variant="contained"
            onClick={close}
            sx={{ minHeight: 48, textTransform: 'none', borderRadius: 2 }}
          >
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
