'use client';

/**
 * One student's response sheet: every attempt they sat, question by question,
 * what they answered and what was correct.
 *
 * Before this, a teacher watching a student pass a test could see one number, a
 * best score. Nothing showed what they actually answered, or let a teacher tell
 * a lucky guess from real understanding, or see a student who failed twice
 * before passing on the third try. Prev/next walks the same roster the teacher
 * was just looking at, so checking a class does not mean reopening this sheet
 * from scratch for each student.
 *
 * Lives under components/tests rather than components/study-materials because
 * it is no longer about chapters: the chapter report and the teacher's per-run
 * results tab open the same drawer, differing only in the `endpoint` they pass.
 * Both are served by getStudentTestAttemptReview.
 */

import { useEffect, useState } from 'react';
import {
  Box, Drawer, Stack, Typography, IconButton, Chip, Skeleton, Alert,
  ToggleButton, ToggleButtonGroup, alpha, useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StudentAvatar from '@/components/students/StudentAvatar';
import GradedReviewList, { type GradedReviewItem } from '@/components/tests/GradedReviewList';
import { summariseAttempt, formatBreakdown } from '@/lib/attempt-breakdown';

interface AttemptRow {
  attempt_id: string;
  attempt_number: number;
  mode: 'official' | 'revision';
  submitted_at: string | null;
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  /** Only sent by the generalised route; the chapter report omits it. */
  provisional?: boolean;
  review: GradedReviewItem[];
}

interface ResponseSheetData {
  test: { test_id: string; title: string; passing_pct: number | null } | null;
  attempts: AttemptRow[];
}

interface StudentAttemptSheetProps {
  open: boolean;
  /**
   * Where to read this student's attempts from. The caller owns the URL because
   * the same drawer serves a chapter report, a teacher's run results and (later)
   * a student's own history, which are three different authorisation stories.
   */
  endpoint: string;
  student: { id: string; name: string | null; avatar_url: string | null } | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  /** Overrides the subtitle when the caller knows the run's name. */
  subtitle?: string;
}

/** A percentage never travels alone. See formatScore in TestResultsPanel. */
function scoreLabel(a: { percentage: number; score: number; total_marks: number }): string {
  const pct = Math.round(a.percentage);
  return a.total_marks > 0 ? `${pct}% (${a.score}/${a.total_marks})` : `${pct}%`;
}

export default function StudentAttemptSheet({
  open,
  endpoint,
  student,
  getToken,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  subtitle,
}: StudentAttemptSheetProps) {
  const theme = useTheme();

  const [data, setData] = useState<ResponseSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attemptIndex, setAttemptIndex] = useState(0);

  useEffect(() => {
    if (!open || !student) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    (async () => {
      try {
        const t = await getToken();
        const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${t}` } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'Could not load this student’s responses.');
        if (cancelled) return;
        // The chapter report replies at the top level; the generalised route
        // wraps its payload in `data`, as every other question-bank route does.
        const payload: ResponseSheetData = body?.data ?? body;
        setData(payload);
        // Default to the latest attempt: the one that answers "did they
        // eventually get it," which every earlier attempt already led to.
        setAttemptIndex(Math.max(0, (payload.attempts?.length || 1) - 1));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load this student’s responses.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, student, endpoint, getToken]);

  const attempt = data?.attempts?.[attemptIndex] ?? null;

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { maxHeight: '94vh', borderTopLeftRadius: 20, borderTopRightRadius: 20 } }}
    >
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {/* Header + student nav */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton onClick={onPrev} disabled={!hasPrev} sx={{ minWidth: 44, minHeight: 44 }} aria-label="Previous student">
            <ChevronLeftIcon />
          </IconButton>
          <StudentAvatar userId={student?.id} src={student?.avatar_url} name={student?.name} size={36} tapToView={false} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {student?.name || 'Student'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {subtitle || `${data?.test?.title || 'Test'} responses`}
            </Typography>
          </Box>
          <IconButton onClick={onNext} disabled={!hasNext} sx={{ minWidth: 44, minHeight: 44 }} aria-label="Next student">
            <ChevronRightIcon />
          </IconButton>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }} aria-label="Close">
            <CloseIcon />
          </IconButton>
        </Stack>

        {loading ? (
          <>
            <Skeleton variant="rounded" height={48} sx={{ mb: 1.5 }} />
            <Skeleton variant="rounded" height={200} />
          </>
        ) : error ? (
          <Alert severity="warning">{error}</Alert>
        ) : !data?.attempts?.length ? (
          /* A student who never sat it still opens the sheet, so the drill-down
             from a "Not started" row is never a dead end. */
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <Typography color="text.secondary">No test attempts yet.</Typography>
          </Box>
        ) : (
          <>
            {/* Every attempt stays one tap away, not just the default one. */}
            {data.attempts.length > 1 && (
              <ToggleButtonGroup
                value={attemptIndex}
                exclusive
                onChange={(_, v) => v != null && setAttemptIndex(v)}
                size="small"
                sx={{ mb: 1.5, flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 40 } }}
              >
                {data.attempts.map((a, i) => (
                  <ToggleButton key={a.attempt_id} value={i}>
                    Attempt {a.attempt_number}
                    {a.mode === 'revision' ? ' · practice' : ''} · {scoreLabel(a)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}

            {attempt && (
              <>
                <Box
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, mb: 1.5,
                    borderRadius: 2, border: `1px solid ${theme.palette.divider}`,
                    bgcolor: alpha(attempt.passed ? theme.palette.success.main : theme.palette.warning.main, 0.06),
                  }}
                >
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    {Math.round(attempt.percentage)}%
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {attempt.score} of {attempt.total_marks} marks
                    </Typography>
                    {/*
                      What the marks were actually made of. "38 of 45" does not
                      say whether the seven lost marks were seven wrong answers
                      or seven questions never reached, and with no negative
                      marking a skipped question is never a choice: it means the
                      student ran out of time, or something went wrong.
                    */}
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                      {formatBreakdown(summariseAttempt(attempt.review))}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {attempt.submitted_at
                        ? new Date(attempt.submitted_at).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                          })
                        : 'Submitted'}
                      {attempt.provisional ? ' · provisional, drawings still being marked' : ''}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={attempt.passed ? 'Passed' : 'Not passed'}
                    color={attempt.passed ? 'success' : 'warning'}
                  />
                </Box>

                <GradedReviewList review={attempt.review} getToken={getToken} />
              </>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
