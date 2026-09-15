'use client';

/**
 * A drawing assignment, for the student who drew it.
 *
 * Modelled on the teacher's review screen: the drawing is a fixed stage and
 * everything about it scrolls beside it (below it on a phone). The rule the
 * whole screen follows is ONE DRAWING, MANY LAYERS. The teacher's marks, the
 * corrected image, the voice walkthrough and every earlier attempt change what
 * the stage shows; none of them puts a second copy of the drawing on screen. The
 * page this replaces showed the drawing, then the voice player drew it again to
 * replay the teacher's strokes on, one under the other.
 *
 * The panel follows the order a student should take feedback in: where it
 * stands, then listen, then look at the numbered marks, then read, then the
 * scores. The brief stays one tap away.
 *
 * Which attempt is showing lives in `?attempt=N`, replaced rather than pushed,
 * so a link can open an earlier attempt and Back still leaves the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Box, Chip, IconButton, Stack, Tooltip, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import OpenInFullRoundedIcon from '@mui/icons-material/OpenInFullRounded';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReviewShell from '@/components/drawings/review/ReviewShell';
import ImageToggleTabs from '@/components/drawings/ImageToggleTabs';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import VoiceNotePlayer, { type StagePlayback } from '@/components/drawings/voice/VoiceNotePlayer';
import WalkthroughStage from '@/components/drawings/voice/WalkthroughStage';
import { useVoiceListenReporter } from '@/components/drawings/voice/useVoiceListenReporter';
import type { VoiceFeedbackView } from '@/lib/drawing-voice-feedback';
import type { SubmitMode } from '@/lib/assignment-submit-window';
import type { AssignmentClock } from '@/lib/assignment-clock';
import { dueLabel } from '@/lib/assignment-due-label';
import { parseAttemptParam, resolveAttemptIndex } from '@/lib/drawing-attempt-selection';
import { notesFromAnnotations } from '@/lib/drawing-region-notes';
import { briefStartsOpen, primaryAction, railMode } from '@/lib/drawing-workspace-state';
import { STATUS_META } from '@/lib/drawing-student-status';
import { referenceImagesOf } from '../AssignmentBriefBody';
import WorkspaceHeader from './WorkspaceHeader';
import AttemptSwitcher from './AttemptSwitcher';
import ReferenceStage from './ReferenceStage';
import VerdictCard from './VerdictCard';
import WhatToFixList from './WhatToFixList';
import RubricBreakdown from './RubricBreakdown';
import BriefSection from './BriefSection';
import WorkspaceActionBar from './WorkspaceActionBar';
import StageViewerDialog from './StageViewerDialog';
import type { AssignmentRecording, StudentAssignmentDetail, StudentDrawingAttempt, StudentRubric } from './types';

export interface StudentDrawingWorkspaceProps {
  detail: StudentAssignmentDetail;
  /** Oldest first, already gated by the server. */
  attempts: StudentDrawingAttempt[];
  voiceBySubmission: Record<string, VoiceFeedbackView>;
  rubric: StudentRubric | null;
  submitMode: SubmitMode;
  lockedReason: string | null;
  clock: AssignmentClock | null;
  recording: AssignmentRecording;
  getToken: () => Promise<string | null>;
  onChanged: () => void | Promise<void>;
  onOpenAttachment: (studyFileId: string) => void;
  onBack: () => void;
}

const sectionTitleSx = { fontWeight: 800, mb: 1 } as const;

export default function StudentDrawingWorkspace({
  detail, attempts, voiceBySubmission, rubric, submitMode, lockedReason, clock, recording,
  getToken, onChanged, onOpenAttachment, onBack,
}: StudentDrawingWorkspaceProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  // Between 900 and 1200px the sidebar and the panel leave the drawing column
  // about 300px wide, too narrow for a row of attempt buttons.
  const isWide = useMediaQuery(theme.breakpoints.up('lg'));
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const count = attempts.length;
  const selection = resolveAttemptIndex(count, parseAttemptParam(searchParams?.get('attempt')));
  const attempt = selection.index > 0 ? attempts[selection.index - 1] : null;
  const latest = count ? attempts[count - 1] : null;
  const mode = railMode(attempt);
  const voice = attempt ? voiceBySubmission[attempt.id] ?? null : null;
  const bands = attempt ? rubric?.by_submission[attempt.id]?.bands : undefined;
  const { notes, regions } = useMemo(() => notesFromAnnotations(attempt?.ai_overlay_annotations), [attempt]);

  const [stagePlayback, setStagePlayback] = useState<StagePlayback | null>(null);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [shownImage, setShownImage] = useState<string | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const railBodyRef = useRef<HTMLDivElement>(null);
  const reportListen = useVoiceListenReporter(getToken, voice?.id);

  const replaceQuery = useCallback(
    (index: number | null) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      if (index == null || index >= count) params.delete('attempt');
      else params.set('attempt', String(index));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [count, pathname, router, searchParams],
  );

  // A link to an attempt that does not exist is quietly pointed at the newest.
  useEffect(() => {
    if (!selection.valid) replaceQuery(null);
  }, [selection.valid, replaceQuery]);

  // A different attempt is a different drawing: start its panel at the top with
  // nothing picked, and say which one it is for anyone not looking at the stage.
  const previousIndex = useRef(selection.index);
  useEffect(() => {
    if (previousIndex.current === selection.index) return;
    previousIndex.current = selection.index;
    setActiveRegionId(null);
    railBodyRef.current?.scrollTo?.({ top: 0 });
    if (attempt) {
      const status = attempt.released ? STATUS_META[attempt.status]?.label : 'waiting for review';
      setAnnouncement(`Showing attempt ${selection.index} of ${count}${status ? `, ${status.toLowerCase()}` : ''}`);
    }
  }, [selection.index, attempt, count]);

  const selectRegionFromStage = useCallback(
    (id: string) => {
      const next = activeRegionId === id ? null : id;
      setActiveRegionId(next);
      const note = notes.find((n) => n.id === id);
      if (next && note) {
        setAnnouncement(`Note ${note.number}: ${note.text}`);
        const el = Array.from(railBodyRef.current?.querySelectorAll<HTMLElement>('[data-note-id]') ?? []).find(
          (node) => node.getAttribute('data-note-id') === id,
        );
        el?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    },
    [activeRegionId, notes, reducedMotion],
  );

  const refImages = referenceImagesOf(detail);
  const action = primaryAction(submitMode);
  const due = dueLabel(clock, submitMode !== 'locked');
  const scaleLabel = detail.evaluation_type === 'stars' ? '1 to 5 stars' : `out of ${detail.max_marks}`;
  const classDate = new Date(detail.class_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const stage = stagePlayback ? (
    <WalkthroughStage
      playback={stagePlayback}
      imageAlt="Your drawing, with your teacher's marks appearing as they talk"
    />
  ) : attempt ? (
    <ImageToggleTabs
      key={attempt.id}
      originalImageUrl={attempt.original_image_url}
      overlayImageUrl={attempt.reviewed_image_url}
      correctedImageUrl={attempt.corrected_image_url}
      regionAnnotations={regions}
      studentView
      regionLabels="numbers"
      activeRegionId={activeRegionId}
      onRegionSelect={selectRegionFromStage}
      // The long names do not fit beside the full screen button on a 375px phone.
      tabLabels={
        isDesktop
          ? { original: 'My drawing', overlay: 'Teacher marks', corrected: 'Corrected' }
          : { original: 'Mine', overlay: 'Marks', corrected: 'Corrected' }
      }
      correctedCaption="Corrected by your teacher"
      hideUnavailableTabs
      touchTargets
      hideCopy
      imageAlt={`Your drawing, attempt ${selection.index}`}
      onDisplayImageChange={setShownImage}
      toolbarEnd={
        <Tooltip title="Full screen">
          <IconButton
            onClick={() => setViewerSrc(shownImage ?? attempt.original_image_url)}
            aria-label="Open this image full screen"
            sx={{
              width: 44,
              height: 44,
              bgcolor: 'rgba(0,0,0,0.55)',
              color: '#fff',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.light', outlineOffset: 2 },
            }}
          >
            <OpenInFullRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      }
    />
  ) : (
    <ReferenceStage images={refImages} onExpand={setViewerSrc} />
  );

  const resources = (attempt?.tutor_resources ?? []) as Array<{ url?: string; title?: string }>;

  const panelBody = (
    <>
    {/* One polite announcer, clipped by the rail (which is position: relative).
        Outside the Stack, so it does not add a gap above the first section. */}
    <Box
      role="status"
      aria-live="polite"
      sx={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}
    >
      {announcement}
    </Box>
    <Stack spacing={2.5}>
      {due && (mode === 'not_submitted' || mode === 'awaiting') && (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Due
          </Typography>
          <Chip
            size="small"
            label={due.label}
            sx={{
              fontWeight: 700,
              bgcolor: alpha(due.overdue ? '#C62828' : '#1565C0', 0.12),
              color: due.overdue ? '#C62828' : '#1565C0',
            }}
          />
        </Stack>
      )}

      {mode === 'not_submitted' && (
        <Stack spacing={1.5}>
          <Box>
            <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 800 }}>
              Not handed in yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {action
                ? 'Read the brief below. When your drawing is ready, take a clear photo of the whole sheet and hand it in.'
                : 'This assignment is closed for new drawings.'}
            </Typography>
          </Box>
          {clock?.is_late_joiner && action && (
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha('#B8860B', 0.1), border: `1px solid ${alpha('#B8860B', 0.3)}` }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#8a6100' }}>
                Catch-up assignment
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                This class ran before you joined. Watch the recording, then hand it in. You have{' '}
                {detail.catchup_window_days} days from your join date.
              </Typography>
            </Box>
          )}
        </Stack>
      )}

      {!action && lockedReason && mode !== 'reviewed' && mode !== 'redo' && (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Typography variant="body2" color="text.secondary">
            {lockedReason}
          </Typography>
        </Box>
      )}

      {attempt && mode !== 'not_submitted' && (
        <VerdictCard
          attempt={attempt}
          mode={mode}
          evaluationType={detail.evaluation_type}
          maxMarks={detail.max_marks}
          attemptIndex={selection.index}
          attemptCount={count}
          canReplace={submitMode === 'replace'}
          onSeeLatest={() => replaceQuery(null)}
        />
      )}

      {voice && (
        <Box component="section" aria-labelledby="voice-note-heading">
          <Typography id="voice-note-heading" component="h2" variant="subtitle2" sx={sectionTitleSx}>
            Listen first
          </Typography>
          <VoiceNotePlayer
            key={voice.id}
            url={voice.url}
            mime={voice.audio_mime}
            durationMs={voice.duration_ms}
            title="Voice note from your teacher"
            sketch={voice.sketch}
            imageUrl={voice.base_image_url}
            onProgress={reportListen}
            onStagePlayback={setStagePlayback}
          />
        </Box>
      )}

      <WhatToFixList
        notes={notes}
        activeId={activeRegionId}
        onSelect={(id) => {
          // Picking a note means looking at the drawing, not the replay.
          if (id) stagePlayback?.close();
          setActiveRegionId(id);
        }}
      />

      {attempt?.tutor_feedback && (
        <Box component="section" aria-labelledby="teacher-note-heading">
          <Typography id="teacher-note-heading" component="h2" variant="subtitle2" sx={sectionTitleSx}>
            Your teacher&apos;s note
          </Typography>
          <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {attempt.tutor_feedback}
          </Typography>
        </Box>
      )}

      {resources.some((r) => r.url) && (
        <Box component="section" aria-labelledby="teacher-resources-heading">
          <Typography id="teacher-resources-heading" component="h2" variant="subtitle2" sx={sectionTitleSx}>
            To help you
          </Typography>
          <Stack spacing={1}>
            {resources
              .filter((r) => r.url)
              .map((r, i) => (
                <Box
                  key={`${r.url}-${i}`}
                  component="a"
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    minHeight: 48,
                    px: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    color: 'text.primary',
                    textDecoration: 'none',
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600 }} noWrap>
                    {r.title || r.url}
                  </Typography>
                  <OpenInNewIcon sx={{ fontSize: 16, color: 'text.secondary' }} aria-hidden />
                </Box>
              ))}
          </Stack>
        </Box>
      )}

      {rubric && bands && <RubricBreakdown criteria={rubric.criteria} bands={bands} />}

      <BriefSection
        detail={detail}
        recording={recording}
        startsOpen={briefStartsOpen(mode)}
        onOpenAttachment={onOpenAttachment}
        onOpenImage={setViewerSrc}
      />

      {/* On a phone the report-a-problem button floats over the bottom of this
          panel; let the last section scroll clear of it. */}
      <Box aria-hidden sx={{ height: { xs: 56, sm: 0 }, flexShrink: 0 }} />
    </Stack>
    </>
  );

  return (
    <>
      <ReviewShell
        phoneLayout="split"
        phoneStageHeight="clamp(180px, 36svh, 340px)"
        stageLabel="Your drawing"
        railLabel="Feedback and brief"
        railBodyRef={railBodyRef}
        header={
          <WorkspaceHeader
            title={detail.title}
            meta={`Class ${classDate} · ${scaleLabel}`}
            onBack={onBack}
            end={
              <AttemptSwitcher
                attempts={attempts.map((a, i) => ({ index: i + 1, status: a.status, released: a.released }))}
                selected={selection.index}
                onSelect={(i) => replaceQuery(i)}
                compact={!isWide}
              />
            }
          />
        }
        stage={stage}
        panelBody={panelBody}
        // The action is about the newest attempt. Offered under an older one it
        // reads as acting on the drawing on screen, and it costs a phone the room
        // that attempt's feedback needs.
        actionBar={
          action && selection.isLatest ? <WorkspaceActionBar action={action} onPrimary={() => setSheetOpen(true)} /> : null
        }
      />

      <StageViewerDialog src={viewerSrc} alt="Full screen image" onClose={() => setViewerSrc(null)} />

      <DrawingSubmissionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        assignmentId={detail.id}
        sourceType="assignment"
        // The voice note is already in the panel beside the drawing, so the sheet
        // carries only the written ask and the corrected image as reminders.
        redoFeedback={latest?.status === 'redo' ? latest.tutor_feedback : null}
        referenceImageUrl={latest?.status === 'redo' ? latest.corrected_image_url : null}
        getToken={getToken}
        onSubmitted={async () => {
          setSheetOpen(false);
          replaceQuery(null);
          await onChanged();
        }}
      />
    </>
  );
}
