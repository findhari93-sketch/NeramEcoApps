'use client';

/**
 * One screen showing who got what right.
 *
 * The teacher's existing view answers "who handed in", one student at a time.
 * That was fine when every answer was read by hand, but once the machine marks
 * the objective half the useful question changes to "which question did the
 * class not understand", and no per-student view answers it.
 *
 * So both axes are here: students down, questions across. A column that is
 * mostly red is a question to reteach, not twenty students to chase.
 *
 * The grid scrolls inside its own container, never the page. A wide class list
 * on a phone must not push the whole layout sideways.
 */
import { useMemo } from 'react';
import { Box, Stack, Typography, Chip, Tooltip, alpha, useTheme } from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import MathText from '@/components/common/MathText';

export interface ResultsQuestion {
  id: string;
  question_text: string;
  format: string;
  marks: number;
  correct_answer?: string | null;
}

export interface ResultsRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  answers: { score: number; total_marks: number; percentage: number; answers: Record<string, string> } | null;
}

interface AssignmentResultsGridProps {
  questions: ResultsQuestion[];
  rows: ResultsRow[];
}

type Verdict = 'right' | 'wrong' | 'manual' | 'none';

function verdictFor(q: ResultsQuestion, answers: Record<string, string> | undefined): Verdict {
  if (q.format === 'SUBJECTIVE' || q.correct_answer == null) return 'manual';
  const given = answers?.[q.id];
  if (given == null || given === '') return 'none';
  if (q.format === 'MCQ') {
    return given.trim().toLowerCase() === String(q.correct_answer).trim().toLowerCase()
      ? 'right'
      : 'wrong';
  }
  const a = Number(given);
  const b = Number(q.correct_answer);
  if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 1e-9 ? 'right' : 'wrong';
  return given.replace(/\s+/g, '').toLowerCase() ===
    String(q.correct_answer).replace(/\s+/g, '').toLowerCase()
    ? 'right'
    : 'wrong';
}

export default function AssignmentResultsGrid({ questions, rows }: AssignmentResultsGridProps) {
  const theme = useTheme();

  const answered = useMemo(() => rows.filter((r) => r.answers), [rows]);

  /** Per question: how many got it right, out of how many answered it. */
  const perQuestion = useMemo(
    () =>
      questions.map((q) => {
        let right = 0;
        let counted = 0;
        for (const row of answered) {
          const v = verdictFor(q, row.answers?.answers);
          if (v === 'manual') continue;
          counted += 1;
          if (v === 'right') right += 1;
        }
        return { id: q.id, right, counted, pct: counted ? Math.round((right / counted) * 100) : null };
      }),
    [questions, answered],
  );

  if (!questions.length) return null;

  if (!answered.length) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
        <Typography variant="body2" color="text.secondary">
          Nobody has answered the questions yet. Results appear here as they come in.
        </Typography>
      </Box>
    );
  }

  const cellColour = (v: Verdict) => {
    if (v === 'right') return alpha(theme.palette.success.main, 0.16);
    if (v === 'wrong') return alpha(theme.palette.error.main, 0.14);
    if (v === 'none') return alpha(theme.palette.text.primary, 0.05);
    return 'transparent';
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {answered.length} of {rows.length} answered
        </Typography>
        <Chip
          size="small"
          icon={<CheckIcon sx={{ fontSize: '0.9rem !important' }} />}
          label="Right"
          sx={{ height: 22, fontSize: '0.7rem', bgcolor: alpha(theme.palette.success.main, 0.16) }}
        />
        <Chip
          size="small"
          icon={<CloseIcon sx={{ fontSize: '0.9rem !important' }} />}
          label="Wrong"
          sx={{ height: 22, fontSize: '0.7rem', bgcolor: alpha(theme.palette.error.main, 0.14) }}
        />
        <Chip
          size="small"
          icon={<PersonOutlineIcon sx={{ fontSize: '0.9rem !important' }} />}
          label="You mark"
          sx={{ height: 22, fontSize: '0.7rem' }}
        />
      </Stack>

      {/* Per-question summary first: it is the reason this screen exists. */}
      <Stack spacing={0.75} sx={{ mb: 2 }}>
        {questions.map((q, i) => {
          const stat = perQuestion[i];
          const weak = stat.pct != null && stat.pct < 50;
          return (
            <Stack
              key={q.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{
                p: 1,
                borderRadius: 1.5,
                bgcolor: weak ? alpha(theme.palette.error.main, 0.06) : 'transparent',
                border: '1px solid',
                borderColor: weak ? alpha(theme.palette.error.main, 0.2) : 'divider',
              }}
            >
              <Box
                sx={{
                  flexShrink: 0,
                  px: 0.75,
                  minWidth: 30,
                  height: 22,
                  borderRadius: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                  color: 'primary.main',
                }}
              >
                Q{i + 1}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <MathText
                  text={q.question_text.slice(0, 120)}
                  variant="caption"
                  sx={{ display: 'block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
                />
              </Box>
              {stat.pct == null ? (
                <Chip size="small" label="You mark" sx={{ height: 20, fontSize: '0.65rem', flexShrink: 0 }} />
              ) : (
                <Chip
                  size="small"
                  label={`${stat.right}/${stat.counted} right`}
                  sx={{
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    bgcolor: weak
                      ? alpha(theme.palette.error.main, 0.16)
                      : alpha(theme.palette.success.main, 0.16),
                    color: weak ? 'error.dark' : 'success.dark',
                  }}
                />
              )}
            </Stack>
          );
        })}
      </Stack>

      {/* The matrix. Its own scroll container, so the page never moves. */}
      <Box sx={{ overflowX: 'auto', pb: 1 }}>
        <Box sx={{ minWidth: 220 + questions.length * 46 }}>
          <Stack
            direction="row"
            spacing={0}
            sx={{ position: 'sticky', top: 0, bgcolor: 'background.paper', zIndex: 1 }}
          >
            <Box sx={{ width: 180, flexShrink: 0, px: 1, py: 0.75 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                Student
              </Typography>
            </Box>
            {questions.map((_, i) => (
              <Box key={i} sx={{ width: 46, flexShrink: 0, textAlign: 'center', py: 0.75 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                  Q{i + 1}
                </Typography>
              </Box>
            ))}
            <Box sx={{ width: 60, flexShrink: 0, textAlign: 'center', py: 0.75 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                Score
              </Typography>
            </Box>
          </Stack>

          <Stack spacing={0.5}>
            {rows.map((row) => (
              <Stack key={row.student.id} direction="row" alignItems="center">
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ width: 180, flexShrink: 0, px: 1, minWidth: 0 }}
                >
                  <StudentAvatar
                    userId={row.student.id}
                    src={row.student.avatar_url}
                    name={row.student.name}
                    size={24}
                    tapToView={false}
                    sx={{ fontSize: '0.7rem' }}
                  />
                  <Typography variant="caption" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {row.student.name || row.student.email || 'Student'}
                  </Typography>
                </Stack>

                {questions.map((q) => {
                  const v = row.answers ? verdictFor(q, row.answers.answers) : 'none';
                  const given = row.answers?.answers?.[q.id];
                  return (
                    <Box key={q.id} sx={{ width: 46, flexShrink: 0, px: 0.25 }}>
                      <Tooltip title={given ? `Answered: ${given}` : 'No answer'}>
                        <Box
                          sx={{
                            height: 30,
                            borderRadius: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: cellColour(v),
                          }}
                        >
                          {v === 'right' && <CheckIcon sx={{ fontSize: 16, color: 'success.dark' }} />}
                          {v === 'wrong' && <CloseIcon sx={{ fontSize: 16, color: 'error.dark' }} />}
                          {v === 'manual' && (
                            <PersonOutlineIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
                          )}
                          {v === 'none' && <RemoveIcon sx={{ fontSize: 15, color: 'text.disabled' }} />}
                        </Box>
                      </Tooltip>
                    </Box>
                  );
                })}

                <Box sx={{ width: 60, flexShrink: 0, textAlign: 'center' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {row.answers ? `${row.answers.score}/${row.answers.total_marks}` : '-'}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
