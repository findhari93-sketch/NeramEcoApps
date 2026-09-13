'use client';

/**
 * Reviewing one drawing.
 *
 * This file owns the data, the handlers and the banners. Everything visual lives
 * in `components/drawings/review/`, and `ReviewShell` is the only thing that
 * decides anything from the viewport width. Before that split the page carried
 * two complete `return`s, one per layout, so the feedback rail existed twice and
 * every change to it had to be made in both or it silently applied to one width.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box, Skeleton, Typography, Paper,
  Button, useMediaQuery, useTheme, alpha,
  Breadcrumbs, Link as MuiLink,
} from '@neram/ui';
import NextLink from 'next/link';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ImageToggleTabs from '@/components/drawings/ImageToggleTabs';
import { type WorkspaceData } from '@/components/drawings/AIFeedbackWorkspace';
import SubmissionHistoryTimeline from '@/components/assignments/SubmissionHistoryTimeline';
import ReviewShell from '@/components/drawings/review/ReviewShell';
import ReviewHeader from '@/components/drawings/review/ReviewHeader';
import ReviewPanelBody from '@/components/drawings/review/ReviewPanelBody';
import ReviewActionBar from '@/components/drawings/review/ReviewActionBar';
import ReviewDialogs from '@/components/drawings/review/ReviewDialogs';
import {
  drawingAttemptsToViews,
  attemptStatusLabel,
  drawingRoundOpensForGrading,
} from '@/lib/submission-history';
import { useNavBadges } from '@/components/NavBadgeProvider';
import type { DrawingSubmission, DrawingSubmissionWithDetails, DrawingTag } from '@neram/database/types';
import type { RegionAnnotation } from '@/lib/drawing-prompt-templates';
import type { Rotation } from '@/lib/image-rotation';
import { compressImage } from '@/utils/imageCompression';
import VoiceFeedbackRecorder from '@/components/drawings/voice/VoiceFeedbackRecorder';
import type { VoiceFeedbackView } from '@/lib/drawing-voice-feedback';
import { useReviewQueue } from '@/hooks/useReviewQueue';

export default function DrawingReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // getTeacherToken carries ChatMessage.Send, which Redo and Complete need to put a
  // card in the student's Teams chat. getToken stays for everything else.
  const { getToken, getTeacherToken } = useNexusAuthContext();
  const { refreshBadges } = useNavBadges();
  const theme = useTheme();
  // Only still read for the avatar, whose size is a number rather than a style.
  // Layout is ReviewShell's job and is expressed as breakpoints.
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
  const [voice, setVoice] = useState<VoiceFeedbackView | null>(null);
  const [voiceByAttempt, setVoiceByAttempt] = useState<Record<string, VoiceFeedbackView>>({});
  // True while a note is being recorded or saved. Redo and Complete wait for it,
  // so a review never goes out a few seconds ahead of the note it should carry.
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [studentTeamsEmail, setStudentTeamsEmail] = useState<string | null>(null);
  // Save and next arrives with who was just told and how many drawings are left.
  const [notice, setNotice] = useState('');

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
      setVoice(data.voice_feedback ?? null);
      setVoiceByAttempt(data.voice_by_submission ?? {});
      setStudentTeamsEmail(data.student_teams_email ?? null);
    } catch {
      setSubmission(null);
      setAttempts([]);
      setVoice(null);
      setVoiceByAttempt({});
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

  // ─── Rotation ───────────────────────────────────────────────────────────────

  const rotatingRef = useRef(false);

  /**
   * Re-encode one stored image with the turn baked into the pixels and return
   * the new URL. Going through fetch -> blob -> object URL keeps the canvas
   * same-origin, so it is never tainted and toBlob always succeeds.
   */
  const bakeRotation = async (
    url: string, rotation: Rotation, bucket: string, token: string,
  ): Promise<string> => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not load the image to rotate');
    const rotated = await compressImage(await res.blob(), 2400, 0.9, 'drawing.jpg', rotation);

    const form = new FormData();
    form.append('file', rotated, 'drawing.jpg');
    form.append('bucket', bucket);
    const upload = await fetch('/api/drawing/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!upload.ok) throw new Error('Upload failed while saving the rotation');
    const { url: newUrl } = await upload.json();
    return newUrl as string;
  };

  const handleRotate = useCallback(async (
    rotation: Rotation,
    tab: 'original' | 'overlay' | 'corrected',
    clearAnnotations: boolean,
  ) => {
    if (!submission || rotatingRef.current) return;
    rotatingRef.current = true;
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session expired. Please refresh and try again.');
      const ws = workspaceRef.current;
      const updates: Record<string, string> = {};

      if (tab === 'corrected') {
        // A teacher reference is independent artwork, so it turns on its own.
        if (!ws.correctedImageUrl) throw new Error('There is no reference image to rotate');
        updates.corrected_image_url =
          await bakeRotation(ws.correctedImageUrl, rotation, 'drawing-reviewed', token);
      } else {
        // The overlay is a flattened raster of the original plus the teacher's
        // marks at identical dimensions, so the pair has to turn together or
        // the marks stop lining up with the drawing underneath.
        updates.original_image_url =
          await bakeRotation(submission.original_image_url, rotation, 'drawing-uploads', token);
        if (ws.overlayImageUrl) {
          updates.reviewed_image_url =
            await bakeRotation(ws.overlayImageUrl, rotation, 'drawing-reviewed', token);
        }
      }

      const res = await fetch(`/api/drawing/submissions/${submission.id}/images`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updates, clear_annotations: clearAnnotations }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Could not save the rotation');
      }
      const { submission: updated } = await res.json();

      // Keep the in-memory workspace in step. Without this the next draft save
      // would write the pre-rotation URLs back over the ones just stored.
      const nextWorkspace: WorkspaceData = {
        ...ws,
        overlayImageUrl: updates.reviewed_image_url ?? ws.overlayImageUrl,
        correctedImageUrl: updates.corrected_image_url ?? ws.correctedImageUrl,
      };
      workspaceRef.current = nextWorkspace;
      setWorkspaceData(nextWorkspace);
      if (clearAnnotations) setRegionAnnotations([]);

      // Merge the fresh row in rather than refetching, so the stage swaps to the
      // upright image without a full-page loading flash.
      setSubmission((prev) => (prev ? { ...prev, ...updated } : prev));
    } finally {
      rotatingRef.current = false;
    }
  }, [submission, getToken]);

  const handleWorkspaceChange = useCallback((data: WorkspaceData) => {
    workspaceRef.current = data;
    setWorkspaceData(data);
  }, []);

  const handleSaveReview = async (reviewAction: 'redo' | 'complete') => {
    setSaving(true);
    setError('');
    try {
      // The teacher token is what lets the review put a card in the student's
      // Teams chat. If it cannot be had silently, the review still saves on the
      // ordinary token and the student still gets the Nexus bell and Teams alert.
      const token = (await getTeacherToken().catch(() => null)) || (await getToken());
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

      const result = await res.json().catch(() => ({}) as any);

      refreshBadges();

      // Save and next: open the drawing that has waited longest, carrying a one
      // line receipt of who was just told. With nothing left, back to the list.
      const who = String((submission as any)?.student?.name || '').trim().split(/\s+/)[0] || 'the student';
      const chatMissed = result?.delivery && result.delivery.chat === false;
      // A held assignment tells nobody on Complete, so the receipt must not say
      // "sent": that would be the one sentence on this screen that is false.
      const told = result?.held
        ? `${reviewAction === 'redo' ? 'Redo' : 'Review'} for ${who} held. ${result.held_count} waiting to hand back.`
        : `${reviewAction === 'redo' ? 'Redo' : 'Review'} sent to ${who}.` +
          (chatMissed ? ' Teams chat did not send, the Nexus bell did.' : '');
      if (result?.next_submission_id) {
        const qs = new URLSearchParams();
        if (fromAssignmentId) qs.set('assignment', fromAssignmentId);
        qs.set('notice', `${told} ${result.remaining} left to review.`);
        router.push(`/teacher/drawing-reviews/${result.next_submission_id}?${qs.toString()}`);
      } else {
        router.push(backHref);
      }
      // Refresh so the assignment roster / queue reflect the new reviewed state.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // The receipt Save and next carried over. Shown once, then taken out of the
  // address so a refresh does not repeat it.
  useEffect(() => {
    const incoming = searchParams.get('notice');
    if (!incoming) return;
    setNotice(incoming);
    const url = new URL(window.location.href);
    url.searchParams.delete('notice');
    window.history.replaceState(window.history.state, '', url.toString());
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The queue this drawing belongs to, for J and K and the "3 / 12" chip.
  const queue = useReviewQueue(
    fromAssignmentId ?? ((submission as any)?.assignment_id as string | null) ?? null,
    id,
    getToken,
  );

  // Handlers change identity every render; the key listener reads the latest.
  const saveReviewRef = useRef(handleSaveReview);
  saveReviewRef.current = handleSaveReview;
  const keyStateRef = useRef({ isEditMode, saving, draftSaving, voiceBusy, queue });
  keyStateRef.current = { isEditMode, saving, draftSaving, voiceBusy, queue };

  /**
   * J next, K previous, Enter completes.
   *
   * Only when nothing interactive has focus. Enter on a button activates that
   * button, Enter in the feedback box is a new line, and nothing here fires
   * while a dialog or the canvas is open. Completing tells the student on an
   * assignment that does not hold its reviews, so a stray Enter from inside a
   * control must never reach it.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"], [role="dialog"], [role="menu"]')) {
        return;
      }
      const state = keyStateRef.current;
      const go = (to: string | null) => {
        if (!to) return;
        e.preventDefault();
        const qs = fromAssignmentId ? `?assignment=${fromAssignmentId}` : '';
        router.push(`/teacher/drawing-reviews/${to}${qs}`);
      };
      if (e.key === 'j' || e.key === 'J') go(state.queue.nextId);
      else if (e.key === 'k' || e.key === 'K') go(state.queue.prevId);
      else if (e.key === 'Enter') {
        if (!state.isEditMode || state.saving || state.draftSaving || state.voiceBusy) return;
        e.preventDefault();
        setAction('complete');
        void saveReviewRef.current('complete');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fromAssignmentId, router]);

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

  // Question text (for prompt context)
  //
  // An exam drawing points straight at the bank question and has no
  // drawing_questions mirror, so submission.question is null for it. Without
  // the fallback the manual Gemini prompts below lose their ASSIGNMENT line
  // entirely, which is the single most useful thing in them, on exactly the
  // submissions this feature creates.
  const questionText =
    submission.question?.question_text || (submission as any).qb_question?.question_text || '';

  // Reference / expected-output images the teacher set on the assignment (may be
  // several). These live on the backing question; the review screen never showed
  // them before, so the teacher could not see what they had asked the student for.
  const referenceImages: string[] = ((submission.question as any)?.reference_images || [])
    .map((r: any) => (typeof r === 'string' ? r : r?.url))
    .filter((u: any): u is string => typeof u === 'string' && u.length > 0);
  const referenceStrip = referenceImages.length > 0 ? (
    <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
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
        voiceByKey={voiceByAttempt}
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
          ? sub.assignment_id && !sub.exam_attempt_id
            ? 'Sent back for a redo. Complete it here to close it out, or send it back again. The student is messaged when the outcome changes or you send a new voice note.'
            : 'Sent back for a redo. Grade it here to close it out, or send it back again.'
          : sub.assignment_id && !sub.exam_attempt_id
            ? 'Editing a reviewed submission. The student is messaged only if the outcome changes or you send a new voice note.'
            : 'Editing a reviewed submission.'}
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
        sx={{ mt: 1, textTransform: 'none', fontWeight: 700, minHeight: 48 }}
      >
        Go to latest attempt
      </Button>
    </Paper>
  ) : null;

  // Voice notes are for assignment drawings only. An exam result is embargoed
  // until it is published, and a practice drawing has no page to play one on.
  const canUseVoice = !!sub.assignment_id && !sub.exam_attempt_id;
  const voiceSection = canUseVoice ? (
    <VoiceFeedbackRecorder
      key={submission.id}
      submissionId={submission.id}
      voice={voice}
      readOnly={!isEditMode}
      imageUrl={submission.original_image_url}
      getToken={getToken}
      onChange={(v) => {
        setVoice(v);
        setVoiceByAttempt((prev) => {
          const next = { ...prev };
          if (v) next[submission.id] = v;
          else delete next[submission.id];
          return next;
        });
      }}
      onBusyChange={setVoiceBusy}
    />
  ) : null;

  // The student's own Teams chat, where any reply to the review card lands.
  const teamsChatUrl = studentTeamsEmail
    ? `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(studentTeamsEmail)}`
    : null;

  const panelHeader = (
    <Box
      sx={{
        px: { xs: 1.5, md: 2 },
        py: { xs: 0.75, md: 1 },
        borderBottom: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>
        Feedback
      </Typography>
      {!isEditMode && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditOutlinedIcon />}
          onClick={() => setIsEditMode(true)}
          sx={{ textTransform: 'none', minHeight: 28, fontSize: { xs: '0.72rem', md: '0.75rem' } }}
        >
          Edit
        </Button>
      )}
    </Box>
  );

  return (
    <>
      <ReviewShell
        header={
          <ReviewHeader
            onBack={() => router.push(backHref)}
            studentId={sub.student?.id}
            studentName={sub.student?.name}
            studentAvatarUrl={sub.student?.avatar_url}
            timeAgo={timeAgo}
            questionText={questionText}
            category={submission.question?.category}
            attemptIndex={attemptIndex}
            attemptTotal={attempts.length}
            statusLabel={attemptStatusLabel(submission.status)}
            statusColor={statusChipColor}
            onOpenMenu={setMenuAnchor}
            compact={isMobile}
            queue={queue}
          />
        }
        contextBar={assignmentContextBar}
        referenceStrip={referenceStrip}
        stage={
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
            onOpenSketch={() => setSketchTrigger((t) => t + 1)}
            onRotate={isEditMode ? handleRotate : undefined}
          />
        }
        panelHeader={panelHeader}
        panelBody={
          <ReviewPanelBody
            submissionId={submission.id}
            submission={sub}
            getToken={getToken}
            onWorkspaceChange={handleWorkspaceChange}
            isEditMode={isEditMode}
            sketchTrigger={sketchTrigger}
            evaluationType={submission.assignment?.evaluation_type ?? 'stars'}
            maxMarks={submission.assignment?.max_marks ?? 5}
            selfNote={submission.self_note}
            supersededBanner={supersededBanner}
            reReviewNotice={reReviewNotice}
            voiceSection={voiceSection}
            previousAttemptsPanel={previousAttemptsPanel}
            tagLabels={tagLabels}
            onTagLabelsChange={setTagLabels}
          />
        }
        actionBar={
          <ReviewActionBar
            isEditMode={isEditMode}
            isSuperseded={isSuperseded}
            attemptIndex={attemptIndex}
            attemptTotal={attempts.length}
            statusLabel={attemptStatusLabel(submission.status)}
            alreadyReviewed={['reviewed', 'completed'].includes(submission.status)}
            onEvaluate={() => setIsEditMode(true)}
            onOpenLatest={latestAttempt ? () => openAttempt(latestAttempt.id) : null}
            onSaveDraft={handleSaveDraft}
            draftSaving={draftSaving}
            draftSaved={draftSaved}
            onRedo={() => { setAction('redo'); handleSaveReview('redo'); }}
            onComplete={() => { setAction('complete'); handleSaveReview('complete'); }}
            saving={saving}
            pendingAction={action}
            voiceBusy={voiceBusy}
            showInGallery={showInGallery}
            onShowInGalleryChange={setShowInGallery}
          />
        }
      />

      <ReviewDialogs
        menuAnchor={menuAnchor}
        onCloseMenu={() => setMenuAnchor(null)}
        teamsChatUrl={teamsChatUrl}
        onRequestDelete={() => { setMenuAnchor(null); setDeleteDialogOpen(true); }}
        deleteOpen={deleteDialogOpen}
        deleting={deleting}
        onCancelDelete={() => setDeleteDialogOpen(false)}
        onConfirmDelete={handleDeleteSubmission}
        error={error}
        onClearError={() => setError('')}
        notice={notice}
        onClearNotice={() => setNotice('')}
      />
    </>
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
