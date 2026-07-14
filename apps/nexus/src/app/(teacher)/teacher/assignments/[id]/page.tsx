'use client';

/**
 * Assignment review: the roster of the class split into Submitted / Late / Not
 * submitted, with per-student marks. Tap a student to grade them; prev/next
 * moves through the class without leaving the review sheet.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Button,
  Avatar,
  Skeleton,
  Snackbar,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Tooltip,
  alpha,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SendIcon from '@mui/icons-material/Send';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import SubmissionReviewSheet, { type ReviewRow } from '@/components/assignments/SubmissionReviewSheet';
import AssignmentNudgeDialog from '@/components/assignments/AssignmentNudgeDialog';

interface AssignmentInfo {
  id: string;
  title: string;
  class_date: string;
  max_marks: number;
  due_at: string | null;
  submission_format: string;
  status: string;
}
type Bucket = 'submitted' | 'late' | 'missing';
const BUCKET_LABEL: Record<Bucket, string> = { submitted: 'Submitted', late: 'Late', missing: 'Not submitted' };

export default function AssignmentReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading, getTeacherToken } = useNexusAuthContext();

  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0, submitted: 0, late: 0, missing: 0 });
  const [tab, setTab] = useState<Bucket>('submitted');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);

  const setStatus = async (action: 'publish' | 'close') => {
    if (!assignment) return;
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
      setSnack({ msg: action === 'publish' ? 'Published to students.' : 'Assignment closed.', sev: 'success' });
      await load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not update', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await authFetch(`/api/assignments/${id}`);
      setAssignment(res.assignment as AssignmentInfo);
      setRows(res.roster as ReviewRow[]);
      setCounts(res.counts || {});
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load assignment');
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const bucketRows = useMemo(() => rows.filter((r) => r.bucket === tab), [rows, tab]);

  // Review navigation runs across the currently visible bucket.
  const openReview = (row: ReviewRow) => {
    const idx = bucketRows.findIndex((r) => r.student.id === row.student.id);
    setReviewIndex(idx >= 0 ? idx : null);
  };

  const copyNames = async () => {
    const names = bucketRows.map((r) => r.student.name || r.student.email || '').filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(names);
      setSnack({ msg: `Copied ${bucketRows.length} names.`, sev: 'success' });
    } catch {
      setSnack({ msg: 'Could not copy to clipboard.', sev: 'error' });
    }
  };

  const review = async (
    submissionId: string,
    marks: number | null,
    feedback: string,
    action: 'complete' | 'redo',
  ) => {
    setBusy(true);
    try {
      const row = reviewIndex != null ? bucketRows[reviewIndex] : null;
      await authFetch(`/api/assignments/${id}`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'review_submission',
          submission_id: submissionId,
          student_id: row?.student.id,
          marks,
          feedback,
          review_action: action,
        }),
      });
      setSnack({ msg: action === 'redo' ? 'Redo requested.' : 'Review saved.', sev: 'success' });
      await load();
      setReviewIndex(null);
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not save review', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Box sx={{ p: 3, maxWidth: 480, mx: 'auto', textAlign: 'center', mt: 6 }}>
        <Typography sx={{ fontWeight: 700 }}>Could not load this assignment</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {loadError}
        </Typography>
        <Button variant="outlined" onClick={() => load()} sx={{ mt: 2, minHeight: 44 }}>
          Try again
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.back()}
        sx={{ mb: 1, minHeight: 44, color: 'text.secondary', fontWeight: 600 }}
      >
        Back
      </Button>

      {!assignment ? (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={70} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
        </Stack>
      ) : (
        <>
          <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.4rem' } }}>
            {assignment.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {new Date(assignment.class_date + 'T00:00:00').toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}{' '}
            · out of {assignment.max_marks}
            {assignment.due_at
              ? ` · due ${new Date(assignment.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
              : ''}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
            <Chip
              label={assignment.status}
              size="small"
              sx={{ height: 22, fontWeight: 700, textTransform: 'capitalize' }}
              color={assignment.status === 'published' ? 'success' : assignment.status === 'draft' ? 'default' : 'warning'}
            />
            {assignment.status === 'draft' && (
              <Button size="small" variant="contained" disabled={busy} onClick={() => setStatus('publish')} sx={{ minHeight: 40, textTransform: 'none' }}>
                Publish to students
              </Button>
            )}
            {assignment.status === 'published' && (
              <Button size="small" variant="outlined" disabled={busy} onClick={() => setStatus('close')} sx={{ minHeight: 40, textTransform: 'none' }}>
                Close
              </Button>
            )}
          </Stack>

          <ToggleButtonGroup
            value={tab}
            exclusive
            onChange={(_, v) => v && setTab(v)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          >
            {(['submitted', 'late', 'missing'] as Bucket[]).map((b) => (
              <ToggleButton key={b} value={b} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
                {BUCKET_LABEL[b]} ({counts[b] ?? 0})
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
              {bucketRows.length} {bucketRows.length === 1 ? 'student' : 'students'}
            </Typography>
            {bucketRows.length > 0 && (
              <Tooltip title="Copy names">
                <Button size="small" startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />} onClick={copyNames} sx={{ minHeight: 40 }}>
                  Copy names
                </Button>
              </Tooltip>
            )}
            {tab === 'missing' && bucketRows.length > 0 && (
              <Button size="small" startIcon={<SendIcon sx={{ fontSize: 16 }} />} onClick={() => setNudgeOpen(true)} sx={{ minHeight: 40 }}>
                Message
              </Button>
            )}
          </Stack>

          {bucketRows.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
              <Typography variant="body2" color="text.disabled">
                {tab === 'missing' ? 'Everyone has submitted.' : 'No one here yet.'}
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1}>
              {bucketRows.map((row) => {
                const clickable = row.bucket !== 'missing';
                return (
                  <Box
                    key={row.student.id}
                    role={clickable ? 'button' : undefined}
                    onClick={clickable ? () => openReview(row) : undefined}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      p: 1.25,
                      minHeight: 56,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      cursor: clickable ? 'pointer' : 'default',
                      '&:hover': clickable ? { borderColor: 'primary.light', bgcolor: 'action.hover' } : {},
                    }}
                  >
                    <Avatar src={row.student.avatar_url || undefined} sx={{ width: 36, height: 36, bgcolor: 'primary.dark' }}>
                      {(row.student.name || '?').slice(0, 1).toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {row.student.name || row.student.email}
                      </Typography>
                      {row.submission && (
                        <Typography variant="caption" color="text.secondary">
                          {new Date(row.submission.submitted_at).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </Typography>
                      )}
                    </Box>
                    {row.submission?.status === 'redo' && (
                      <Chip label="Redo" size="small" sx={{ height: 22, bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }} />
                    )}
                    {row.submission?.marks != null && (
                      <Chip
                        label={`${row.submission.marks} / ${assignment.max_marks}`}
                        size="small"
                        sx={{ height: 22, bgcolor: alpha('#2E7D32', 0.12), color: '#1B5E20', fontWeight: 700 }}
                      />
                    )}
                    {clickable && <ChevronRightIcon sx={{ color: 'text.disabled' }} />}
                  </Box>
                );
              })}
            </Stack>
          )}
        </>
      )}

      <SubmissionReviewSheet
        open={reviewIndex != null}
        row={reviewIndex != null ? bucketRows[reviewIndex] ?? null : null}
        maxMarks={assignment?.max_marks ?? 0}
        busy={busy}
        onClose={() => setReviewIndex(null)}
        onReview={review}
        onPrev={() => setReviewIndex((i) => (i != null && i > 0 ? i - 1 : i))}
        onNext={() => setReviewIndex((i) => (i != null && i < bucketRows.length - 1 ? i + 1 : i))}
        hasPrev={reviewIndex != null && reviewIndex > 0}
        hasNext={reviewIndex != null && reviewIndex < bucketRows.length - 1}
      />

      {assignment && (
        <AssignmentNudgeDialog
          open={nudgeOpen}
          assignments={[{ id: assignment.id, title: assignment.title }]}
          recipients={rows
            .filter((r) => r.bucket === 'missing')
            .map((r) => ({ id: r.student.id, name: r.student.name }))}
          getToken={getTeacherToken}
          onClose={() => setNudgeOpen(false)}
        />
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack?.sev || 'success'} onClose={() => setSnack(null)}>
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
