'use client';

/**
 * One student's response sheet for a chapter test: every attempt they sat,
 * question by question, what they answered and what was correct.
 *
 * Before this, a teacher watching a student pass a chapter test could see one
 * number, a best score. Nothing showed what they actually answered, or let a
 * teacher tell a lucky guess from real understanding, or see a student who
 * failed twice before passing on the third try. Prev/next walks the same
 * roster the teacher was just looking at, so grading (or just checking) a
 * class does not mean reopening this sheet from scratch for each student.
 */

import { useEffect, useState } from 'react';
import {
  Box, Drawer, Stack, Typography, IconButton, Chip, Skeleton, Alert,
  ToggleButton, ToggleButtonGroup, alpha, useTheme, useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StudentAvatar from '@/components/students/StudentAvatar';
import GradedReviewList, { type GradedReviewItem } from '@/components/tests/GradedReviewList';

interface AttemptRow {
  attempt_id: string;
  attempt_number: number;
  mode: 'official' | 'revision';
  submitted_at: string | null;
  score: number;
  total_marks: number;
  percentage: number;
  passed: boolean;
  review: GradedReviewItem[];
}

interface ResponseSheetData {
  test: { test_id: string; title: string; passing_pct: number } | null;
  attempts: AttemptRow[];
}

interface StudentAttemptSheetProps {
  open: boolean;
  fileId: string;
  student: { id: string; name: string | null; avatar_url: string | null } | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function StudentAttemptSheet({
  open,
  fileId,
  student,
  getToken,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: StudentAttemptSheetProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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
        const res = await fetch(`/api/study-materials/reports/chapter/${fileId}/student/${student.id}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'Could not load this student’s responses.');
        if (cancelled) return;
        setData(body);
        // Default to the latest attempt: the one that answers "did they
        // eventually get it," which every earlier attempt already led to.
        setAttemptIndex(Math.max(0, (body.attempts?.length || 1) - 1));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Could not load this student’s responses.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, student, fileId, getToken]);

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
              {data?.test?.title || 'Chapter test'} responses
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
                    {a.mode === 'revision' ? ' · practice' : ''} · {Math.round(a.percentage)}%
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
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {attempt.score} of {attempt.total_marks} marks
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {attempt.submitted_at
                        ? new Date(attempt.submitted_at).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                          })
                        : 'Submitted'}
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
