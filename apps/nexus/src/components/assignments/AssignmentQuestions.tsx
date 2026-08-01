'use client';

/**
 * Where a student answers an assignment's questions, and sees how they did.
 *
 * Three states, and which one shows is decided by the server, not here:
 *
 *  1. Waiting for the working. The assignment wants a PDF and none is in yet,
 *     so the questions are visible but unanswerable. Results are instant, so
 *     letting anyone answer first would show them the correct values before
 *     they wrote the working that is supposed to prove they knew them.
 *  2. Answering. One shot. Said plainly before they commit, not after.
 *  3. Answered. Right, wrong, the correct answer and the explanation, at once.
 *
 * The answering controls are AnswerInput, the same component the test player
 * uses, so an MCQ behaves identically wherever a student meets one.
 */
import { useMemo, useState } from 'react';
import { Box, Stack, Typography, Button, Chip, alpha, useTheme } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import MathText from '@/components/common/MathText';
import AnswerInput from '@/components/tests/AnswerInput';

export interface PaperQuestion {
  id: string;
  question_text: string;
  question_image_url: string | null;
  format: 'MCQ' | 'NUMERICAL' | 'SUBJECTIVE';
  options: { key: string; text: string }[];
  marks: number;
  correct_answer?: string | null;
  explanation?: string | null;
}

export interface PaperView {
  questions: PaperQuestion[];
  auto_marks: number;
  manual_marks: number;
  total_marks: number;
}

interface AssignmentQuestionsProps {
  paper: PaperView;
  /** True once this student's answers are in. Answers are one-shot. */
  locked: boolean;
  myAnswers: Record<string, string> | null;
  myResult: { score: number; total_marks: number; percentage: number } | null;
  /** The assignment wants a PDF and the student has not uploaded one yet. */
  awaitingPdf: boolean;
  busy?: boolean;
  onSubmit: (answers: Record<string, string>) => Promise<void>;
}

export default function AssignmentQuestions({
  paper,
  locked,
  myAnswers,
  myResult,
  awaitingPdf,
  busy = false,
  onSubmit,
}: AssignmentQuestionsProps) {
  const theme = useTheme();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const answerable = paper.questions.filter((q) => q.format !== 'SUBJECTIVE');
  const answeredCount = answerable.filter((q) => (answers[q.id] ?? '').trim() !== '').length;
  const shown = locked ? myAnswers || {} : answers;

  const verdicts = useMemo(() => {
    if (!locked) return {} as Record<string, boolean | null>;
    const out: Record<string, boolean | null> = {};
    for (const q of paper.questions) {
      if (q.format === 'SUBJECTIVE' || q.correct_answer == null) {
        out[q.id] = null;
        continue;
      }
      const given = (myAnswers || {})[q.id];
      if (given == null) {
        out[q.id] = false;
        continue;
      }
      if (q.format === 'MCQ') {
        out[q.id] = given.trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase();
      } else {
        const a = Number(given);
        const b = Number(q.correct_answer);
        out[q.id] =
          Number.isFinite(a) && Number.isFinite(b)
            ? Math.abs(a - b) < 1e-9
            : given.replace(/\s+/g, '').toLowerCase() ===
              String(q.correct_answer).replace(/\s+/g, '').toLowerCase();
      }
    }
    return out;
  }, [locked, paper.questions, myAnswers]);

  const submit = async () => {
    setError('');
    try {
      await onSubmit(answers);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your answers. Please try again.');
      setConfirming(false);
    }
  };

  if (!paper.questions.length) return null;

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.5 }}
        flexWrap="wrap"
        useFlexGap
      >
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Questions
        </Typography>
        {locked && myResult ? (
          <Chip
            size="small"
            label={`${myResult.score} / ${myResult.total_marks} from your answers`}
            sx={{
              fontWeight: 700,
              bgcolor: alpha(theme.palette.success.main, 0.14),
              color: 'success.dark',
            }}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            {answerable.length} to answer
            {paper.manual_marks > 0 && `, ${paper.manual_marks} marks from your working`}
          </Typography>
        )}
      </Stack>

      {awaitingPdf && !locked && (
        <Box
          role="status"
          sx={{
            p: 1.5,
            mb: 1.5,
            borderRadius: 2,
            display: 'flex',
            gap: 1.25,
            alignItems: 'flex-start',
            bgcolor: alpha('#B8860B', 0.1),
            border: `1px solid ${alpha('#B8860B', 0.3)}`,
          }}
        >
          <EditNoteOutlinedIcon sx={{ color: '#8a6100', fontSize: 20, mt: '1px' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#8a6100' }}>
              Upload your working first
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Submit your solutions as a PDF, then these questions open up and you will see your
              result straight away.
            </Typography>
          </Box>
        </Box>
      )}

      <Stack spacing={1.5}>
        {paper.questions.map((q, i) => {
          const verdict = verdicts[q.id];
          const borderColour =
            !locked || verdict == null
              ? theme.palette.divider
              : verdict
                ? alpha(theme.palette.success.main, 0.5)
                : alpha(theme.palette.error.main, 0.5);

          return (
            <Box
              key={q.id}
              sx={{
                p: { xs: 1.75, sm: 2 },
                borderRadius: 2,
                border: '1px solid',
                borderColor: borderColour,
                bgcolor: 'background.paper',
              }}
            >
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 1 }}>
                <Box
                  sx={{
                    flexShrink: 0,
                    px: 1,
                    minWidth: 34,
                    height: 24,
                    borderRadius: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: 'primary.main',
                  }}
                >
                  Q{i + 1}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <MathText text={q.question_text} variant="body2" sx={{ lineHeight: 1.6 }} />
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                  {locked && verdict === true && (
                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} aria-label="Correct" />
                  )}
                  {locked && verdict === false && (
                    <CancelIcon sx={{ color: 'error.main', fontSize: 20 }} aria-label="Wrong" />
                  )}
                  <Chip
                    size="small"
                    label={`${q.marks}`}
                    sx={{
                      height: 22,
                      minWidth: 30,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      bgcolor: alpha(theme.palette.text.primary, 0.06),
                      color: 'text.secondary',
                    }}
                  />
                </Stack>
              </Stack>

              {q.question_image_url && (
                <Box
                  component="img"
                  src={q.question_image_url}
                  alt=""
                  sx={{ width: '100%', borderRadius: 2, mb: 1.5, border: '1px solid', borderColor: 'divider' }}
                />
              )}

              {q.format === 'SUBJECTIVE' ? (
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Answer this one in your uploaded working. Your teacher marks it.
                </Typography>
              ) : locked ? (
                <Stack spacing={0.75}>
                  <Typography variant="body2">
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      You answered:{' '}
                    </Box>
                    <Box component="span" sx={{ fontWeight: 700 }}>
                      {formatAnswer(q, shown[q.id])}
                    </Box>
                  </Typography>
                  {verdict === false && (
                    <Typography variant="body2" sx={{ color: 'success.dark' }}>
                      Correct answer:{' '}
                      <Box component="span" sx={{ fontWeight: 700 }}>
                        {formatAnswer(q, q.correct_answer ?? undefined)}
                      </Box>
                    </Typography>
                  )}
                  {q.explanation && (
                    <Box sx={{ mt: 0.5, p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover' }}>
                      <MathText text={q.explanation} variant="body2" />
                    </Box>
                  )}
                </Stack>
              ) : (
                <AnswerInput
                  question={{ question_id: q.id, question_format: q.format, options: q.options }}
                  value={answers[q.id] ?? null}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                  disabled={awaitingPdf || busy}
                />
              )}
            </Box>
          );
        })}
      </Stack>

      {!locked && answerable.length > 0 && (
        <Box sx={{ mt: 2 }}>
          {error && (
            <Typography role="alert" color="error" variant="body2" sx={{ mb: 1 }}>
              {error}
            </Typography>
          )}

          {confirming ? (
            <Box
              sx={{
                p: 1.75,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.warning.main, 0.1),
                border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Send these answers?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                {answeredCount < answerable.length
                  ? `You have answered ${answeredCount} of ${answerable.length}. Unanswered questions score nothing.`
                  : 'You cannot change them afterwards.'}
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  variant="contained"
                  onClick={submit}
                  disabled={busy}
                  sx={{ minHeight: 48, textTransform: 'none', flex: 1 }}
                >
                  {busy ? 'Sending…' : 'Yes, send them'}
                </Button>
                <Button
                  variant="text"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  sx={{ minHeight: 48, textTransform: 'none' }}
                >
                  Keep working on it
                </Button>
              </Stack>
            </Box>
          ) : (
            <>
              <Button
                variant="contained"
                fullWidth
                startIcon={<LockOutlinedIcon />}
                disabled={awaitingPdf || busy || answeredCount === 0}
                onClick={() => setConfirming(true)}
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                Submit answers
              </Button>
              {/* Said before the tap, not in a dialog after it. */}
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.75, textAlign: 'center' }}
              >
                Answers are final once sent, and you will see your result right away.
              </Typography>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Show an MCQ answer as its option text, not the bare letter a student never saw. */
function formatAnswer(q: PaperQuestion, value: string | null | undefined): string {
  if (value == null || value === '') return 'nothing';
  if (q.format === 'MCQ') {
    const opt = q.options.find((o) => o.key.toLowerCase() === String(value).toLowerCase());
    return opt ? `${opt.key.toUpperCase()}. ${opt.text}` : String(value).toUpperCase();
  }
  return String(value);
}
