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
  Box, Skeleton, Typography, Paper, Alert,
  Button, useMediaQuery, useTheme, alpha,
  Breadcrumbs, Link as MuiLink,
} from '@neram/ui';
import NextLink from 'next/link';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
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
import InspirationSwitch from '@/components/drawings/review/InspirationSwitch';
import TeacherSketchActions from '@/components/sketchbook/TeacherSketchActions';
import { flipSketch } from '@/components/sketchbook/sketchbook-api';
import { canRedo, opensForGrading, reviewKindOf, wasReviewedBefore } from '@/lib/drawing-source';
import {
  drawingAttemptsToViews,
  attemptStatusLabel,
} from '@/lib/submission-history';
import { useNavBadges } from '@/components/NavBadgeProvider';
import type { DrawingSubmission, DrawingSubmissionWithDetails, DrawingTag } from '@neram/database/types';
import type { SketchbookFeatureFact, SubmissionInspirationState } from '@neram/database/queries/nexus';
import type { RegionAnnotation } from '@/lib/drawing-prompt-templates';
import type { Rotation } from '@/lib/image-rotation';
import { compressImage } from '@/utils/imageCompression';
import VoiceFeedbackRecorder from '@/components/drawings/voice/VoiceFeedbackRecorder';
import WalkthroughStage from '@/components/drawings/voice/WalkthroughStage';
import type { StagePlayback } from '@/components/drawings/voice/VoiceNotePlayer';
import { RATING_LABELS } from '@/lib/drawing-prompt-templates';
import type { VoiceFeedbackView } from '@/lib/drawing-voice-feedback';
import { useReviewQueue } from '@/hooks/useReviewQueue';
import { parseReviewContext, reviewBackHref, reviewCrumbs, reviewHref } from '@/lib/review-context';
import { useAiDraft } from '@/hooks/useAiDraft';
import { useAutoDraft } from '@/hooks/useAutoDraft';
import { BAND_LABEL } from '@/lib/drawing-triage';
import { PartBadge } from '@/components/question-bank/DrawingPartsView';
import { drawingPartsSummary, readDrawingParts } from '@/lib/drawing-parts';

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

  // Where this drawing was opened from (lib/review-context): Back, the trail,
  // J and K, and Save and next all follow that place.
  const reviewCtx = useMemo(() => parseReviewContext(searchParams), [searchParams]);
  const lane = reviewCtx.lane;

  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [attempts, setAttempts] = useState<DrawingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const backHref = submission ? reviewBackHref(reviewCtx, submission as any) : '/teacher/sketchbook';

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
  // The Show in Inspiration switch, the drawing this was practised from, where
  // it is featured, and a test drawing's marks ceiling (GET /api/drawing/submissions/[id]).
  const [inspiration, setInspiration] = useState<{ original: SubmissionInspirationState | null; reference: SubmissionInspirationState | null } | null>(null);
  const [practisedFrom, setPractisedFrom] = useState<{ item_id: string; title: string; image_url: string } | null>(null);
  const [featured, setFeatured] = useState<SketchbookFeatureFact[]>([]);
  const [examMaxMarks, setExamMaxMarks] = useState<number | null>(null);
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
  // A walkthrough playing over the big drawing. Null when the stage shows the
  // drawing and its markup tools as usual.
  const [stagePlayback, setStagePlayback] = useState<StagePlayback | null>(null);
  const stageAnchorRef = useRef<HTMLDivElement | null>(null);
  const stageWasOpenRef = useRef(false);

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
      setInspiration(data.inspiration ?? null);
      setPractisedFrom(data.practised_from ?? null);
      setFeatured(Array.isArray(data.featured) ? data.featured : []);
      setExamMaxMarks(typeof data.exam_max_marks === 'number' ? data.exam_max_marks : null);
    } catch {
      setSubmission(null);
      setAttempts([]);
      setVoice(null);
      setVoiceByAttempt({});
      setInspiration(null); setPractisedFrom(null); setFeatured([]); setExamMaxMarks(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // On a phone the stage is above the rail, usually scrolled out of view by the
  // time the teacher reaches the voice note. Bring it back when a replay opens.
  useEffect(() => {
    const opened = !!stagePlayback && !stageWasOpenRef.current;
    stageWasOpenRef.current = !!stagePlayback;
    if (!opened || !isMobile) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    stageAnchorRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [stagePlayback, isMobile]);

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

    // Which rounds open ready to grade (see opensForGrading in lib/drawing-source).
    // A round that opens locked is never a dead end: the bottom bar's "Evaluate" reopens it.
    const newerAttemptExists = attempts.some(
      (a) => a.id !== submission.id && a.submitted_at > submission.submitted_at,
    );
    setIsEditMode(opensForGrading(submission as any, newerAttemptExists));

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
        body: JSON.stringify({
          ...updates,
          clear_annotations: clearAnnotations,
          // Turning a sheet Gemini already turned upright overrules it.
          clear_auto_rotation: tab !== 'corrected' && !!(submission as any).auto_rotated_deg,
        }),
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
      setSubmission((prev) => (prev
        ? { ...prev, ...updated, ...(tab !== 'corrected' ? { auto_rotated_deg: null } : {}) } as typeof prev
        : prev));
    } finally {
      rotatingRef.current = false;
    }
  }, [submission, getToken]);

  // On practice the reaction is set by the quick bar (Nice, Great, Wow), and the
  // workspace's own picker is hidden. The workspace still reports its stale copy
  // of the reaction with every other change, so keep the page's value.
  const isPracticeRef = useRef(false);
  isPracticeRef.current = !!submission && reviewKindOf(submission as any) === 'practice';
  const handleWorkspaceChange = useCallback((data: WorkspaceData) => {
    const next = isPracticeRef.current ? { ...data, reaction: workspaceRef.current.reaction } : data;
    workspaceRef.current = next;
    setWorkspaceData(next);
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
          // The old gallery flag stays as it was. Inspiration has its own switch.
          is_gallery_visible: !!(submission as any)?.is_gallery_visible,
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
      const verb = reviewAction === 'redo' ? 'Redo' : 'Review';
      // A held assignment tells nobody on Complete, and a practice re-save that
      // changed nothing tells nobody either, so neither receipt may say "sent".
      const told = result?.held
        ? `${verb} for ${who} held. ${result.held_count} waiting to hand back.`
        : result?.notified
          ? `${verb} sent to ${who}.` + (chatMissed ? ' Teams chat did not send, the Nexus bell did.' : '')
          : `${verb} saved.`;
      // A lane, a sketchbook month, the flip-through or an exam walk their own
      // list; a plain assignment link uses the server's oldest-first pick.
      const ownList = !!lane || (reviewCtx.from !== null && reviewCtx.from !== 'assignment');
      const nextId = ownList ? queue.afterId : result?.next_submission_id;
      const waiting = Math.max(0, queue.total - (queue.position != null ? 1 : 0));
      const left = lane
        ? `${waiting} left in ${BAND_LABEL[lane]}.`
        : reviewCtx.from === 'flip' || reviewCtx.from === 'exam'
          ? `${waiting} left.`
          : reviewCtx.from === 'sketchbook'
            ? ''
            : `${result?.remaining} left to review.`;
      if (nextId) {
        router.push(reviewHref(nextId, reviewCtx, { notice: `${told} ${left}`.trim() }));
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
    (attemptId: string) => router.push(reviewHref(attemptId, reviewCtx)),
    [router, reviewCtx],
  );

  // The AI draft on this sheet, if evaluation ever produced one. Null otherwise.
  const { draft: aiDraft, reload: reloadAiDraft } = useAiDraft(id, getToken);

  /**
   * A draft can change more than the rail: Gemini may have turned the photo
   * upright and tagged the sheet. Pick up both without a full reload, and add
   * the tags to what is on screen rather than replacing it, so the next save
   * never wipes a tag the teacher typed meanwhile.
   */
  const refreshAfterDraft = useCallback(async () => {
    reloadAiDraft();
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      const fresh = data.submission;
      if (!fresh) return;
      setSubmission((prev) => (prev && prev.id === fresh.id
        ? { ...prev, original_image_url: fresh.original_image_url, auto_rotated_deg: fresh.auto_rotated_deg ?? null } as typeof prev
        : prev));
      const freshTags = ((fresh.tags as DrawingTag[] | undefined) || []).map((t) => t.label);
      if (freshTags.length) {
        setTagLabels((prev) => {
          const seen = new Set(prev.map((l) => l.toLowerCase()));
          const added = freshTags.filter((l) => !seen.has(l.toLowerCase()));
          return added.length ? [...prev, ...added] : prev;
        });
      }
    } catch {
      // The draft itself still loaded; the image and tags catch up on the next open.
    }
  }, [getToken, id, reloadAiDraft]);

  const autoDraft = useAutoDraft({
    submissionId: submission ? id : null,
    getToken,
    active: !!submission && isEditMode && submission.status === 'submitted',
    hasDraft: !!aiDraft,
    onDrafted: refreshAfterDraft,
  });
  const [uprightNoticeHidden, setUprightNoticeHidden] = useState(false);

  // The queue this drawing belongs to, for J and K and the "3 / 12" chip.
  const queue = useReviewQueue(
    reviewCtx,
    ((submission as any)?.assignment_id as string | null) ?? null,
    id,
    getToken,
  );

  // A practice drawing on screen for 1.5 seconds has been looked at: the same
  // rule as the flip-through card, so it leaves that inbox.
  useEffect(() => {
    if (!submission || reviewKindOf(submission as any) !== 'practice') return;
    const timer = setTimeout(() => { void flipSketch(getToken, submission.id, 'seen').catch(() => {}); }, 1500);
    return () => clearTimeout(timer);
  }, [submission?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Practice only: move on without saving. From the flip-through that is a skip. */
  const handleNext = useCallback(() => {
    if (reviewCtx.from === 'flip' && submission && !(submission as any).reviewed_at) {
      void flipSketch(getToken, submission.id, 'skipped').catch(() => {});
    }
    router.push(queue.nextId ? reviewHref(queue.nextId, reviewCtx) : backHref);
  }, [reviewCtx, submission, getToken, router, queue.nextId, backHref]);

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
        router.push(reviewHref(to, reviewCtx));
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
  }, [reviewCtx, router]);

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
  const kind = reviewKindOf(sub);
  const isPractice = kind === 'practice';
  // A test drawing is marked out of the marks its test gives the question. When
  // that cannot be read, 100 keeps the box usable rather than refusing a mark.
  const evaluationType: 'marks' | 'stars' = kind === 'test' ? 'marks' : (submission.assignment?.evaluation_type ?? 'stars');
  const maxMarks = kind === 'test' ? (examMaxMarks ?? 100) : (submission.assignment?.max_marks ?? 5);

  // Which round of the thread is on screen. The header used to label every round
  // with the thread total, so an older attempt still read as the newest one.
  const attemptIndex = attempts.findIndex((a) => a.id === submission.id) + 1;
  const statusChipColor: 'warning' | 'success' | 'info' =
    submission.status === 'redo' ? 'warning'
      : ['reviewed', 'completed'].includes(submission.status) ? 'success'
      : 'info';

  // Where this drawing sits: its assignment, the student's sketchbook, the exam
  // or the Inspiration drawing it was opened from (lib/review-context).
  const crumbs = reviewCrumbs(reviewCtx, sub);
  const ContextIcon =
    kind === 'assignment' ? AssignmentOutlinedIcon
      : kind === 'test' ? EventNoteOutlinedIcon
        : reviewCtx.from === 'inspiration' ? CollectionsOutlinedIcon
          : AutoStoriesOutlinedIcon;
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
      <ContextIcon sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
      <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: '0.85rem' }} />} sx={{ flex: 1, minWidth: 0 }}>
        {crumbs.map((c) =>
          c.href ? (
            <MuiLink
              key={c.label}
              component={NextLink}
              href={c.href}
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
              {c.label}
            </MuiLink>
          ) : (
            <Typography key={c.label} variant="caption" color="primary.dark" sx={{ fontWeight: 700 }}>
              {c.label}
            </Typography>
          ),
        )}
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
  // A bank question split into parts ("1(a) ... 1(b)" or "X OR Y"): how the
  // student was told to answer, each part, and that part's solution, so the
  // teacher marks against the option the student actually drew.
  const qbParts = readDrawingParts(submission.qb_drawing_parts);
  const partsStrip = qbParts ? (
    <Box
      sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.5 }}>
        {drawingPartsSummary(qbParts)}
      </Typography>
      <Box component="ul" sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, m: 0, p: 0, listStyle: 'none' }}>
        {qbParts.items.map((part) => (
          <Box
            component="li"
            key={part.id}
            sx={{
              display: 'flex',
              gap: 0.75,
              alignItems: 'flex-start',
              width: 260,
              flexShrink: 0,
              p: 0.75,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <PartBadge>{part.label}</PartBadge>
            <Typography
              variant="caption"
              title={part.text}
              sx={{
                flex: 1,
                minWidth: 0,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {part.text}
            </Typography>
            {part.solution_image_url && (
              <Box
                component="button"
                type="button"
                aria-label={`Open the solution for ${part.label}`}
                onClick={() => window.open(part.solution_image_url!, '_blank', 'noopener')}
                sx={{ p: 0, border: 0, bgcolor: 'transparent', cursor: 'pointer', flexShrink: 0, borderRadius: 1 }}
              >
                <Box
                  component="img"
                  src={part.solution_image_url}
                  alt={`Solution for ${part.label}`}
                  sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1, display: 'block', border: '1px solid', borderColor: 'divider' }}
                />
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  ) : null;

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

  // A sketch made with "Practise this": the Inspiration drawing it was drawn from.
  const practisedStrip = practisedFrom ? (
    <Box
      component={NextLink}
      href={`/teacher/inspiration/${practisedFrom.item_id}`}
      sx={{
        px: 1.5, py: 1, minHeight: 56, display: 'flex', alignItems: 'center', gap: 1,
        borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0,
        color: 'text.primary', textDecoration: 'none',
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 },
      }}
    >
      <Box component="img" src={practisedFrom.image_url} alt="" sx={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block' }}>Practised from Inspiration</Typography>
        <Typography variant="body2" noWrap>{practisedFrom.title}</Typography>
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
  //
  // wasReviewedBefore, not a raw status check: a sketch is stored 'completed'
  // the moment it is uploaded (drawing-source.ts), which used to make this
  // banner (and the "Update review" button below) claim every brand-new,
  // never-reviewed sketch was already reviewed.
  const reReviewNotice = (submission.status === 'redo' || wasReviewedBefore(sub)) && isEditMode && !isSuperseded ? (
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
      onStagePlayback={setStagePlayback}
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
      <Typography variant="subtitle2" component="h2" fontWeight={700} sx={{ flex: 1, fontSize: '0.85rem' }}>
        Feedback
      </Typography>
      {/* The running verdict, so it stays in sight while the rail scrolls. */}
      {evaluationType === 'marks'
        ? workspaceData.marks != null && (
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mr: 1 }}>
              {workspaceData.marks}/{maxMarks}
            </Typography>
          )
        : workspaceData.rating > 0 && (
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mr: 1 }}>
              {workspaceData.rating}/5 {RATING_LABELS[workspaceData.rating] || ''}
            </Typography>
          )}
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
            queue={{ ...queue, laneLabel: lane ? BAND_LABEL[lane] : null }}
          />
        }
        contextBar={assignmentContextBar}
        referenceStrip={
          practisedStrip || partsStrip || referenceStrip ? (
            <>
              {practisedStrip}
              {partsStrip}
              {referenceStrip}
            </>
          ) : null
        }
        stage={
          <>
          <Box ref={stageAnchorRef} aria-hidden sx={{ position: 'absolute', top: 0, height: 0 }} />
          {sub.auto_rotated_deg && !uprightNoticeHidden && !stagePlayback && (
            <Alert
              severity="info"
              onClose={() => setUprightNoticeHidden(true)}
              action={isEditMode ? (
                <Button
                  color="inherit"
                  size="small"
                  onClick={async () => {
                    setUprightNoticeHidden(true);
                    const undo = ((360 - Number(sub.auto_rotated_deg)) % 360) as Rotation;
                    try {
                      await handleRotate(undo, 'original', regionAnnotations.length > 0);
                    } catch (err) {
                      setUprightNoticeHidden(false);
                      setError(err instanceof Error ? err.message : 'Could not turn it back');
                    }
                  }}
                  sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
                >
                  Undo
                </Button>
              ) : undefined}
              sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 5, boxShadow: 2, py: 0, alignItems: 'center', maxWidth: 'calc(100% - 16px)' }}
            >
              Turned upright automatically
            </Alert>
          )}
          {stagePlayback ? (
            <WalkthroughStage playback={stagePlayback} />
          ) : (
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
            aiMarks={aiDraft?.marks}
          />
          )}
          </>
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
            evaluationType={evaluationType}
            maxMarks={maxMarks}
            selfNote={submission.self_note}
            showEncouragement={!isPractice}
            quickActions={isPractice ? (
              <TeacherSketchActions
                key={submission.id}
                compact
                sketchId={submission.id}
                reaction={(['heart', 'fire', 'wow'] as const).includes(workspaceData.reaction as never) ? (workspaceData.reaction as 'heart' | 'fire' | 'wow') : null}
                featured={featured}
                selfNote={submission.self_note}
                onChanged={(change) => {
                  if (change.reaction !== undefined) {
                    const next = { ...workspaceRef.current, reaction: change.reaction as WorkspaceData['reaction'] };
                    workspaceRef.current = next;
                    setWorkspaceData(next);
                  }
                  if (change.featured) setFeatured(change.featured);
                }}
              />
            ) : null}
            supersededBanner={supersededBanner}
            reReviewNotice={reReviewNotice}
            voiceSection={voiceSection}
            previousAttemptsPanel={previousAttemptsPanel}
            tagLabels={tagLabels}
            onTagLabelsChange={setTagLabels}
            aiDraft={aiDraft}
            draftState={autoDraft}
          />
        }
        actionBar={
          <ReviewActionBar
            isEditMode={isEditMode}
            isSuperseded={isSuperseded}
            attemptIndex={attemptIndex}
            attemptTotal={attempts.length}
            statusLabel={attemptStatusLabel(submission.status)}
            alreadyReviewed={wasReviewedBefore(sub)}
            onEvaluate={() => setIsEditMode(true)}
            onOpenLatest={latestAttempt ? () => openAttempt(latestAttempt.id) : null}
            onSaveDraft={handleSaveDraft}
            draftSaving={draftSaving}
            draftSaved={draftSaved}
            onRedo={() => { setAction('redo'); handleSaveReview('redo'); }}
            onComplete={() => { setAction('complete'); handleSaveReview('complete'); }}
            hasAiDraft={!!aiDraft}
            saving={saving}
            pendingAction={action}
            voiceBusy={voiceBusy}
            mode={isPractice ? 'practice' : 'owed'}
            canRedo={canRedo(sub)}
            onNext={isPractice ? handleNext : null}
            inspirationSlot={
              inspiration?.original ? (
                <InspirationSwitch
                  state={inspiration.original}
                  getToken={getToken}
                  onChange={(next) => setInspiration((prev) => (prev ? { ...prev, original: next } : prev))}
                />
              ) : null
            }
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
