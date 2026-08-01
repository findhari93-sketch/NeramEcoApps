'use client';

/**
 * Writing an assignment's question paper, on a screen big enough for one.
 *
 * The composer used to live inside the create dialog's second step and at the
 * bottom of the edit dialog, both of them a bottom sheet capped at 94vh. Four
 * questions with options and explanations do not fit in that, and worse, a
 * teacher had no way of knowing the composer was there at all. Giving the paper
 * its own route fixes both: there is room, and there is a URL to send someone to.
 *
 * Everything here is a rearrangement, not new machinery. The composer is the
 * same QuestionComposer, and it saves through the same `save_questions` /
 * `clear_questions` actions on /api/assignments/[id], so there is no new
 * endpoint and no second way for a paper to be written.
 *
 * Two rules the screen has to hold on to:
 *  - A paper that students have already answered is read-only. Re-keying it
 *    would change marks they have already been shown.
 *  - "Students must upload their working" lives here, next to the questions it
 *    depends on, because the server only allows it off once at least one
 *    question marks itself.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  IconButton,
  Skeleton,
  Snackbar,
  Alert,
  Switch,
  FormControlLabel,
  Divider,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import QuestionComposer, {
  type ComposerQuestion,
  fromApiQuestions,
  toApiQuestions,
} from '@/components/assignments/QuestionComposer';

function AssignmentQuestionsEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const authFetch = useAuthFetch();
  const theme = useTheme();

  // Came straight from creating the assignment, so it is still a draft and the
  // teacher has not seen it published yet. Only changes the wording.
  const isNew = search.get('new') === '1';

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<ComposerQuestion[]>([]);
  const [requiresPdf, setRequiresPdf] = useState(true);
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    authFetch(`/api/assignments/${id}`)
      .then((res) => {
        if (cancelled) return;
        setTitle(res.assignment?.title ?? '');
        setRequiresPdf(res.assignment?.requires_pdf !== false);
        if (res.paper?.questions?.length) setQuestions(fromApiQuestions(res.paper.questions));
        const answered = (res.roster || []).filter((r: any) => r.answers).length;
        if (answered > 0) {
          setLockedReason(
            `${answered} ${answered === 1 ? 'student has' : 'students have'} already answered these questions, so the paper can no longer be changed.`,
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Could not load this assignment.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, authFetch]);

  const totals = useMemo(() => {
    const total = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    const auto = questions
      .filter((q) => q.format !== 'SUBJECTIVE')
      .reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    return { total, auto, manual: total - auto };
  }, [questions]);

  const hasAutoQuestion = questions.some((q) => q.format !== 'SUBJECTIVE');

  const onQuestionsChange = useCallback((next: ComposerQuestion[]) => {
    setQuestions(next);
    setDirty(true);
  }, []);

  const back = () => router.push(`/teacher/assignments/${id}`);

  const save = async () => {
    if (lockedReason) return;
    // A question with no text is almost always a card someone opened and left.
    // Saying so beats saving a blank Q3 that students then have to puzzle over.
    const blank = questions.findIndex((q) => !q.question_text.trim());
    if (blank >= 0) {
      setSnack({ msg: `Question ${blank + 1} has no text yet.`, sev: 'error' });
      return;
    }
    const unkeyed = questions.findIndex(
      (q) => q.format !== 'SUBJECTIVE' && !String(q.correct_answer ?? '').trim(),
    );
    if (unkeyed >= 0) {
      setSnack({
        msg: `Question ${unkeyed + 1} has no correct answer, so it cannot mark itself.`,
        sev: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      if (questions.length === 0) {
        await authFetch(`/api/assignments/${id}`, {
          method: 'POST',
          body: JSON.stringify({ action: 'clear_questions' }),
        });
      } else {
        await authFetch(`/api/assignments/${id}`, {
          method: 'POST',
          body: JSON.stringify({ action: 'save_questions', questions: toApiQuestions(questions) }),
        });
        // After the questions, never before: the server only permits the upload
        // to be optional once a question exists that marks itself.
        await authFetch(`/api/assignments/${id}`, {
          method: 'POST',
          body: JSON.stringify({ action: 'update', requires_pdf: requiresPdf }),
        });
      }
      setDirty(false);
      back();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not save the paper.', sev: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 2, maxWidth: 780, mx: 'auto' }}>
        <Skeleton variant="text" width="60%" height={36} />
        <Skeleton variant="rectangular" height={160} sx={{ mt: 2, borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={160} sx={{ mt: 1.5, borderRadius: 2 }} />
      </Box>
    );
  }

  if (loadError) {
    return (
      <Box sx={{ p: 2, maxWidth: 780, mx: 'auto' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
        <Button onClick={back} startIcon={<ArrowBackIcon />} sx={{ minHeight: 44, textTransform: 'none' }}>
          Back to the assignment
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 12 }}>
      {/* Sticky header: where you are, and what the paper adds up to, always. */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.paper',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ maxWidth: 780, mx: 'auto', px: { xs: 1.5, sm: 2 }, py: 1.25 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={back} aria-label="Back to the assignment" sx={{ width: 44, height: 44 }}>
              <ArrowBackIcon />
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {title || 'Assignment'}
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', lineHeight: 1.2 }}>
                Questions
              </Typography>
            </Box>
          </Stack>
          {questions.length > 0 && (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ mt: 1, pl: { xs: 0, sm: 6.5 } }}
              flexWrap="wrap"
              useFlexGap
            >
              <Chip
                size="small"
                label={`${questions.length} question${questions.length === 1 ? '' : 's'}`}
                sx={{ height: 24, fontWeight: 700 }}
              />
              <Chip size="small" label={`${totals.total} marks`} sx={{ height: 24, fontWeight: 700 }} />
              {totals.auto > 0 && (
                <Chip
                  size="small"
                  icon={<BoltOutlinedIcon sx={{ fontSize: 14 }} />}
                  label={`${totals.auto} auto`}
                  sx={{
                    height: 24,
                    fontWeight: 700,
                    bgcolor: alpha(theme.palette.success.main, 0.14),
                    color: 'success.dark',
                    '& .MuiChip-icon': { color: 'success.dark' },
                  }}
                />
              )}
              {totals.manual > 0 && (
                <Chip
                  size="small"
                  label={`${totals.manual} you mark`}
                  sx={{
                    height: 24,
                    fontWeight: 700,
                    bgcolor: alpha(theme.palette.warning.main, 0.16),
                    color: 'warning.dark',
                  }}
                />
              )}
            </Stack>
          )}
        </Box>
      </Box>

      <Box sx={{ maxWidth: 780, mx: 'auto', px: { xs: 1.5, sm: 2 }, pt: 2 }}>
        {isNew && !lockedReason && (
          <Alert severity="info" sx={{ mb: 2 }}>
            The assignment is saved as a draft. Write its questions here, then publish it from the
            assignment page.
          </Alert>
        )}

        {lockedReason && (
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-start"
            role="status"
            sx={{
              p: 1.5,
              mb: 2,
              borderRadius: 2,
              bgcolor: alpha('#EF6C00', 0.1),
              border: `1px solid ${alpha('#EF6C00', 0.3)}`,
            }}
          >
            <LockOutlinedIcon sx={{ fontSize: 18, color: '#B54700', mt: '2px' }} />
            <Typography variant="body2" sx={{ color: '#B54700' }}>
              {lockedReason}
            </Typography>
          </Stack>
        )}

        <QuestionComposer
          value={questions}
          onChange={onQuestionsChange}
          disabled={!!lockedReason}
        />

        {questions.length > 0 && (
          <>
            <Divider sx={{ my: 2.5 }} />
            <Box sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={requiresPdf}
                    onChange={(e) => {
                      setRequiresPdf(e.target.checked);
                      setDirty(true);
                    }}
                    disabled={!!lockedReason || !hasAutoQuestion}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Students must upload their working
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {requiresPdf
                        ? 'They upload first, then the questions open. Results are instant, so taking the working in first is what stops the answers being copied backwards into it.'
                        : 'They answer and submit straight away, with nothing to upload.'}
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', m: 0, '& .MuiSwitch-root': { mt: 0.25 } }}
              />
              {!hasAutoQuestion && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Every question here is marked by you, so the upload stays required. Add a multiple
                  choice or numerical question to make it optional.
                </Typography>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Sticky action bar: the save is always one thumb away, never scrolled past. */}
      {!lockedReason && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            pb: 'calc(10px + env(safe-area-inset-bottom))',
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ maxWidth: 780, mx: 'auto' }}>
            <Button variant="outlined" onClick={back} sx={{ flex: 1, minHeight: 48, textTransform: 'none' }}>
              {dirty ? 'Discard' : 'Back'}
            </Button>
            <Button
              variant="contained"
              onClick={save}
              disabled={saving}
              sx={{ flex: 2, minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              {saving ? 'Saving...' : isNew ? 'Save and continue' : 'Save paper'}
            </Button>
          </Stack>
        </Box>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={5000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{ bottom: { xs: 88, sm: 88 } }}
      >
        <Alert severity={snack?.sev ?? 'success'} onClose={() => setSnack(null)} sx={{ width: '100%' }}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/**
 * useSearchParams needs a Suspense boundary or the whole route opts out of
 * static generation and the build warns. Same wrapper the other teacher pages
 * that read a query string use.
 */
export default function AssignmentQuestionsPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ p: 2, maxWidth: 780, mx: 'auto' }}>
          <Skeleton variant="text" width="60%" height={36} />
          <Skeleton variant="rectangular" height={160} sx={{ mt: 2, borderRadius: 2 }} />
        </Box>
      }
    >
      <AssignmentQuestionsEditor />
    </Suspense>
  );
}
