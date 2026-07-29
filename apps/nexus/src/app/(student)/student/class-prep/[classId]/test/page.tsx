'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import MathText from '@/components/common/MathText';
import AnswerInput from '@/components/tests/AnswerInput';

interface PrepQuestion {
  question_id: string;
  question_text: string | null;
  question_image_url: string | null;
  question_format: string;
  options: unknown;
  marks: number;
}

interface Paper {
  test_id: string;
  questions: PrepQuestion[];
  passing_pct: number;
  question_count: number;
  must_get_right: number;
  attempt_number: number;
  best_pct: number | null;
  passed: boolean;
}

interface Result {
  percentage: number;
  passed: boolean;
  passing_pct: number | null;
  best_pct: number | null;
  total_attempts: number;
  unlocked: boolean;
  review: {
    question_id: string;
    correct_answer: string | null;
    selected: string | null;
    is_correct: boolean;
    is_gradable: boolean;
  }[];
}

/**
 * The prep test, one question per screen.
 *
 * Structured like the catch-up test page, with one deliberate difference: a real
 * "Try again" button. The catch-up test hides retry because failing there sends
 * you back to rewatch the recording. Here the rule is retry until you pass, so
 * hiding it would be a lie about what happens next.
 */
export default function ClassPrepTestPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const classId = String(params?.classId || '');
  const { getToken } = useNexusAuthContext();

  const [paper, setPaper] = useState<Paper | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/student/class-prep/${classId}/test`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'Could not load the test');
        return;
      }
      setPaper(d);
      setAnswers({});
      setIndex(0);
      setResult(null);
    } catch {
      setError('Could not load the test');
    } finally {
      setLoading(false);
    }
  }, [classId, getToken]);

  useEffect(() => {
    if (classId) load();
  }, [classId, load]);

  const submit = async () => {
    if (!paper) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/student/class-prep/${classId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'Could not submit your answers');
        return;
      }
      setResult(d);
    } catch {
      setError('Could not submit your answers');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !paper) {
    return (
      <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button onClick={() => router.push('/student/timetable')} sx={{ textTransform: 'none', minHeight: 48 }}>
          Back to my timetable
        </Button>
      </Box>
    );
  }

  // ── Result screen ────────────────────────────────────────────────────────
  if (result) {
    const passed = result.passed;
    return (
      <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
        <Box
          sx={{
            textAlign: 'center',
            py: 4,
            px: 2,
            borderRadius: 3,
            bgcolor: alpha(passed ? theme.palette.success.main : theme.palette.warning.main, 0.1),
          }}
        >
          <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
            {Math.round(result.percentage)}%
          </Typography>
          <Typography sx={{ fontWeight: 700, mt: 1, color: passed ? 'success.dark' : 'warning.dark' }}>
            {passed ? 'Passed. You can join the class.' : `Not quite. You need ${result.passing_pct}%.`}
          </Typography>
          {/* Attempt count stated plainly rather than hidden. It is recorded and
              the teacher sees it, so pretending otherwise would be dishonest. */}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Attempt {result.total_attempts}
            {result.best_pct != null && result.best_pct > result.percentage
              ? `, your best is ${Math.round(result.best_pct)}%`
              : ''}
          </Typography>
        </Box>

        {!passed && (
          <Alert severity="info" sx={{ mt: 2 }}>
            You can take this as many times as you need. Look at what you missed below, then try again.
          </Alert>
        )}

        {/* Review. Shown on a pass too: getting 8 of 10 and never learning which
            two were wrong is the version of this screen nobody learns from. */}
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(paper?.questions || []).map((q, i) => {
            const r = result.review.find((x) => x.question_id === q.question_id);
            if (!r) return null;
            return (
              <Box
                key={q.question_id}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: `1px solid ${theme.palette.divider}`,
                  borderLeft: `4px solid ${r.is_correct ? theme.palette.success.main : theme.palette.error.main}`,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  Question {i + 1}, {r.is_correct ? 'correct' : 'wrong'}
                </Typography>
                <Box sx={{ mt: 0.5, fontSize: '0.875rem' }}>
                  <MathText text={q.question_text || ''} />
                </Box>
                {!r.is_correct && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.75 }}>
                    You put <strong>{r.selected || 'nothing'}</strong>, the answer is{' '}
                    <strong>{r.correct_answer}</strong>
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
          {!passed && (
            <Button
              variant="contained"
              startIcon={<ReplayOutlinedIcon />}
              onClick={load}
              sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
            >
              Try again
            </Button>
          )}
          <Button
            variant={passed ? 'contained' : 'outlined'}
            onClick={() => router.push('/student/timetable')}
            sx={{ textTransform: 'none', minHeight: 48, flex: 1 }}
          >
            {passed ? 'Back to the class' : 'Later'}
          </Button>
        </Box>
      </Box>
    );
  }

  // ── Taking it ────────────────────────────────────────────────────────────
  const questions = paper?.questions || [];
  const current = questions[index];
  const answeredCount = Object.keys(answers).filter((k) => answers[k]?.trim()).length;
  const isLast = index === questions.length - 1;

  if (!current) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">This test has no questions yet.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', pb: 12 }}>
      {/* Sticky progress. On a phone the student needs to know how much is left
          without scrolling back up. */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.default', pt: 1.5, px: 2, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Button
            onClick={() => router.push('/student/timetable')}
            sx={{ minWidth: 44, minHeight: 44, color: 'text.secondary' }}
            aria-label="Leave the test"
          >
            <ArrowBackIosNewIcon fontSize="small" />
          </Button>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Question {index + 1} of {questions.length}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Pass by getting {paper?.must_get_right} of {questions.length} right
            </Typography>
          </Box>
        </Box>
        <LinearProgress
          variant="determinate"
          value={(answeredCount / questions.length) * 100}
          sx={{ height: 6, borderRadius: 3 }}
        />
      </Box>

      <Box sx={{ px: 2, pt: 2 }}>
        <Box sx={{ fontSize: '1rem', lineHeight: 1.6, mb: 2 }}>
          <MathText text={current.question_text || ''} />
        </Box>
        {current.question_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.question_image_url}
            alt=""
            style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 16 }}
          />
        )}

        <AnswerInput
          question={current}
          value={answers[current.question_id] ?? null}
          onChange={(v) => setAnswers((prev) => ({ ...prev, [current.question_id]: v }))}
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Box>

      {/* Sticky action bar, thumb reachable. */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          display: 'flex',
          gap: 1,
          bgcolor: 'background.paper',
          borderTop: `1px solid ${theme.palette.divider}`,
          zIndex: 3,
        }}
      >
        <Button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          Back
        </Button>
        {isLast ? (
          <Button
            fullWidth
            variant="contained"
            onClick={submit}
            disabled={submitting}
            startIcon={submitting ? undefined : <CheckCircleOutlinedIcon />}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            {submitting ? <CircularProgress size={20} /> : `Submit ${answeredCount} of ${questions.length}`}
          </Button>
        ) : (
          <Button
            fullWidth
            variant="contained"
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            sx={{ textTransform: 'none', minHeight: 48 }}
          >
            Next
          </Button>
        )}
      </Box>
    </Box>
  );
}
