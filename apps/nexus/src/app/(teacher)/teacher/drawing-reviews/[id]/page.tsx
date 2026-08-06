'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box, IconButton, Skeleton, Typography, Chip, Paper,
  Button, useMediaQuery, useTheme, Switch, Snackbar, alpha,
  Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Breadcrumbs, Link as MuiLink,
} from '@neram/ui';
import NextLink from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import ImageToggleTabs from '@/components/drawings/ImageToggleTabs';
import AIFeedbackWorkspace, { type WorkspaceData } from '@/components/drawings/AIFeedbackWorkspace';
import CommentSection from '@/components/drawings/CommentSection';
import TagEditor from '@/components/drawings/TagEditor';
import SubmissionHistoryTimeline from '@/components/assignments/SubmissionHistoryTimeline';
import {
  drawingAttemptsToViews,
  attemptStatusLabel,
  drawingRoundOpensForGrading,
} from '@/lib/submission-history';
import { useNavBadges } from '@/components/NavBadgeProvider';
import type { DrawingSubmission, DrawingSubmissionWithDetails, DrawingTag } from '@neram/database/types';
import type { RegionAnnotation } from '@/lib/drawing-prompt-templates';
import StudentAvatar from '@/components/students/StudentAvatar';

export default function DrawingReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useNexusAuthContext();
  const { refreshBadges } = useNavBadges();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Where "Back" and post-review navigation return to. When this drawing was
  // opened from a specific assignment (roster link carries ?assignment=<id>),
  // return to that assignment instead of the shared Drawing Reviews queue.
  const fromAssignmentId = searchParams.get('assignment');
  const backHref = fromAssignmentId
    ? `/teacher/assignments/${fromAssignmentId}`
    : '/teacher/drawing-reviews';

  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [attempts, setAttempts] = useState<DrawingSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Workspace data managed by AIFeedbackWorkspace, mirrored here for submission
  const workspaceRef = useRef<WorkspaceData>({
    overlayAnnotations: null,
    overlayImageUrl: null,
    correctedImageUrl: null,
    tutorFeedback: '',
    resources: [],
    rating: 0,
    marks: null,
    reaction: null,
  });
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>(workspaceRef.current);

  // Region annotations for ImageToggleTabs
  const [regionAnnotations, setRegionAnnotations] = useState<RegionAnnotation[]>([]);

  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [error, setError] = useState('');
  const [action, setAction] = useState<'redo' | 'complete'>('complete');
  // Always OFF by default. Publishing a student's work to the shared gallery is
  // the teacher's call, so it is opt-in for every drawing, practice or assignment.
  const [showInGallery, setShowInGallery] = useState(false);
  const [tagLabels, setTagLabels] = useState<string[]>([]);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [sketchTrigger, setSketchTrigger] = useState(0);

  const handleDeleteSubmission = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
      router.push(backHref);
      router.refresh();
    } catch {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleSaveDraft = async () => {
    setDraftSaving(true);
    setError('');
    try {
      const token = await getToken();
      const ws = workspaceRef.current;
      const res = await fetch(`/api/drawing/submissions/${submission!.id}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor_rating: ws.rating || null,
          tutor_marks: ws.marks,
          tutor_feedback: ws.tutorFeedback || null,
          reviewed_image_url: ws.overlayImageUrl,
          corrected_image_url: ws.correctedImageUrl,
          ai_overlay_annotations: regionAnnotations.length > 0 ? regionAnnotations : null,
          tutor_resources: ws.resources,
          reaction: ws.reaction,
          tag_labels: tagLabels,
          action: 'draft',
        }),
      });
      if (!res.ok) throw new Error('Failed to save draft');
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setDraftSaving(false);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmission(data.submission || null);
      setAttempts(Array.isArray(data.attempts) ? data.attempts : []);
    } catch {
      setSubmission(null);
      setAttempts([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Initialize workspaceData from submission
  useEffect(() => {
    if (!submission) return;
    const initial: WorkspaceData = {
      overlayAnnotations: null,
      overlayImageUrl: submission.reviewed_image_url || null,
      correctedImageUrl: (submission as any).corrected_image_url || null,
      tutorFeedback: submission.tutor_feedback || '',
      resources: (submission.tutor_resources as any) || [],
      rating: submission.tutor_rating || 0,
      marks: (submission as any).tutor_marks ?? null,
      reaction: (submission as any).reaction ?? null,
    };
    workspaceRef.current = initial;
    setWorkspaceData(initial);

    // Restore region annotations from ai_overlay_annotations if they have the new shape
    const saved = (submission as any).ai_overlay_annotations;
    if (Array.isArray(saved) && saved.length > 0 && saved[0]?.x !== undefined) {
      setRegionAnnotations(saved as RegionAnnotation[]);
    }

    // Which rounds open ready to grade (see drawingRoundOpensForGrading). A round
    // that opens locked is never a dead end: the bottom bar's "Evaluate" reopens it.
    const newerAttemptExists = attempts.some(
      (a) => a.id !== submission.id && a.submitted_at > submission.submitted_at,
    );
    setIsEditMode(drawingRoundOpensForGrading(submission.status, newerAttemptExists));

    // Visibility toggle reflects the server state for any round that has already
    // been through a review action (that is where is_gallery_visible is written),
    // so a teacher who published a drawing earlier still sees it published. A
    // round nobody has reviewed yet starts OFF: no work reaches the gallery
    // without the teacher turning it on.
    const hasBeenReviewed = ['reviewed', 'redo', 'completed'].includes(submission.status);
    setShowInGallery(hasBeenReviewed ? !!(submission as any).is_gallery_visible : false);

    // Hydrate tag labels from the loaded submission.
    const existingTags = ((submission as any).tags as DrawingTag[] | undefined) || [];
    setTagLabels(existingTags.map((t) => t.label));
  }, [submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleWorkspaceChange = useCallback((data: WorkspaceData) => {
    workspaceRef.current = data;
    setWorkspaceData(data);
  }, []);

  const handleSaveReview = async (reviewAction: 'redo' | 'complete') => {
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const ws = workspaceRef.current;
      const res = await fetch(`/api/drawing/submissions/${submission!.id}/review`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor_rating: ws.rating || null,
          tutor_marks: ws.marks,
          tutor_feedback: ws.tutorFeedback || null,
          reviewed_image_url: ws.overlayImageUrl,
          corrected_image_url: ws.correctedImageUrl,
          ai_overlay_annotations: regionAnnotations.length > 0 ? regionAnnotations : null,
          tutor_resources: ws.resources,
          reaction: ws.reaction,
          is_gallery_visible: showInGallery,
          tag_labels: tagLabels,
          action: reviewAction,
        }),
      });
      if (!res.ok) throw new Error('Failed to save review');

      refreshBadges();
      router.push(backHref);
      // Refresh so the assignment roster / queue reflect the new reviewed state.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Every prior attempt of this student's drawing for the same assignment, so the
  // teacher can scroll the redo history while grading the latest.
  const attemptViews = useMemo(() => {
    if (attempts.length < 2) return [];
    const asg = (submission as any)?.assignment;
    return drawingAttemptsToViews(attempts, {
      evaluationType: (asg?.evaluation_type as any) ?? 'stars',
      maxMarks: asg?.max_marks ?? 5,
    });
  }, [attempts, submission]);

  // The newest round in the thread. Anything older is history: the teacher can
  // still reopen it, but the banner points them at the round that matters.
  const latestAttempt = attempts.length > 1 ? attempts[attempts.length - 1] : null;
  const isSuperseded = !!(latestAttempt && submission && latestAttempt.id !== submission.id);

  // Jump to another round's own review screen, keeping the assignment context so
  // "Back" still returns where the teacher came from.
  const openAttempt = useCallback(
    (attemptId: string) => {
      const qs = fromAssignmentId ? `?assignment=${fromAssignmentId}` : '';
      router.push(`/teacher/drawing-reviews/${attemptId}${qs}`);
    },
    [router, fromAssignmentId],
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, p: 2, height: '80vh' }}>
        <Skeleton variant="rounded" sx={{ flex: 1 }} height="100%" />
        {!isMobile && <Skeleton variant="rounded" width={400} height="100%" />}
      </Box>
    );
  }

  if (!submission) {
    return <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Submission not found</Typography></Box>;
  }

  const timeAgo = getTimeAgo(submission.submitted_at);
  const sub = submission as any;

  // Which round of the thread is on screen. The header used to label every round
  // with the thread total, so an older attempt still read as the newest one.
  const attemptIndex = attempts.findIndex((a) => a.id === submission.id) + 1;
  const statusChipColor: 'warning' | 'success' | 'info' =
    submission.status === 'redo' ? 'warning'
      : ['reviewed', 'completed'].includes(submission.status) ? 'success'
      : 'info';

  // This drawing belongs to a class assignment when it was opened from one
  // (?assignment=) or the submission itself carries an assignment_id. A breadcrumb
  // bar shows where this submission sits in the hierarchy and lets the teacher jump
  // to any parent. When reached from the shared queue instead, the trail roots at
  // Drawing Reviews rather than a specific assignment.
  const assignmentId: string | null = fromAssignmentId ?? (sub.assignment_id as string | null);
  const assignmentTitle: string = sub.assignment?.title || 'Assignment';
  const assignmentContextBar = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: { xs: 1.5, md: 2 },
        py: 0.75,
        bgcolor: alpha(theme.palette.primary.main, 0.06),
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <AssignmentOutlinedIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
      <Breadcrumbs
        separator={<NavigateNextIcon sx={{ fontSize: '0.85rem' }} />}
        sx={{ flex: 1, minWidth: 0 }}
      >
        <MuiLink
          component={NextLink}
          href={assignmentId ? '/teacher/assignments' : '/teacher/drawing-reviews'}
          underline="hover"
          color="text.secondary"
          variant="caption"
          sx={{ fontWeight: 500 }}
        >
          {assignmentId ? 'Assignments' : 'Drawing Reviews'}
        </MuiLink>
        {assignmentId && (
          <MuiLink
            component={NextLink}
            href={`/teacher/assignments/${assignmentId}`}
            underline="hover"
            color="text.secondary"
            variant="caption"
            sx={{
              fontWeight: 500,
              display: 'inline-block',
              maxWidth: { xs: 150, sm: 280 },
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              verticalAlign: 'bottom',
            }}
          >
            {assignmentTitle}
          </MuiLink>
        )}
        <Typography variant="caption" color="primary.dark" sx={{ fontWeight: 700 }}>
          Review
        </Typography>
      </Breadcrumbs>
    </Box>
  );

  // Shared shell for both bar states so the locked bar sits exactly where the
  // grading bar does (fixed above BottomNav on mobile, inline on desktop).
  const barShellSx = {
    display: 'flex', alignItems: 'center',
    gap: { xs: 0.5, md: 0.75 },
    px: { xs: 1, md: 1 },
    py: 0.75,
    borderTop: '1px solid', borderColor: 'divider',
    bgcolor: 'background.paper',
    ...(!isMobile && { flexShrink: 0 }),
    ...(isMobile && {
      position: 'fixed' as const,
      bottom: 64, // BottomNav height
      left: 0,
      right: 0,
      zIndex: 10,
      boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
    }),
  };

  // Locked rounds (finished, or superseded by a newer attempt) used to render no
  // bar at all, which left the teacher on a screen with no visible way to grade.
  // They now get an explicit way back into grading.
  const lockedBar = (
    <Box sx={barShellSx}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ flex: 1, minWidth: 0, fontWeight: 600, lineHeight: 1.3 }}
      >
        {isSuperseded
          ? `Attempt ${attemptIndex} of ${attempts.length}, a newer attempt exists`
          : `${attemptStatusLabel(submission.status)}, review is locked`}
      </Typography>
      {isSuperseded && latestAttempt && (
        <Button
          variant="outlined"
          size="small"
          onClick={() => openAttempt(latestAttempt.id)}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, minWidth: 0, px: 1.5 }}
        >
          Latest
        </Button>
      )}
      <Button
        variant="contained"
        size="small"
        startIcon={<EditOutlinedIcon />}
        onClick={() => setIsEditMode(true)}
        sx={{ textTransform: 'none', fontWeight: 700, fontSize: '0.78rem', minHeight: 36, px: 2 }}
      >
        Evaluate
      </Button>
    </Box>
  );

  // Action bar: fixed on mobile (above BottomNav), inline on desktop
  const actionBar = isEditMode ? (
    <Box sx={barShellSx}>
      {/* Draft: icon-only on mobile, icon+text on desktop */}
      <IconButton
        onClick={handleSaveDraft}
        disabled={draftSaving || saving}
        color={draftSaved ? 'success' : 'default'}
        size="small"
        title={draftSaving ? 'Saving...' : draftSaved ? 'Draft saved!' : 'Save draft'}
        sx={{
          border: '1px solid', borderColor: draftSaved ? 'success.main' : 'divider',
          borderRadius: 1.5, width: 36, height: 36,
          ...(!isMobile && { display: 'none' }),
        }}
      >
        {draftSaved ? <CheckCircleOutlineIcon fontSize="small" /> : <SaveOutlinedIcon fontSize="small" />}
      </IconButton>
      {!isMobile && (
        <Button
          variant="outlined"
          size="small"
          onClick={handleSaveDraft}
          disabled={draftSaving || saving}
          startIcon={draftSaved ? <CheckCircleOutlineIcon /> : <SaveOutlinedIcon />}
          color={draftSaved ? 'success' : 'inherit'}
          sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, minWidth: 0 }}
        >
          {draftSaving ? '...' : draftSaved ? 'Saved!' : 'Draft'}
        </Button>
      )}

      {/* Redo */}
      <Button
        variant="outlined"
        color="warning"
        size="small"
        onClick={() => { setAction('redo'); handleSaveReview('redo'); }}
        disabled={saving || draftSaving}
        {...(isMobile ? {} : { startIcon: <ReplayIcon /> })}
        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, minWidth: 0, px: { xs: 1.5, md: 2 } }}
      >
        {saving && action === 'redo' ? '...' : 'Redo'}
      </Button>

      {/* Complete / Save: primary action, takes remaining space */}
      <Button
        variant="contained"
        color="success"
        size="small"
        onClick={() => { setAction('complete'); handleSaveReview('complete'); }}
        disabled={saving || draftSaving}
        {...(isMobile ? {} : { startIcon: <CheckCircleOutlineIcon /> })}
        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', minHeight: 36, flex: 1, px: { xs: 1.5, md: 2 } }}
      >
        {/* 'Save' only where it is honest: updating an already-finished review.
            A redo round is still open, and this button completes it. */}
        {saving && action === 'complete' ? '...' : ['reviewed', 'completed'].includes(submission.status) ? 'Save' : 'Complete'}
      </Button>

      {/* Gallery visibility toggle: off unless the teacher opts this drawing in */}
      <Switch
        checked={showInGallery}
        onChange={(e) => setShowInGallery(e.target.checked)}
        size="small"
        title="Show in Gallery"
      />
      {!isMobile && (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem', lineHeight: 1.2, ml: -0.5 }}>
          Gallery
        </Typography>
      )}
    </Box>
  ) : lockedBar;

  // Question text (for prompt context)
  const questionText = submission.question?.question_text || '';

  // Reference / expected-output images the teacher set on the assignment (may be
  // several). These live on the backing question; the review screen never showed
  // them before, so the teacher could not see what they had asked the student for.
  const referenceImages: string[] = ((submission.question as any)?.reference_images || [])
    .map((r: any) => (typeof r === 'string' ? r : r?.url))
    .filter((u: any): u is string => typeof u === 'string' && u.length > 0);
  const referenceStrip = referenceImages.length > 0 ? (
    <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
        Reference{referenceImages.length > 1 ? ` (${referenceImages.length})` : ''}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.5 }}>
        {referenceImages.map((src, i) => (
          <Box
            key={`${src}-${i}`}
            component="img"
            src={src}
            alt={`Reference ${i + 1}`}
            onClick={() => window.open(src, '_blank', 'noopener')}
            sx={{
              width: 72,
              height: 72,
              flexShrink: 0,
              objectFit: 'cover',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              cursor: 'pointer',
            }}
          />
        ))}
      </Box>
    </Box>
  ) : null;

  // Previous attempts of this redo, shown while grading the latest one. Each
  // round links to its own review screen so a teacher can grade an earlier
  // attempt that was never closed out, not just preview it.
  const previousAttemptsPanel = attemptViews.length > 1 ? (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mt: 2, borderRadius: 2 }}>
      <SubmissionHistoryTimeline
        attempts={attemptViews}
        title="Submission history"
        currentKey={submission.id}
        onOpenAttempt={(a) => openAttempt(a.key)}
      />
    </Paper>
  ) : null;

  // Re-grading a round that already carries a review action. A redo is still open
  // work, so it gets its own wording rather than "already reviewed". Suppressed on
  // superseded rounds, where supersededBanner already carries the warning.
  const reReviewNotice = ['reviewed', 'redo', 'completed'].includes(submission.status) && isEditMode && !isSuperseded ? (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fff8e1' }}>
      <Typography variant="body2" color="warning.dark" fontWeight={600}>
        {submission.status === 'redo'
          ? 'Sent back for a redo. Grade it here to close it out, or send it back again. The student is notified either way.'
          : 'Editing a reviewed submission. Changes will notify the student.'}
      </Typography>
    </Paper>
  ) : null;

  // Viewing an older round: say so, and offer the jump to the newest one.
  const supersededBanner = isSuperseded && latestAttempt ? (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#fff8e1' }}>
      <Typography variant="body2" color="warning.dark" fontWeight={600}>
        This is an earlier attempt. The student has submitted a newer one since.
      </Typography>
      <Button
        size="small"
        variant="outlined"
        color="warning"
        onClick={() => openAttempt(latestAttempt.id)}
        sx={{ mt: 1, textTransform: 'none', fontWeight: 700, minHeight: 36 }}
      >
        Go to latest attempt
      </Button>
    </Paper>
  ) : null;

  // Workspace + comments panel content
  const reviewPanel = (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{
        flex: 1, overflowY: 'auto', p: 2, WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        scrollbarColor: 'transparent transparent',
        '&:hover': { scrollbarColor: 'rgba(0,0,0,0.15) transparent' },
        '&::-webkit-scrollbar': { width: 4 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          background: 'transparent',
          borderRadius: 2,
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: 'rgba(0,0,0,0.15)',
          '&:hover': { background: 'rgba(0,0,0,0.25)' },
        },
      }}>
        {supersededBanner}
        {reReviewNotice}

        {submission.self_note && (
          <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: '#f0f7ff' }}>
            <Typography variant="caption" fontWeight={600} color="primary.dark">Student&apos;s Note</Typography>
            <Typography variant="body2" sx={{ mt: 0.25 }}>{submission.self_note}</Typography>
          </Paper>
        )}

        <AIFeedbackWorkspace
          submission={sub}
          getToken={getToken}
          onChange={handleWorkspaceChange}
          defaultCollapsed={isMobile}
          readOnly={!isEditMode}
          sketchTrigger={sketchTrigger}
          evaluationType={submission.assignment?.evaluation_type ?? 'stars'}
          maxMarks={submission.assignment?.max_marks ?? 5}
        />

        {previousAttemptsPanel}

        {isEditMode && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Tags
            </Typography>
            <TagEditor value={tagLabels} onChange={setTagLabels} />
          </Box>
        )}

        <Box sx={{ mt: 2 }}>
          <CommentSection submissionId={submission.id} getToken={getToken} canComment={true} />
        </Box>
      </Box>
      {actionBar}
    </Box>
  );

  // ===================== MOBILE LAYOUT =====================
  if (isMobile) {
    return (
      <>
        <Box sx={{ mx: { xs: -2, sm: -3 }, mt: -2, mb: -10 }}>
          {/* Compact header: avatar + name + time + category + menu in one row */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
            bgcolor: '#fff', borderBottom: '1px solid', borderColor: 'divider',
          }}>
            <IconButton onClick={() => router.push(backHref)} size="small" sx={{ p: 0.5 }}>
              <ArrowBackIcon fontSize="small" />
            </IconButton>
            <StudentAvatar
              userId={sub.student?.id}
              src={sub.student?.avatar_url}
              name={sub.student?.name}
              size={28}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: '0.82rem' }}>
                  {sub.student?.name || 'Student'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                  {timeAgo}
                </Typography>
              </Box>
              {/* Question text inline, truncated */}
              {questionText && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: '0.68rem', lineHeight: 1.3 }}>
                  {questionText}
                </Typography>
              )}
            </Box>
            {attempts.length > 1 && attemptIndex > 0 && (
              <Chip label={`Attempt ${attemptIndex}/${attempts.length}`} size="small" color="warning" variant="outlined" sx={{ height: 22, fontWeight: 700 }} />
            )}
            <Chip
              label={attemptStatusLabel(submission.status)}
              size="small"
              color={statusChipColor}
              sx={{ height: 22, fontWeight: 700, fontSize: '0.65rem' }}
            />
            {submission.question && <CategoryBadge category={submission.question.category} />}
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>

          {assignmentContextBar}
          {referenceStrip}

          {/* Image with toggle tabs + region annotations */}
          <Box sx={{ height: '50vh', bgcolor: '#1a1a1a', px: 0.5, pt: 0.5, pb: 0.5 }}>
            <ImageToggleTabs
              originalImageUrl={submission.original_image_url}
              overlayAnnotations={(sub.ai_overlay_annotations as any) || undefined}
              overlayImageUrl={workspaceData.overlayImageUrl}
              correctedImageUrl={workspaceData.correctedImageUrl}
              isEditMode={isEditMode}
              regionAnnotations={regionAnnotations}
              onRegionAnnotationsChange={setRegionAnnotations}
              questionCategory={submission.question?.category}
              questionContext={questionText}
              onOpenSketch={() => setSketchTrigger(t => t + 1)}
            />
          </Box>

          {/* Feedback Workspace */}
          <Box sx={{ bgcolor: 'background.paper' }}>
            <Box sx={{ px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>Feedback</Typography>
              {!isEditMode && (
                <Button
                  size="small" variant="outlined" startIcon={<EditOutlinedIcon />}
                  onClick={() => setIsEditMode(true)}
                  sx={{ textTransform: 'none', minHeight: 28, fontSize: '0.72rem' }}
                >
                  Edit
                </Button>
              )}
            </Box>

            <Box sx={{ p: 1.5 }}>
              {supersededBanner}
              {reReviewNotice}

              {submission.self_note && (
                <Paper variant="outlined" sx={{ p: 1, mb: 1.5, bgcolor: '#f0f7ff' }}>
                  <Typography variant="caption" fontWeight={600} color="primary.dark">Student&apos;s Note</Typography>
                  <Typography variant="body2" sx={{ mt: 0.25, fontSize: '0.82rem' }}>{submission.self_note}</Typography>
                </Paper>
              )}

              <AIFeedbackWorkspace
                submission={sub}
                getToken={getToken}
                onChange={handleWorkspaceChange}
                defaultCollapsed={false}
                readOnly={!isEditMode}
                sketchTrigger={sketchTrigger}
                evaluationType={submission.assignment?.evaluation_type ?? 'stars'}
                maxMarks={submission.assignment?.max_marks ?? 5}
              />

              {previousAttemptsPanel}

              {isEditMode && (
                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Tags
                  </Typography>
                  <TagEditor value={tagLabels} onChange={setTagLabels} />
                </Box>
              )}

              <Box sx={{ mt: 2 }}>
                <CommentSection submissionId={submission.id} getToken={getToken} canComment={true} />
              </Box>
            </Box>

            {/* Bottom padding to clear fixed action bar (48px) + BottomNav (64px).
                Both the grading bar and the locked bar are fixed, so reserve the
                same space either way. */}
            <Box sx={{ height: 120, flexShrink: 0 }} />
          </Box>
        </Box>

        {/* Fixed action bar above BottomNav */}
        {actionBar}

        {/* More actions menu */}
        <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
          <MenuItem onClick={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }} sx={{ color: 'error.main' }}>
            <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
            Delete Submission
          </MenuItem>
        </Menu>

        {/* Delete confirmation dialog */}
        <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
          <DialogTitle>Delete Submission?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will permanently delete the submission and all associated images. This cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
            <Button onClick={handleDeleteSubmission} color="error" variant="contained" disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Error snackbar */}
        <Snackbar
          open={!!error}
          autoHideDuration={5000}
          onClose={() => setError('')}
          message={error}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </>
    );
  }

  // ===================== DESKTOP LAYOUT =====================
  return (
    <Box sx={{
      // Negate parent padding to go edge-to-edge
      mx: { md: -4, sm: -3, xs: -2 },
      mt: { md: -3, xs: -2 },
      mb: { md: -3, xs: -10 },
      display: 'flex',
      height: 'calc(100vh - 64px)',
      overflow: 'hidden',
      // Break out of Container maxWidth on wide screens
      width: { md: 'calc(100% + 64px)', sm: 'calc(100% + 48px)' },
      maxWidth: { md: 'none' },
    }}>
      {/* LEFT: image with toggle tabs */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1.5,
          px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider',
          bgcolor: 'background.paper', flexShrink: 0,
        }}>
          <IconButton onClick={() => router.push(backHref)} size="small">
            <ArrowBackIcon />
          </IconButton>
          <StudentAvatar
            userId={sub.student?.id}
            src={sub.student?.avatar_url}
            name={sub.student?.name}
            size={36}
          />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>{sub.student?.name || 'Student'}</Typography>
              <Typography variant="caption" color="text.secondary">{timeAgo}</Typography>
            </Box>
            {questionText && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {questionText}
              </Typography>
            )}
          </Box>
          {submission.question && <CategoryBadge category={submission.question.category} />}
          {attempts.length > 1 && attemptIndex > 0 && (
            <Chip label={`Attempt ${attemptIndex}/${attempts.length}`} size="small" color="warning" variant="outlined" sx={{ fontWeight: 700 }} />
          )}
          <Chip
            label={attemptStatusLabel(submission.status)}
            size="small"
            color={statusChipColor}
            sx={{ fontWeight: 700 }}
          />
          <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)}>
            <MoreVertIcon />
          </IconButton>
        </Box>

        {assignmentContextBar}
        {referenceStrip}

        {/* Image with toggle + region annotations */}
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 1.5, bgcolor: '#e8e8e8' }}>
          <ImageToggleTabs
            originalImageUrl={submission.original_image_url}
            overlayAnnotations={(sub.ai_overlay_annotations as any) || undefined}
            overlayImageUrl={workspaceData.overlayImageUrl}
            correctedImageUrl={workspaceData.correctedImageUrl}
            isEditMode={isEditMode}
            regionAnnotations={regionAnnotations}
            onRegionAnnotationsChange={setRegionAnnotations}
            questionCategory={submission.question?.category}
            questionContext={questionText}
            onOpenSketch={() => setSketchTrigger(t => t + 1)}
          />
        </Box>
      </Box>

      {/* RIGHT: Feedback Workspace */}
      <Box sx={{
        width: 400, flexShrink: 0, borderLeft: '1px solid', borderColor: 'divider',
        bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>Feedback</Typography>
          {!isEditMode && (
            <Button
              size="small" variant="outlined" startIcon={<EditOutlinedIcon />}
              onClick={() => setIsEditMode(true)}
              sx={{ textTransform: 'none', minHeight: 28, fontSize: '0.75rem' }}
            >
              Edit
            </Button>
          )}
        </Box>
        {reviewPanel}
      </Box>

      {/* More actions menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }} sx={{ color: 'error.main' }}>
          <DeleteOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Delete Submission
        </MenuItem>
      </Menu>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => !deleting && setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Submission?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete the submission and all associated images. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDeleteSubmission} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={5000}
        onClose={() => setError('')}
        message={error}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}
