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
  Breadcrumbs,
  Link as MuiLink,
  alpha,
} from '@neram/ui';
import NextLink from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SendIcon from '@mui/icons-material/Send';
import ReplayIcon from '@mui/icons-material/Replay';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkIcon from '@mui/icons-material/Link';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@neram/ui';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { GalleryReactionType } from '@neram/database/types';
import SubmissionReviewSheet, { type ReviewRow } from '@/components/assignments/SubmissionReviewSheet';
import GradeDisplay from '@/components/assignments/GradeDisplay';
import AssignmentNudgeDialog from '@/components/assignments/AssignmentNudgeDialog';
import NewAssignmentDialog from '@/components/assignments/NewAssignmentDialog';
import { remindedAgo } from '@/lib/relative-time';

interface AttachmentRow {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface AssignmentInfo {
  id: string;
  title: string;
  class_date: string;
  evaluation_type: 'marks' | 'stars';
  max_marks: number;
  due_at: string | null;
  submission_format: string;
  status: string;
  assignment_type?: 'drawing' | 'document';
  instructions?: string | null;
  content_image_url?: string | null;
  reference_images?: string[] | null;
  links?: { label: string; url: string }[];
  attachments?: AttachmentRow[];
}
type Bucket = 'submitted' | 'late' | 'missing';
const BUCKET_LABEL: Record<Bucket, string> = { submitted: 'Submitted', late: 'Late', missing: 'Not submitted' };

interface DrawingRosterRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  drawing: {
    id: string;
    status: string;
    submitted_at: string;
    tutor_rating: number | null;
    tutor_marks: number | null;
    attempt_number: number;
    attempt_count?: number;
    is_resubmission?: boolean;
  } | null;
  bucket: 'submitted' | 'reviewed' | 'missing';
}
type DBucket = 'submitted' | 'reviewed' | 'missing';
const D_BUCKET_LABEL: Record<DBucket, string> = { submitted: 'To review', reviewed: 'Reviewed', missing: 'Not submitted' };

interface ReminderSummary {
  count: number;
  last_sent_at: string;
}

export default function AssignmentReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading, getTeacherToken } = useNexusAuthContext();

  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [drawingRows, setDrawingRows] = useState<DrawingRosterRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0, submitted: 0, late: 0, missing: 0 });
  const [tab, setTab] = useState<Bucket>('submitted');
  const [dTab, setDTab] = useState<DBucket>('submitted');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  // When set, the reminder dialog targets a single student; null = the whole
  // not-submitted bucket (the bulk "Message" button).
  const [nudgeRecipient, setNudgeRecipient] = useState<{ id: string; name: string | null } | null>(null);
  const [reminders, setReminders] = useState<Record<string, ReminderSummary>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const openAttachment = async (studyFileId: string) => {
    const token = await getTeacherToken();
    if (!token) return;
    window.open(`/api/study-materials/files/${studyFileId}/content?token=${encodeURIComponent(token)}`, '_blank', 'noopener');
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'DELETE' });
      setDeleteOpen(false);
      router.push('/teacher/assignments');
    } catch (err) {
      setDeleteOpen(false);
      setSnack({ msg: err instanceof Error ? err.message : 'Could not delete', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (action: 'publish' | 'close' | 'reopen') => {
    if (!assignment) return;
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${id}`, { method: 'POST', body: JSON.stringify({ action }) });
      const pastDue = action === 'reopen' && assignment.due_at != null && new Date(assignment.due_at).getTime() < Date.now();
      const msg =
        action === 'publish'
          ? 'Published to students.'
          : action === 'close'
            ? 'Assignment closed.'
            : pastDue
              ? 'Reopened. The due date has passed, edit it if needed.'
              : 'Reopened. Students can see it again.';
      setSnack({ msg, sev: 'success' });
      setCloseOpen(false);
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
      setRows((res.roster as ReviewRow[]) || []);
      setDrawingRows((res.drawing_roster as DrawingRosterRow[]) || []);
      setCounts(res.counts || {});
      setReminders((res.reminders as Record<string, ReminderSummary>) || {});
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load assignment');
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const isDrawing = assignment?.assignment_type === 'drawing';
  // Reference / expected-output images: prefer the multi-image set (the canonical
  // store is the backing question's reference_images), fall back to the single
  // legacy content image so older assignments still render. Same rule the student
  // detail screen uses, so both sides show the identical set.
  const refImages = assignment
    ? assignment.reference_images?.length
      ? assignment.reference_images
      : assignment.content_image_url
        ? [assignment.content_image_url]
        : []
    : [];
  // A document resubmission still awaiting the teacher: attempt > 1 and not yet reviewed.
  const isDocResubmission = (r: ReviewRow) =>
    !!r.submission && (r.submission.attempt_number || 1) > 1 && r.submission.status === 'submitted';

  const bucketRows = useMemo(() => {
    const list = rows.filter((r) => r.bucket === tab);
    // In "Submitted", surface resubmissions (a redo came back) at the top, newest first.
    if (tab === 'submitted') {
      return [...list].sort((a, b) => {
        const ar = isDocResubmission(a) ? 1 : 0;
        const br = isDocResubmission(b) ? 1 : 0;
        if (ar !== br) return br - ar;
        return (b.submission?.submitted_at || '').localeCompare(a.submission?.submitted_at || '');
      });
    }
    return list;
  }, [rows, tab]);
  const dBucketRows = useMemo(() => {
    const list = drawingRows.filter((r) => r.bucket === dTab);
    if (dTab === 'submitted') {
      return [...list].sort((a, b) => {
        const ar = a.drawing?.is_resubmission ? 1 : 0;
        const br = b.drawing?.is_resubmission ? 1 : 0;
        if (ar !== br) return br - ar;
        return (b.drawing?.submitted_at || '').localeCompare(a.drawing?.submitted_at || '');
      });
    }
    return list;
  }, [drawingRows, dTab]);
  const dResubmitCount = useMemo(
    () => drawingRows.filter((r) => r.bucket === 'submitted' && r.drawing?.is_resubmission).length,
    [drawingRows],
  );
  const docResubmitCount = useMemo(() => rows.filter((r) => r.bucket === 'submitted' && isDocResubmission(r)).length, [rows]);
  const missingDrawingRecipients = useMemo(
    () => drawingRows.filter((r) => r.bucket === 'missing').map((r) => ({ id: r.student.id, name: r.student.name })),
    [drawingRows],
  );

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
    reaction: GalleryReactionType | null,
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
          reaction,
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
        onClick={() => router.push('/teacher/assignments')}
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
          <Breadcrumbs
            separator={<NavigateNextIcon sx={{ fontSize: '0.9rem' }} />}
            sx={{ mb: 0.75 }}
          >
            <MuiLink
              component={NextLink}
              href="/teacher/assignments"
              underline="hover"
              color="text.secondary"
              variant="caption"
              sx={{ fontWeight: 500 }}
            >
              Assignments
            </MuiLink>
            <Typography
              variant="caption"
              color="text.primary"
              sx={{
                fontWeight: 600,
                maxWidth: { xs: 200, sm: 360 },
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {assignment.title}
            </Typography>
          </Breadcrumbs>
          <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.4rem' } }}>
            {assignment.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {new Date(assignment.class_date + 'T00:00:00').toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}{' '}
            · {assignment.evaluation_type === 'stars' ? '1-5 stars' : `out of ${assignment.max_marks}`}
            {assignment.due_at
              ? ` · due ${new Date(assignment.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
              : ''}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
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
              <Button size="small" variant="outlined" disabled={busy} onClick={() => setCloseOpen(true)} sx={{ minHeight: 40, textTransform: 'none' }}>
                Close
              </Button>
            )}
            {assignment.status === 'closed' && (
              <Button size="small" variant="contained" disabled={busy} onClick={() => setStatus('reopen')} sx={{ minHeight: 40, textTransform: 'none' }}>
                Reopen
              </Button>
            )}
            <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => setEditOpen(true)} sx={{ minHeight: 40, textTransform: 'none' }}>
              Edit
            </Button>
            <Button size="small" variant="text" color="error" startIcon={<DeleteOutlineIcon sx={{ fontSize: 16 }} />} onClick={() => setDeleteOpen(true)} sx={{ minHeight: 40, textTransform: 'none' }}>
              Delete
            </Button>
          </Stack>

          {assignment.status === 'closed' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -1, mb: 2 }}>
              Hidden from students. Reopen to make it visible again.
            </Typography>
          )}

          {/* What the teacher set up (brief / reference / paper / links) */}
          {(assignment.instructions || refImages.length > 0 || (assignment.attachments && assignment.attachments.length > 0) || (assignment.links && assignment.links.length > 0)) && (
            <Box sx={{ mb: 2.5, p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              {assignment.instructions && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: refImages.length > 0 ? 1.5 : 0 }}>
                  {assignment.instructions}
                </Typography>
              )}
              {refImages.length > 0 && (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    {assignment.assignment_type === 'drawing' ? 'Reference / expected output' : 'Image'}
                    {refImages.length > 1 ? ` (${refImages.length})` : ''}
                  </Typography>
                  {/* One image fills the width; several tile into a square grid that
                      stays touch-friendly at 375px. Tap opens the full-size file. */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: refImages.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: 1,
                      mt: 0.5,
                    }}
                  >
                    {refImages.map((src, i) => (
                      <Box
                        key={`${src}-${i}`}
                        component="img"
                        src={src}
                        alt={refImages.length > 1 ? `Reference ${i + 1}` : 'reference'}
                        onClick={() => window.open(src, '_blank', 'noopener')}
                        sx={{
                          display: 'block',
                          width: '100%',
                          cursor: 'pointer',
                          ...(refImages.length === 1
                            ? { maxWidth: '100%', maxHeight: 240, objectFit: 'contain', justifySelf: 'start' }
                            : { aspectRatio: '1 / 1', objectFit: 'cover' }),
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
              {assignment.attachments && assignment.attachments.length > 0 && (
                <Stack spacing={1} sx={{ mt: 1.5 }}>
                  {assignment.attachments.map((a) => (
                    <Button
                      key={a.id}
                      variant="outlined"
                      onClick={() => openAttachment(a.study_file_id)}
                      startIcon={<PictureAsPdfOutlinedIcon />}
                      endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                      sx={{ justifyContent: 'flex-start', minHeight: 44, textTransform: 'none' }}
                    >
                      <Box sx={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.file?.title || a.file?.file_name || 'File'}
                      </Box>
                    </Button>
                  ))}
                </Stack>
              )}
              {assignment.links && assignment.links.length > 0 && (
                <Stack spacing={1} sx={{ mt: 1.5 }}>
                  {assignment.links.map((l, i) => (
                    <Button
                      key={i}
                      variant="text"
                      startIcon={<LinkIcon />}
                      endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                      onClick={() => window.open(l.url, '_blank', 'noopener')}
                      sx={{ justifyContent: 'flex-start', minHeight: 40, textTransform: 'none' }}
                    >
                      <Box sx={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</Box>
                    </Button>
                  ))}
                </Stack>
              )}
            </Box>
          )}

          {isDrawing ? (
            <>
              <ToggleButtonGroup
                value={dTab}
                exclusive
                onChange={(_, v) => v && setDTab(v)}
                fullWidth
                size="small"
                sx={{ mb: 2 }}
              >
                {(['submitted', 'reviewed', 'missing'] as DBucket[]).map((b) => (
                  <ToggleButton key={b} value={b} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
                    {D_BUCKET_LABEL[b]} ({counts[b] ?? 0})
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {dBucketRows.length} {dBucketRows.length === 1 ? 'student' : 'students'}
                </Typography>
                {dTab === 'missing' && dBucketRows.length > 0 && (
                  <Button size="small" startIcon={<SendIcon sx={{ fontSize: 16 }} />} onClick={() => { setNudgeRecipient(null); setNudgeOpen(true); }} sx={{ minHeight: 40 }}>
                    Message all
                  </Button>
                )}
              </Stack>

              {dTab === 'submitted' && dResubmitCount > 0 && (
                <Box
                  sx={{
                    mb: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: alpha('#EF6C00', 0.1),
                    border: `1px solid ${alpha('#EF6C00', 0.3)}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <ReplayIcon sx={{ fontSize: 18, color: '#B54700' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#B54700' }}>
                    {dResubmitCount} resubmission{dResubmitCount > 1 ? 's' : ''} waiting for re-review
                  </Typography>
                </Box>
              )}

              {dBucketRows.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 5, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
                  <Typography variant="body2" color="text.disabled">
                    {dTab === 'missing' ? 'Everyone has submitted.' : 'No drawings here yet.'}
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1}>
                  {dBucketRows.map((row) => {
                    const clickable = !!row.drawing;
                    return (
                      <Box
                        key={row.student.id}
                        role={clickable ? 'button' : undefined}
                        onClick={clickable ? () => router.push(`/teacher/drawing-reviews/${row.drawing!.id}?assignment=${id}`) : undefined}
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
                          {row.drawing && (
                            <Typography variant="caption" color={row.drawing.is_resubmission ? '#B54700' : 'text.secondary'} sx={{ fontWeight: row.drawing.is_resubmission ? 700 : 400 }}>
                              {row.drawing.is_resubmission
                                ? `Resubmitted ${remindedAgo(row.drawing.submitted_at)}`
                                : new Date(row.drawing.submitted_at).toLocaleString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                              {(row.drawing.attempt_count ?? row.drawing.attempt_number) > 1
                                ? ` · attempt ${row.drawing.attempt_count ?? row.drawing.attempt_number}`
                                : ''}
                            </Typography>
                          )}
                          {row.bucket === 'missing' && reminders[row.student.id] && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              Reminded {remindedAgo(reminders[row.student.id].last_sent_at)}
                              {reminders[row.student.id].count > 1 ? ` · ×${reminders[row.student.id].count}` : ''}
                            </Typography>
                          )}
                        </Box>
                        {row.bucket === 'missing' && (
                          <Tooltip title="Send reminder">
                            <IconButton
                              size="small"
                              aria-label={`Send reminder to ${row.student.name || 'student'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setNudgeRecipient({ id: row.student.id, name: row.student.name });
                                setNudgeOpen(true);
                              }}
                              sx={{ width: 44, height: 44, color: 'primary.main' }}
                            >
                              <SendIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {row.drawing?.is_resubmission && (
                          <Chip icon={<ReplayIcon sx={{ fontSize: 15 }} />} label="Resubmitted" size="small" sx={{ height: 22, bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700, '& .MuiChip-icon': { color: '#B54700' } }} />
                        )}
                        {row.drawing?.status === 'redo' && (
                          <Chip label="Redo" size="small" sx={{ height: 22, bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }} />
                        )}
                        {row.bucket === 'reviewed' && assignment.evaluation_type === 'marks' && row.drawing?.tutor_marks != null && (
                          <Chip
                            label={`${row.drawing.tutor_marks} / ${assignment.max_marks}`}
                            size="small"
                            sx={{ height: 22, bgcolor: alpha('#2E7D32', 0.12), color: '#1B5E20', fontWeight: 700 }}
                          />
                        )}
                        {row.bucket === 'reviewed' && assignment.evaluation_type !== 'marks' && row.drawing?.tutor_rating != null && (
                          <Chip
                            label={`${row.drawing.tutor_rating}/5`}
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
          ) : (
            <>
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
                  <Button size="small" startIcon={<SendIcon sx={{ fontSize: 16 }} />} onClick={() => { setNudgeRecipient(null); setNudgeOpen(true); }} sx={{ minHeight: 40 }}>
                    Message all
                  </Button>
                )}
              </Stack>

              {tab === 'submitted' && docResubmitCount > 0 && (
                <Box
                  sx={{
                    mb: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: alpha('#EF6C00', 0.1),
                    border: `1px solid ${alpha('#EF6C00', 0.3)}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  <ReplayIcon sx={{ fontSize: 18, color: '#B54700' }} />
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#B54700' }}>
                    {docResubmitCount} resubmission{docResubmitCount > 1 ? 's' : ''} waiting for re-review
                  </Typography>
                </Box>
              )}

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
                            <Typography variant="caption" color={isDocResubmission(row) ? '#B54700' : 'text.secondary'} sx={{ fontWeight: isDocResubmission(row) ? 700 : 400 }}>
                              {isDocResubmission(row)
                                ? `Resubmitted ${remindedAgo(row.submission.submitted_at)}`
                                : new Date(row.submission.submitted_at).toLocaleString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                              {(row.submission.attempt_number || 1) > 1 ? ` · attempt ${row.submission.attempt_number}` : ''}
                            </Typography>
                          )}
                          {row.bucket === 'missing' && reminders[row.student.id] && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              Reminded {remindedAgo(reminders[row.student.id].last_sent_at)}
                              {reminders[row.student.id].count > 1 ? ` · ×${reminders[row.student.id].count}` : ''}
                            </Typography>
                          )}
                        </Box>
                        {row.bucket === 'missing' && (
                          <Tooltip title="Send reminder">
                            <IconButton
                              size="small"
                              aria-label={`Send reminder to ${row.student.name || 'student'}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setNudgeRecipient({ id: row.student.id, name: row.student.name });
                                setNudgeOpen(true);
                              }}
                              sx={{ width: 44, height: 44, color: 'primary.main' }}
                            >
                              <SendIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {isDocResubmission(row) && (
                          <Chip icon={<ReplayIcon sx={{ fontSize: 15 }} />} label="Resubmitted" size="small" sx={{ height: 22, bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700, '& .MuiChip-icon': { color: '#B54700' } }} />
                        )}
                        {row.submission?.status === 'redo' && (
                          <Chip label="Redo" size="small" sx={{ height: 22, bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }} />
                        )}
                        {row.submission?.marks != null && (
                          <GradeDisplay
                            evaluationType={assignment.evaluation_type}
                            value={row.submission.marks}
                            maxMarks={assignment.max_marks}
                            size="small"
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
        </>
      )}

      <SubmissionReviewSheet
        open={reviewIndex != null}
        row={reviewIndex != null ? bucketRows[reviewIndex] ?? null : null}
        maxMarks={assignment?.max_marks ?? 0}
        evaluationType={assignment?.evaluation_type ?? 'marks'}
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
          recipients={
            nudgeRecipient
              ? [nudgeRecipient]
              : isDrawing
                ? missingDrawingRecipients
                : rows.filter((r) => r.bucket === 'missing').map((r) => ({ id: r.student.id, name: r.student.name }))
          }
          getToken={getTeacherToken}
          onClose={() => {
            setNudgeOpen(false);
            setNudgeRecipient(null);
            // Refresh the "already reminded" hints after a send.
            load();
          }}
        />
      )}

      <NewAssignmentDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        classroomId=""
        assignmentId={id}
        authFetch={authFetch}
        getToken={getTeacherToken}
        onCreated={() => {
          setEditOpen(false);
          setSnack({ msg: 'Assignment updated.', sev: 'success' });
          load();
        }}
      />

      <Dialog open={closeOpen} onClose={() => setCloseOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Close this assignment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Students can no longer see or submit it. You can reopen it anytime.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setCloseOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="warning" disabled={busy} onClick={() => setStatus('close')} sx={{ textTransform: 'none' }}>
            {busy ? 'Closing...' : 'Close assignment'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete this assignment?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This can&apos;t be undone. Assignments with submissions can&apos;t be deleted, close them instead.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" disabled={busy} onClick={doDelete} sx={{ textTransform: 'none' }}>
            {busy ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

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
