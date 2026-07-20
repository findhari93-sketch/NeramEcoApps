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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkIcon from '@mui/icons-material/Link';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@neram/ui';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import SubmissionReviewSheet, { type ReviewRow } from '@/components/assignments/SubmissionReviewSheet';
import AssignmentNudgeDialog from '@/components/assignments/AssignmentNudgeDialog';
import NewAssignmentDialog from '@/components/assignments/NewAssignmentDialog';

interface AttachmentRow {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface AssignmentInfo {
  id: string;
  title: string;
  class_date: string;
  max_marks: number;
  due_at: string | null;
  submission_format: string;
  status: string;
  assignment_type?: 'drawing' | 'document';
  instructions?: string | null;
  content_image_url?: string | null;
  links?: { label: string; url: string }[];
  attachments?: AttachmentRow[];
}
type Bucket = 'submitted' | 'late' | 'missing';
const BUCKET_LABEL: Record<Bucket, string> = { submitted: 'Submitted', late: 'Late', missing: 'Not submitted' };

interface DrawingRosterRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  drawing: { id: string; status: string; submitted_at: string; tutor_rating: number | null; attempt_number: number } | null;
  bucket: 'submitted' | 'reviewed' | 'missing';
}
type DBucket = 'submitted' | 'reviewed' | 'missing';
const D_BUCKET_LABEL: Record<DBucket, string> = { submitted: 'To review', reviewed: 'Reviewed', missing: 'Not submitted' };

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
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load assignment');
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const isDrawing = assignment?.assignment_type === 'drawing';
  const bucketRows = useMemo(() => rows.filter((r) => r.bucket === tab), [rows, tab]);
  const dBucketRows = useMemo(() => drawingRows.filter((r) => r.bucket === dTab), [drawingRows, dTab]);
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
          {(assignment.instructions || assignment.content_image_url || (assignment.attachments && assignment.attachments.length > 0) || (assignment.links && assignment.links.length > 0)) && (
            <Box sx={{ mb: 2.5, p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              {assignment.instructions && (
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: assignment.content_image_url ? 1.5 : 0 }}>
                  {assignment.instructions}
                </Typography>
              )}
              {assignment.content_image_url && (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                    {assignment.assignment_type === 'drawing' ? 'Reference / expected output' : 'Image'}
                  </Typography>
                  <Box
                    component="img"
                    src={assignment.content_image_url}
                    alt="reference"
                    sx={{ display: 'block', mt: 0.5, maxWidth: '100%', maxHeight: 240, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
                  />
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
                  <Button size="small" startIcon={<SendIcon sx={{ fontSize: 16 }} />} onClick={() => setNudgeOpen(true)} sx={{ minHeight: 40 }}>
                    Message
                  </Button>
                )}
              </Stack>

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
                            <Typography variant="caption" color="text.secondary">
                              {new Date(row.drawing.submitted_at).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                              {row.drawing.attempt_number > 1 ? ` · attempt ${row.drawing.attempt_number}` : ''}
                            </Typography>
                          )}
                        </Box>
                        {row.drawing?.status === 'redo' && (
                          <Chip label="Redo" size="small" sx={{ height: 22, bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }} />
                        )}
                        {row.bucket === 'reviewed' && row.drawing?.tutor_rating != null && (
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
          recipients={
            isDrawing
              ? missingDrawingRecipients
              : rows.filter((r) => r.bucket === 'missing').map((r) => ({ id: r.student.id, name: r.student.name }))
          }
          getToken={getTeacherToken}
          onClose={() => setNudgeOpen(false)}
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
