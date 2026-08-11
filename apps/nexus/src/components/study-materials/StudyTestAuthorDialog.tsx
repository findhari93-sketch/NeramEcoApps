'use client';

/**
 * Link a test to a study chapter.
 *
 * This used to author questions in place: paste AI JSON, type them manually, or
 * pick from the bank, all saved into a chapter-only table with its own grader.
 * That is a large part of why the same question could exist in four shapes.
 *
 * Authoring now lives in the Tests module. This dialog only chooses which
 * library test gates this chapter, and at what pass mark. The file name is kept
 * so the page's existing wiring and deep link (?testFile=) keep working.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Slider,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import TestBrowser, { type PickableTest } from '@/components/tests/TestBrowser';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface LinkedTest {
  placement_id: string;
  test_id: string;
  title: string;
  passing_pct: number;
  question_count: number;
  is_published: boolean;
}

/** The paper's own mock, as GET /api/question-bank/papers/[id]/test returns it. */
interface PaperTest {
  test_id: string;
  placement_id: string;
  title: string;
  question_count: number;
  passing_pct: number | null;
}

interface StudyTestAuthorDialogProps {
  open: boolean;
  file: {
    id: string;
    title: string;
    /** Set when this PDF is the source of a Question Bank paper: its own questions come first. */
    qb_paper?: { id: string; title: string; short_title: string } | null;
  } | null;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  onClose: () => void;
  onSaved: () => void;
  /** Hand this chapter to the generator instead of hunting the library for a test. */
  onGenerate?: (file: { id: string; title: string }) => void;
}

export default function StudyTestAuthorDialog({
  open,
  file,
  authFetch,
  onClose,
  onSaved,
  onGenerate,
}: StudyTestAuthorDialogProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [linked, setLinked] = useState<LinkedTest | null>(null);
  const [picked, setPicked] = useState<PickableTest | null>(null);
  const [passingPct, setPassingPct] = useState(70);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The linked paper's own mock, when this PDF is a Question Bank paper's
  // source. Loaded alongside the chapter's current link so the card below can
  // say "use this" or "generate one" without a second round trip on click.
  const [paperTest, setPaperTest] = useState<PaperTest | null>(null);
  const [paperTestLoading, setPaperTestLoading] = useState(false);

  useEffect(() => {
    if (!open || !file?.id) return;
    setPicked(null);
    setError(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch(`/api/study-materials/files/${file.id}/test`);
        if (cancelled) return;
        const current = (json?.test as LinkedTest) || null;
        setLinked(current);
        setPassingPct(current?.passing_pct ?? 70);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the current test');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file?.id, authFetch]);

  useEffect(() => {
    if (!open || !file?.qb_paper?.id) {
      setPaperTest(null);
      return;
    }
    const paperId = file.qb_paper.id;
    setPaperTestLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch(`/api/question-bank/papers/${paperId}/test`);
        if (!cancelled) setPaperTest((json?.data as PaperTest) || null);
      } catch {
        if (!cancelled) setPaperTest(null);
      } finally {
        if (!cancelled) setPaperTestLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, file?.qb_paper?.id, authFetch]);

  const questionCount = picked?.question_count ?? linked?.question_count ?? 0;
  const mustGetRight = questionCount > 0 ? Math.ceil((passingPct / 100) * questionCount) : 0;

  /** Link a test to this chapter by id, however it was chosen. Shared by the
   * library picker below and the paper card's shortcuts, so a failure is
   * reported the same way regardless of which path found the test. */
  async function linkTestId(testId: string, pct: number) {
    if (!file?.id) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch(`/api/study-materials/files/${file.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ test_id: testId, passing_pct: pct }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link the test');
    } finally {
      setBusy(false);
    }
  }

  const save = () => {
    const testId = picked?.id ?? linked?.test_id;
    if (testId) void linkTestId(testId, passingPct);
  };

  /** The paper already has a mock: attach the same test here rather than a second one. */
  const useThisPaperTest = () => {
    if (paperTest) void linkTestId(paperTest.test_id, paperTest.passing_pct ?? passingPct);
  };

  /** No mock yet: build one from the paper's own questions, then attach it here. */
  async function generateFromPaper() {
    if (!file?.qb_paper?.id) return;
    setBusy(true);
    setError(null);
    try {
      const json = await authFetch(`/api/question-bank/papers/${file.qb_paper.id}/test`, {
        method: 'POST',
        body: JSON.stringify({ generate: true }),
      });
      const testId = (json?.data as { test_id?: string })?.test_id;
      if (!testId) throw new Error('The paper has no active questions yet.');
      await linkTestId(testId, passingPct);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Could not generate the paper test');
    }
  }

  async function unlink() {
    if (!file?.id) return;
    setBusy(true);
    setError(null);
    try {
      await authFetch(`/api/study-materials/files/${file.id}/test`, { method: 'DELETE' });
      setLinked(null);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlink the test');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.0625rem' }}>Test for this chapter</Typography>
        <Typography variant="caption" color="text.secondary">
          {file?.title || 'Chapter'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <>
            {/* This PDF is a Question Bank paper's own source: its questions
                already exist, tagged and reviewed, so the paper's own test is
                the right one here rather than a second set written fresh from
                the raw PDF. */}
            {file?.qb_paper && (
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  mb: 2,
                  borderRadius: 1.5,
                  borderColor: 'primary.main',
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
                    Linked to {file.qb_paper.short_title}
                  </Typography>
                  <Button
                    size="small"
                    endIcon={<OpenInNewOutlinedIcon fontSize="small" />}
                    onClick={() => router.push(`/teacher/question-bank/papers/${file.qb_paper!.id}`)}
                    sx={{ textTransform: 'none', minHeight: 36 }}
                  >
                    Open the paper
                  </Button>
                </Box>

                {paperTestLoading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="caption" color="text.secondary">
                      Checking the paper&apos;s test...
                    </Typography>
                  </Box>
                ) : linked && paperTest && linked.test_id === paperTest.test_id ? (
                  <Alert severity="success" icon={<CheckCircleOutlinedIcon />} sx={{ mt: 1, py: 0.25 }}>
                    Already using the paper&apos;s own {paperTest.question_count} question
                    {paperTest.question_count === 1 ? '' : 's'}.
                  </Alert>
                ) : paperTest ? (
                  <Alert
                    severity="info"
                    sx={{ mt: 1 }}
                    action={
                      <Button
                        size="small"
                        variant="contained"
                        onClick={useThisPaperTest}
                        disabled={busy}
                        sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
                      >
                        {busy ? <CircularProgress size={16} color="inherit" /> : 'Use this test'}
                      </Button>
                    }
                  >
                    The paper already has a {paperTest.question_count}-question test. Use it here instead of
                    writing a second one.
                  </Alert>
                ) : (
                  <Alert
                    severity="info"
                    icon={<AutoAwesomeOutlinedIcon />}
                    sx={{ mt: 1 }}
                    action={
                      <Button
                        size="small"
                        variant="contained"
                        onClick={generateFromPaper}
                        disabled={busy}
                        sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
                      >
                        {busy ? <CircularProgress size={16} color="inherit" /> : 'Generate from the paper'}
                      </Button>
                    }
                  >
                    The paper has no test yet. Build it from the paper&apos;s own questions, not a fresh read
                    of this PDF.
                  </Alert>
                )}
              </Paper>
            )}

            {linked && (
              <Box
                sx={{
                  p: 1.5,
                  mb: 2,
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'success.main',
                  bgcolor: 'action.hover',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <QuizOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />
                  <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
                    {linked.title}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${linked.question_count} question${linked.question_count !== 1 ? 's' : ''}`}
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Currently linked. Pick another below to replace it.
                </Typography>
                {!linked.is_published && (
                  <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                    This test is still a draft, so students cannot see it. Publish it in Tests.
                  </Alert>
                )}
              </Box>
            )}

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              {linked ? 'Choose a different test' : 'Choose a test'}
            </Typography>

            <TestBrowser
              getToken={getToken}
              value={picked}
              onChange={setPicked}
              resetToken={open ? file?.id : null}
              maxListHeight={260}
              onBuildNew={() => router.push('/teacher/tests/new?src=json')}
            />

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
              Pass mark
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Slider
                value={passingPct}
                onChange={(_e, v) => setPassingPct(v as number)}
                min={10}
                max={100}
                step={5}
                marks={[{ value: 50 }, { value: 70 }, { value: 90 }]}
                valueLabelDisplay="auto"
                sx={{ flex: 1 }}
                aria-label="Pass mark percentage"
              />
              <Typography sx={{ fontWeight: 800, minWidth: 52, textAlign: 'right' }}>{passingPct}%</Typography>
            </Box>
            {questionCount > 0 && (
              <Alert severity="info" icon={false} sx={{ mt: 1, py: 0.25 }}>
                <Typography variant="caption">
                  {questionCount} question{questionCount === 1 ? '' : 's'}, so a pass means getting{' '}
                  <strong>
                    {mustGetRight} of {questionCount}
                  </strong>{' '}
                  right. Passing marks the chapter complete.
                </Typography>
              </Alert>
            )}

            {/* This used to read "Import a test from this chapter PDF in Tests,
                then come back and link it here", which described a five-step
                round trip through another module as though it were help. The
                generator does the whole thing from the chapter that is already
                open, so the advice became a button. */}
            {!linked && !picked && !file?.qb_paper && onGenerate && (
              <Alert
                severity="info"
                icon={<AutoAwesomeOutlinedIcon />}
                sx={{ mt: 2 }}
                action={
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => file && onGenerate({ id: file.id, title: file.title })}
                    sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
                  >
                    Add a test
                  </Button>
                }
              >
                Nothing suitable in the library? Write one from this chapter PDF, or upload questions you already
                have.
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
        {linked && (
          <Button
            color="error"
            startIcon={<LinkOffOutlinedIcon />}
            onClick={unlink}
            disabled={busy}
            sx={{ textTransform: 'none', minHeight: 44, mr: 'auto' }}
          >
            Unlink
          </Button>
        )}
        <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={busy || (!picked && !linked)}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          {busy ? <CircularProgress size={18} /> : picked ? 'Link this test' : 'Save pass mark'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
