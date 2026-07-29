'use client';

/**
 * The class test on a catch-up backlog item. Pass it at 85% and the class is
 * cleared.
 *
 * A page rather than the shared QuizModal: that modal is a drawer built to
 * interrupt a video for two or three checkpoint questions, and a fifteen
 * question exam read through a drawer on a phone is miserable. Mobile gets one
 * question per screen with a sticky submit bar; desktop stacks them.
 *
 * The failure state is the part that matters. It is amber rather than red, it
 * shows every question with the right answer and why, and it offers exactly ONE
 * way forward: back into the recording. There is deliberately no "try again"
 * button, because the server would refuse it. Never render a button that cannot
 * work.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Radio,
  RadioGroup,
  FormControlLabel,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';
import AnswerInput from '@/components/tests/AnswerInput';

interface Question {
  question_id: string;
  question_text: string | null;
  /**
   * Normalised uppercase by getComposedTestQuestions. It was missing from this
   * interface entirely, which is how a NUMERICAL question ended up rendering its
   * text and no way at all to answer it.
   */
  question_format?: string | null;
  options: Array<{ id: string; text: string }> | null;
  marks: number;
}

interface TestMeta {
  id: string;
  placement_id: string;
  passing_pct: number;
  question_count: number;
  must_get_right: number;
}

interface GradeResult {
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  passing_pct: number | null;
  review: Array<{
    question_id: string;
    correct_answer: string | null;
    selected: string | null;
    is_correct: boolean;
  }>;
}

export default function CatchUpTestPage() {
  const { classId } = useParams<{ classId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();

  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<TestMeta | null>(null);
  const [recapId, setRecapId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/student/catchup-journey/${classId}/test`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json();
      if (res.status === 403 && body.error === 'TEST_LOCKED') {
        setLocked(body.message || 'Finish the guided recap to unlock this test.');
        return;
      }
      if (!res.ok) {
        setError(body.error || 'Could not load this test.');
        return;
      }
      setMeta(body.test);
      setRecapId(body.recap_id ?? null);
      setQuestions(body.questions || []);
    } catch {
      setError('Could not load this test.');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/student/catchup-journey/${classId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || body.error || 'Could not submit.');
        return;
      }
      setResult(body);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Could not submit.');
    } finally {
      setSubmitting(false);
    }
  }, [answers, classId, getToken]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (locked) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: 6, textAlign: 'center' }}>
        <LockOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1.5 }} />
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          The test is locked
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {locked}
        </Typography>
        <Button
          variant="contained"
          onClick={() =>
            router.push(
              recapId
                ? `/student/class-recap/${recapId}?rewatch=1`
                : `/student/timetable/${classId}/catch-up`,
            )
          }
          sx={{ minHeight: 48, textTransform: 'none', borderRadius: RADIUS.control }}
        >
          Go to the class
        </Button>
      </Box>
    );
  }

  if (error && !result) {
    return (
      <Box sx={{ maxWidth: 560, mx: 'auto', px: 2, py: 6 }}>
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>
          {error}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/student/catch-up')}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Back to your catch-up list
        </Button>
      </Box>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (result) {
    const pass = result.passed;
    const byQuestion = new Map(result.review.map((r) => [r.question_id, r]));
    return (
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, md: 0 }, pb: 8 }}>
        <Box
          sx={{
            p: 2.5,
            mb: 2.5,
            borderRadius: RADIUS.card,
            border: '1.5px solid',
            borderColor: pass ? alpha(theme.palette.success.main, 0.5) : alpha(theme.palette.warning.main, 0.5),
            bgcolor: pass
              ? alpha(theme.palette.success.main, 0.06)
              : alpha(theme.palette.warning.main, 0.08),
            boxShadow: SHADOW.card,
          }}
        >
          {pass ? (
            <>
              <CheckCircleIcon sx={{ fontSize: 34, color: 'success.main', mb: 0.5 }} />
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                You scored {Math.round(result.percentage)}%
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                This class is done. It is off your catch-up list.
              </Typography>
              <Button
                variant="contained"
                onClick={() => router.push('/student/catch-up')}
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.control }}
              >
                Next class
              </Button>
            </>
          ) : (
            <>
              <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.25 }}>
                You need {result.passing_pct ?? meta?.passing_pct}%. You got {Math.round(result.percentage)}%.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Go back through the class and try again. The test unlocks again when you finish the
                rewatch.
              </Typography>
              {/* One way forward. A "try again" button here would be refused by
                  the server, so it is not offered. */}
              <Button
                variant="contained"
                color="warning"
                startIcon={<ReplayIcon />}
                onClick={() =>
                  router.push(
                    recapId
                      ? `/student/class-recap/${recapId}?rewatch=1`
                      : `/student/timetable/${classId}/catch-up`,
                  )
                }
                sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.control }}
              >
                Rewatch the class
              </Button>
            </>
          )}
        </Box>

        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 800,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            mb: 1,
          }}
        >
          Where you went wrong
        </Typography>

        <Stack spacing={1.5}>
          {questions.map((q, i) => {
            const r = byQuestion.get(q.question_id);
            return (
              <Box
                key={q.question_id}
                sx={{
                  p: 1.75,
                  borderRadius: RADIUS.control,
                  border: '1px solid',
                  borderColor: r?.is_correct
                    ? alpha(theme.palette.success.main, 0.4)
                    : alpha(theme.palette.error.main, 0.35),
                  bgcolor: 'background.paper',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, fontSize: '0.88rem' }}>
                  <Box component="span" sx={{ color: 'primary.main', mr: 0.5 }}>
                    Q{i + 1}.
                  </Box>
                  {q.question_text}
                </Typography>
                <Stack spacing={0.5}>
                  {(q.options || []).map((o) => {
                    const isRight = r?.correct_answer === o.id;
                    const isPicked = r?.selected === o.id;
                    return (
                      <Typography
                        key={o.id}
                        variant="body2"
                        sx={{
                          fontSize: '0.83rem',
                          px: 1.25,
                          py: 0.6,
                          borderRadius: 1.5,
                          fontWeight: isRight ? 700 : 400,
                          bgcolor: isRight
                            ? alpha(theme.palette.success.main, 0.1)
                            : isPicked
                              ? alpha(theme.palette.error.main, 0.08)
                              : 'transparent',
                          color: isRight ? 'success.dark' : isPicked ? 'error.dark' : 'text.secondary',
                        }}
                      >
                        {o.text}
                        {isRight ? '  (correct)' : isPicked ? '  (you picked this)' : ''}
                      </Typography>
                    );
                  })}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </Box>
    );
  }

  // ── Taking the test ───────────────────────────────────────────────────────
  const visible = isMobile ? questions.slice(cursor, cursor + 1) : questions;

  const renderQuestion = (q: Question, index: number) => (
    <Box key={q.question_id} sx={{ mb: 3 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, lineHeight: 1.4, fontSize: '0.9rem' }}>
        <Box component="span" sx={{ color: 'primary.main', mr: 0.5 }}>
          Q{index + 1}.
        </Box>
        {q.question_text}
      </Typography>
      {/* A numerical question gets a numeric keypad instead of option cards.
          Without this branch it rendered its text and nothing else, so a paper
          containing one was unanswerable and the student could not tell why. */}
      {String(q.question_format || '').toUpperCase() === 'NUMERICAL' ? (
        <AnswerInput
          question={{ question_id: q.question_id, question_format: 'NUMERICAL' }}
          value={answers[q.question_id] ?? null}
          onChange={(v) => setAnswers((prev) => ({ ...prev, [q.question_id]: v }))}
        />
      ) : (
      <RadioGroup
        value={answers[q.question_id] || ''}
        onChange={(e) => setAnswers((prev) => ({ ...prev, [q.question_id]: e.target.value }))}
      >
        {(q.options || []).map((opt) => {
          const selected = answers[q.question_id] === opt.id;
          return (
            <FormControlLabel
              key={opt.id}
              value={opt.id}
              control={<Radio size="small" />}
              label={
                <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: selected ? 500 : 400 }}>
                  {opt.text}
                </Typography>
              }
              sx={{
                mx: 0,
                mb: 0.75,
                py: 0.75,
                px: 1.5,
                borderRadius: 2,
                width: '100%',
                minHeight: 48,
                transition: 'all 150ms ease',
                border: `1px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
                bgcolor: selected ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
                '&:hover': {
                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                  borderColor: alpha(theme.palette.primary.main, 0.3),
                },
              }}
            />
          );
        })}
      </RadioGroup>
      )}
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, md: 0 }, pb: { xs: 14, md: 6 } }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.push('/student/catch-up')}
        sx={{ textTransform: 'none', minHeight: 44, ml: -1, mb: 1, color: 'text.secondary' }}
      >
        Back
      </Button>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: 'wrap' }} useFlexGap>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Class test
        </Typography>
        {meta && (
          <Chip
            size="small"
            label={`${meta.passing_pct}% to pass`}
            sx={{ fontWeight: 700, bgcolor: alpha(theme.palette.primary.main, 0.1), color: 'primary.dark' }}
          />
        )}
      </Stack>
      {meta && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {meta.question_count} questions. You need {meta.must_get_right} right.
        </Typography>
      )}

      <LinearProgress
        variant="determinate"
        value={questions.length ? Math.round((answeredCount / questions.length) * 100) : 0}
        sx={{ height: 6, borderRadius: 99, mb: 2.5 }}
      />

      {isMobile && (
        <Typography
          sx={{
            fontSize: '0.6875rem',
            fontWeight: 800,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'text.secondary',
            mb: 1,
          }}
        >
          {cursor + 1} of {questions.length}
        </Typography>
      )}

      {visible.map((q) => renderQuestion(q, isMobile ? cursor : questions.indexOf(q)))}

      {isMobile ? (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 64,
            px: 2,
            py: 1.25,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            zIndex: 20,
          }}
        >
          <Button
            variant="outlined"
            disabled={cursor === 0}
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
            sx={{ minHeight: 48, textTransform: 'none', flex: 1, borderRadius: RADIUS.control }}
          >
            Back
          </Button>
          {cursor < questions.length - 1 ? (
            <Button
              variant="contained"
              onClick={() => setCursor((c) => Math.min(questions.length - 1, c + 1))}
              sx={{ minHeight: 48, textTransform: 'none', flex: 2, borderRadius: RADIUS.control }}
            >
              Next
            </Button>
          ) : (
            <Button
              variant="contained"
              disabled={!allAnswered || submitting}
              onClick={submit}
              sx={{ minHeight: 48, textTransform: 'none', flex: 2, fontWeight: 700, borderRadius: RADIUS.control }}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </Button>
          )}
        </Box>
      ) : (
        <Button
          variant="contained"
          disabled={!allAnswered || submitting}
          onClick={submit}
          sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700, borderRadius: RADIUS.control, px: 4 }}
        >
          {submitting ? 'Submitting...' : 'Submit the test'}
        </Button>
      )}

      {!allAnswered && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Answer all {questions.length} questions to submit. {answeredCount} done.
        </Typography>
      )}
    </Box>
  );
}
