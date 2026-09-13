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
import StudentAvatar from '@/components/students/StudentAvatar';
import NextLink from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SendIcon from '@mui/icons-material/Send';
import ReplayIcon from '@mui/icons-material/Replay';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import IosShareIcon from '@mui/icons-material/IosShare';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import LinkIcon from '@mui/icons-material/Link';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { Dialog, DialogTitle, DialogContent, DialogActions } from '@neram/ui';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { GalleryReactionType } from '@neram/database/types';
import SubmissionReviewSheet, { type ReviewRow } from '@/components/assignments/SubmissionReviewSheet';
import AssignmentBrief from '@/components/assignments/AssignmentBrief';
import AssignmentResultsGrid from '@/components/assignments/AssignmentResultsGrid';
import GradeDisplay from '@/components/assignments/GradeDisplay';
import AssignmentNudgeDialog from '@/components/assignments/AssignmentNudgeDialog';
import DrawingHandBackPanel from '@/components/drawings/review/DrawingHandBackPanel';
import TriageBandCards, { BAND_TONE } from '@/components/drawings/triage/TriageBandCards';
import AssignmentBriefPicker from '@/components/drawings/briefs/AssignmentBriefPicker';
import { useDrawingTriage } from '@/hooks/useDrawingTriage';
import { BAND_LABEL, type TriageBand } from '@/lib/drawing-triage';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import ShareAssignmentDialog from '@/components/assignments/ShareAssignmentDialog';
import AssignmentSetupDialog from '@/components/assignments/AssignmentSetupDialog';
import QuestionsSummaryCard from '@/components/assignments/QuestionsSummaryCard';
import ClassPickerField, {
  formatClassDay,
  type ClassOption,
} from '@/components/assignments/ClassPickerField';
import { remindedAgo } from '@/lib/relative-time';
import HeadphonesOutlinedIcon from '@mui/icons-material/HeadphonesOutlined';
import { heardLabel, heardState } from '@/lib/voice-recording';

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
  classroom_id?: string;
  scheduled_class_id?: string | null;
  /** Resolved server-side, so this page can name the class rather than show an id. */
  scheduled_class?: ClassOption | null;
  timing?: 'prework' | 'homework';
}
type Bucket = 'submitted' | 'late' | 'missing';
const BUCKET_LABEL: Record<Bucket, string> = { submitted: 'Submitted', late: 'Late', missing: 'Not submitted' };
/** The roster tabs plus the results matrix, which is a view of the same roster. */
type RosterTab = Bucket | 'results';

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
  /** The voice note sent on the latest attempt, and whether the student heard it. */
  voice?: {
    sent_at: string | null;
    first_played_at: string | null;
    heard_fully_at: string | null;
    max_position_ms: number;
    duration_ms: number;
  } | null;
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
  // The question paper, present only when the teacher attached one.
  const [paper, setPaper] = useState<{
    questions: { id: string; question_text: string; format: string; marks: number; correct_answer?: string | null }[];
  } | null>(null);
  const [drawingRows, setDrawingRows] = useState<DrawingRosterRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ total: 0, submitted: 0, late: 0, missing: 0 });
  const [tab, setTab] = useState<RosterTab>('submitted');
  const [dTab, setDTab] = useState<DBucket>('submitted');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // When set, the reminder dialog targets a single student; null = the whole
  // not-submitted bucket (the bulk "Message" button).
  const [nudgeRecipient, setNudgeRecipient] = useState<{ id: string; name: string | null } | null>(null);
  const [reminders, setReminders] = useState<Record<string, ReminderSummary>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  // Changing the class from here is what removes the round trip through the
  // timetable for work that is already published.
  const [classOpen, setClassOpen] = useState(false);
  const [classDraft, setClassDraft] = useState<ClassOption | null>(null);

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

  const openClassDialog = () => {
    setClassDraft(assignment?.scheduled_class ?? null);
    setClassOpen(true);
  };

  const saveClass = async () => {
    setBusy(true);
    try {
      await authFetch(`/api/assignments/${id}`, {
        method: 'POST',
        // Explicitly null detaches. The server only leaves the link alone when
        // the key is absent, so sending it always is what makes both directions
        // reachable from this one button.
        body: JSON.stringify({ action: 'update', scheduled_class_id: classDraft?.id ?? null }),
      });
      setSnack({
        msg: classDraft ? `Linked to ${classDraft.title || 'that class'}.` : 'Removed from its class.',
        sev: 'success',
      });
      setClassOpen(false);
      await load();
    } catch (err) {
      setSnack({ msg: err instanceof Error ? err.message : 'Could not change the class', sev: 'error' });
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
      setPaper(res.paper ?? null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load assignment');
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const isDrawing = assignment?.assignment_type === 'drawing';
  // What each waiting drawing needs, so the teacher opens the right ones first.
  const triage = useDrawingTriage(isDrawing ? id : null, getTeacherToken, isDrawing);
  const [bandFilter, setBandFilter] = useState<TriageBand | null>(null);
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
    if (dTab === 'submitted' && triage.items.length + triage.heldIds.size > 0) {
      // Triage order: flagged, needs a look, routine, then reviews already
      // finished and waiting to be handed back.
      const rank = new Map(triage.items.map((t, i) => [t.submission_id, i]));
      const last = Number.MAX_SAFE_INTEGER;
      const place = (r: DrawingRosterRow) => (r.drawing ? rank.get(r.drawing.id) ?? last : last);
      const shown = bandFilter
        ? list.filter((r) => r.drawing && triage.byId.get(r.drawing.id)?.band === bandFilter)
        : list;
      return [...shown].sort((a, b) => place(a) - place(b));
    }
    if (dTab === 'submitted') {
      return [...list].sort((a, b) => {
        const ar = a.drawing?.is_resubmission ? 1 : 0;
        const br = b.drawing?.is_resubmission ? 1 : 0;
        if (ar !== br) return br - ar;
        return (b.drawing?.submitted_at || '').localeCompare(a.drawing?.submitted_at || '');
      });
    }
    return list;
  }, [drawingRows, dTab, triage.items, triage.heldIds, triage.byId, bandFilter]);
  const dResubmitCount = useMemo(
    () => drawingRows.filter((r) => r.bucket === 'submitted' && r.drawing?.is_resubmission).length,
    [drawingRows],
  );
  const docResubmitCount = useMemo(() => rows.filter((r) => r.bucket === 'submitted' && isDocResubmission(r)).length, [rows]);
  const hasPaper = !!paper && paper.questions.length > 0;

  /** What the Questions card shows: the paper at a glance, and whether it is fixed. */
  const questionSummary = useMemo(() => {
    const qs = paper?.questions ?? [];
    const totalMarks = qs.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    const autoMarks = qs
      .filter((q) => String(q.format || '').toUpperCase() !== 'SUBJECTIVE')
      .reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
    return { count: qs.length, totalMarks, autoMarks, manualMarks: totalMarks - autoMarks };
  }, [paper]);

  // Re-keying a paper under students who already answered it would change marks
  // they have already been shown, so the editor opens read-only.
  const questionsLocked = useMemo(() => {
    const answered = rows.filter((r) => (r as any).answers).length;
    if (!answered) return null;
    return `${answered} ${answered === 1 ? 'student has' : 'students have'} already answered these questions, so the paper can no longer be changed.`;
  }, [rows]);
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

          {/* The timetable class this work belongs to, changed in place.
              Reaching this used to mean leaving for the timetable, finding the
              class and scanning an unsearchable list of assignments. */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ mb: 2, flexWrap: 'wrap' }}
            useFlexGap
          >
            <EventOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
            <Typography variant="body2" color={assignment.scheduled_class ? 'text.primary' : 'text.secondary'}>
              {assignment.scheduled_class
                ? `${assignment.scheduled_class.title || 'Untitled class'}, ${formatClassDay(
                    assignment.scheduled_class.scheduled_date,
                  )}`
                : 'Not linked to a class'}
            </Typography>
            {assignment.timing === 'prework' && assignment.scheduled_class && (
              <Chip label="Before class" size="small" sx={{ height: 22, fontWeight: 700 }} />
            )}
            <Button
              size="small"
              variant="text"
              onClick={openClassDialog}
              sx={{ minHeight: 40, textTransform: 'none' }}
            >
              {assignment.scheduled_class ? 'Change' : 'Link a class'}
            </Button>
          </Stack>

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
            {assignment.status === 'published' && (
              <Button size="small" variant="outlined" startIcon={<IosShareIcon sx={{ fontSize: 16 }} />} onClick={() => setShareOpen(true)} sx={{ minHeight: 40, textTransform: 'none' }}>
                Share
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

          {/* The paper, and the way in to writing it. Above the brief because a
              teacher arriving here to add questions should not have to read the
              brief first to find out where they are. Document assignments only:
              a drawing is judged from the drawing itself. */}
          {assignment.assignment_type !== 'drawing' && (
            <Box sx={{ mb: 2.5 }}>
              <QuestionsSummaryCard
                summary={questionSummary}
                lockedReason={questionsLocked}
                onEdit={() => router.push(`/teacher/assignments/${id}/questions`)}
              />
            </Box>
          )}

          {/* What the teacher set up (brief / reference / paper / links) */}
          {(assignment.instructions || (assignment as any).expected_outcome || (assignment as any).focus_points || refImages.length > 0 || (assignment.attachments && assignment.attachments.length > 0) || (assignment.links && assignment.links.length > 0)) && (
            <Box sx={{ mb: 2.5, p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              {(assignment.instructions || (assignment as any).expected_outcome || (assignment as any).focus_points) && (
                <Box sx={{ mb: refImages.length > 0 ? 1.5 : 0 }}>
                  {/* showMarksWarning: the teacher is the only one who can act on
                      a brief whose stated marks disagree with the assignment's
                      configured total, so only they are told. */}
                  <AssignmentBrief
                    instructions={assignment.instructions}
                    expectedOutcome={(assignment as any).expected_outcome}
                    focusPoints={(assignment as any).focus_points}
                    maxMarks={assignment.max_marks}
                    showMarksWarning
                  />
                </Box>
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
              <DrawingHandBackPanel
                assignmentId={id}
                getToken={getTeacherToken}
                onReleased={() => { void load(); triage.refresh(); }}
              />

              <AssignmentBriefPicker assignmentId={id} getToken={getTeacherToken} />

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

              {dTab === 'submitted' && (counts.submitted ?? 0) > 0 && (
                <TriageBandCards
                  counts={triage.counts}
                  selected={bandFilter}
                  onSelect={setBandFilter}
                  loading={triage.loading}
                  failed={triage.failed}
                  checking={triage.checking}
                  onOpenFastLane={() => {
                    const first = triage.items.find((t) => t.band === 'routine');
                    if (first) router.push(`/teacher/drawing-reviews/${first.submission_id}?assignment=${id}&lane=routine`);
                  }}
                />
              )}

              <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {dBucketRows.length} {dBucketRows.length === 1 ? 'student' : 'students'}
                  {dTab === 'submitted' && bandFilter ? `, ${BAND_LABEL[bandFilter].toLowerCase()}` : ''}
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
                    {dTab === 'missing'
                      ? 'Everyone has submitted.'
                      : dTab === 'submitted' && bandFilter
                        ? `Nothing in ${BAND_LABEL[bandFilter]} right now.`
                        : 'No drawings here yet.'}
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1}>
                  {dBucketRows.map((row) => {
                    const clickable = !!row.drawing;
                    const triaged = dTab === 'submitted' && row.drawing ? triage.byId.get(row.drawing.id) : undefined;
                    const isHeld = dTab === 'submitted' && !!row.drawing && triage.heldIds.has(row.drawing.id);
                    const tone = triaged ? BAND_TONE[triaged.band] : null;
                    const BandIcon = tone?.Icon;
                    // A filtered list is a lane: J and K on the review screen walk the same band.
                    const lane = triaged && bandFilter ? `&lane=${bandFilter}` : '';
                    return (
                      <Box
                        key={row.student.id}
                        role={clickable ? 'button' : undefined}
                        data-band={triaged?.band}
                        onClick={clickable ? () => router.push(`/teacher/drawing-reviews/${row.drawing!.id}?assignment=${id}${lane}`) : undefined}
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
                        <StudentAvatar
                          userId={row.student.id}
                          src={row.student.avatar_url}
                          name={row.student.name}
                          size={36}
                          tapToView={false}
                        />
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
                          {triaged && tone && BandIcon && (
                            <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mt: 0.25 }} data-testid="triage-explainer">
                              <BandIcon aria-hidden sx={{ fontSize: 14, mt: '2px', color: tone.fg }} />
                              <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
                                <Box component="span" sx={{ fontWeight: 700, color: tone.fg }}>{BAND_LABEL[triaged.band]}.</Box>{' '}
                                {triaged.explainer}
                              </Typography>
                            </Stack>
                          )}
                          {isHeld && (
                            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                              <PauseCircleOutlineIcon aria-hidden sx={{ fontSize: 14, color: 'primary.main' }} />
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Reviewed. Waiting to hand back.
                              </Typography>
                            </Stack>
                          )}
                          {row.voice?.sent_at && (
                            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25 }}>
                              <HeadphonesOutlinedIcon
                                aria-hidden
                                sx={{ fontSize: 14, color: row.voice.heard_fully_at ? 'success.main' : 'warning.main' }}
                              />
                              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                                Voice note: {heardLabel(heardState(row.voice)).toLowerCase()}
                              </Typography>
                            </Stack>
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
                {/* Only offered when there is a paper to have results for. */}
                {hasPaper && (
                  <ToggleButton value="results" sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
                    Results
                  </ToggleButton>
                )}
              </ToggleButtonGroup>

              {tab === 'results' ? (
                <AssignmentResultsGrid
                  questions={paper!.questions}
                  rows={rows.map((r) => ({ student: r.student, answers: (r as any).answers ?? null }))}
                />
              ) : (
              <>
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
                        <StudentAvatar
                          userId={row.student.id}
                          src={row.student.avatar_url}
                          name={row.student.name}
                          size={36}
                          tapToView={false}
                        />
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
        </>
      )}

      <SubmissionReviewSheet
        open={reviewIndex != null}
        row={reviewIndex != null ? bucketRows[reviewIndex] ?? null : null}
        maxMarks={assignment?.max_marks ?? 0}
        paper={paper as any}
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

      {assignment && (
        <ShareAssignmentDialog
          open={shareOpen}
          onClose={() => {
            setShareOpen(false);
            // A group post logs a reminder per tagged student, so the
            // "reminded x2" hints on the roster are stale until we reload.
            load();
          }}
          assignmentId={assignment.id}
          getToken={getTeacherToken}
          onNotify={(msg, sev) => setSnack({ msg, sev: sev === 'error' ? 'error' : 'success' })}
        />
      )}

      <AssignmentSetupDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        classroomId=""
        assignmentId={id}
        authFetch={authFetch}
        getToken={getTeacherToken}
        onSaved={() => {
          setEditOpen(false);
          setSnack({ msg: 'Assignment updated.', sev: 'success' });
          load();
        }}
      />

      {/* Link, move, or detach the class. Detaching never deletes anything:
          submissions and marks stay with the assignment. */}
      <Dialog
        open={classOpen}
        onClose={() => setClassOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 800 }}>
          {assignment?.scheduled_class ? 'Change the class' : 'Link a class'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Students see this work on the class, and it shows up on the timetable.
          </Typography>
          <ClassPickerField
            classroomId={assignment?.classroom_id || ''}
            value={classDraft}
            onChange={setClassDraft}
            getToken={getTeacherToken}
            nearDate={assignment?.class_date}
            disabled={busy}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setClassOpen(false)} sx={{ minHeight: 44, textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy}
            onClick={saveClass}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {busy ? 'Saving...' : classDraft ? 'Link to this class' : 'Remove from class'}
          </Button>
        </DialogActions>
      </Dialog>

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
