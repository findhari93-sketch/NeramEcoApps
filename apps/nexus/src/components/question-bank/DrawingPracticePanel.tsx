'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Stack,
  Typography,
  Button,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Skeleton,
  Link as MuiLink,
  Switch,
  FormControlLabel,
  IconButton,
  ImageViewerDialog,
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ReplayIcon from '@mui/icons-material/Replay';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ZoomOutMapIcon from '@mui/icons-material/ZoomOutMap';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import DrawingPartsView from './DrawingPartsView';
import SolutionVideoPlayer from './SolutionVideoPlayer';
import ReportMistakeLink from './ReportMistakeLink';
import PeerAttempts from './PeerAttempts';
import { reportTargetsFor } from '@/lib/report-targets';
import { findPart, readDrawingParts } from '@/lib/drawing-parts';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBQuestionDetail, QBDrawingState } from '@neram/database';

/**
 * A drawing question, from a student's side.
 *
 * The prompt is always visible. The solution image and the solution video are
 * not, until the student has either uploaded an attempt or explicitly chosen
 * to see the answer first. Drawing from a worked example is a real way to
 * learn, so that door stays open, but it is recorded: the teacher marking the
 * later attempt can see they had the answer in front of them.
 *
 * Colour rule, design principle, objects to include and the focus-point list
 * used to render here too. Nobody was authoring them, so there is nothing
 * left to show; a question now carries only its picture, its video, and its
 * marks.
 *
 * `unlocked` comes from the server as one boolean and is used as-is. Rebuilding
 * it here from "has a submission or has a reveal" would be a second copy of the
 * rule, and the copy that drifts is always the one that leaks.
 */

interface Props {
  question: NexusQBQuestionDetail;
  /** The reader's language, for a question split into parts. */
  language?: 'en' | 'hi';
  /** Offer "Report a mistake" under the solutions once they are open. Student screens only. */
  allowReport?: boolean;
  /**
   * Which option of an "attempt any one of two" drawing to show.
   *
   * In practice the two options are listed and opened separately, because they
   * are two unrelated tasks that happen to share a number in the paper. Null
   * shows the question whole, which is what a test and the teacher's preview
   * still want.
   */
  partKey?: string | null;
}

/**
 * What to put in front of the student when a call fails.
 *
 * A 4xx in these routes is a sentence written for a person ("You need to be in
 * a classroom to use the Question Bank"), so it is worth showing. A 5xx is an
 * accident and its text is written for us, so the student gets the plain
 * fallback and the detail goes to the console. This panel once printed
 * "classroom_id is required" to every student who opened a drawing, which is
 * what this rule exists to stop happening again.
 */
async function readError(res: Response, fallback: string): Promise<string> {
  const json = await res.json().catch(() => ({} as { error?: string }));
  const serverText = typeof json.error === 'string' ? json.error : null;
  if (res.status >= 500 || !serverText) {
    console.error('[QB drawing panel]', res.status, serverText ?? '(no message)');
    return fallback;
  }
  return serverText;
}

/**
 * A question split into parts ("1(a) ... 1(b)" or "X OR Y") renders its parts
 * here, each with its own solution behind the same gate, in place of the one
 * solution image. The caller skips its plain question text for such a question.
 */
export default function DrawingPracticePanel({ question, language = 'en', allowReport = false, partKey = null }: Props) {
  const router = useRouter();
  const { getToken, featureFlags } = useNexusAuthContext();

  const [state, setState] = useState<QBDrawingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState<'solution' | 'peers' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Mounted on request, so opening a drawing never loads a YouTube frame.
  const [videoOpen, setVideoOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/question-bank/questions/${question.id}/drawing-state?part=${encodeURIComponent(partKey ?? '')}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error(await readError(res, 'Could not load your progress'));
      const json = await res.json();
      setState(json.data as QBDrawingState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your progress');
    } finally {
      setLoading(false);
    }
  }, [question.id, partKey, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Open the teacher's answer, or the classmates' attempts. Both are recorded. */
  const reveal = useCallback(
    async (kind: 'solution' | 'peers') => {
      setConfirmReveal(null);
      try {
        const token = await getToken();
        const res = await fetch(`/api/question-bank/questions/${question.id}/drawing-reveal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ part: partKey ?? '', kind }),
        });
        if (!res.ok) throw new Error(await readError(res, 'That did not work'));
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not work');
      }
    },
    [question.id, partKey, getToken, load],
  );

  const allParts = readDrawingParts(question.drawing_parts);
  // One option, when the student opened one. A question that is not split, or
  // one whose parts are all compulsory, is shown whole.
  const chosen = partKey ? findPart(allParts, partKey) : null;
  const parts =
    allParts && chosen ? { ...allParts, items: [chosen] } : allParts;
  const unlocked = state?.unlocked === true;
  const submission = state?.submission ?? null;
  const awaitingReview = submission?.status === 'submitted' || submission?.status === 'under_review';
  const needsRedo = submission?.status === 'redo';
  // A single-task drawing's own solutions. Parts carry theirs in the view above.
  const hasImage = !parts && Boolean(question.solution_image_url);
  const videoUrl = !parts ? question.solution_video_url?.trim() || null : null;
  const solutionWords =
    hasImage && videoUrl ? 'solution image and video' : videoUrl ? 'solution video' : 'solution image';
  const solutionIsPlural = hasImage && Boolean(videoUrl);
  /**
   * Is there a solution at all, anywhere on this question?
   *
   * Nearly every drawing question in the bank has none. The gate used to be
   * drawn regardless, so a student was invited to "show the solution image" on
   * a question that has no image, and flipping it revealed nothing while
   * writing a reveal row that marks their next attempt for the teacher as
   * having been drawn with the answer in front of them. With nothing to open,
   * there is nothing to gate.
   */
  const hasAnySolution = parts
    ? parts.items.some((p) => Boolean(p.solution_image_url) || Boolean(p.solution_video_url))
    : hasImage || Boolean(videoUrl);
  /** The solution to draw alongside, once earned. The option's own, when split. */
  const referenceImageUrl = chosen
    ? chosen.solution_image_url ?? null
    : question.solution_image_url ?? null;
  /**
   * Is the peer drawing library switched on?
   *
   * The same switch that decides whether the Inspiration tab exists, because
   * this shows the same students' work through a different door. Checked as
   * `=== true` rather than `!== false` so the button appears once the flags
   * have loaded instead of appearing and then vanishing. The route checks it
   * again, which is where it actually matters.
   */
  const peersAvailable =
    featureFlags['student.inspiration'] === true || featureFlags['staff.inspiration'] === true;
  const reportTargets = reportTargetsFor(question);
  // Parts' solutions live in the parts view above; one link asks which part.
  const partSolutionTargets = parts ? reportTargets.filter((t) => t.target !== 'question') : [];

  return (
    <Box sx={{ mb: 3 }}>
      {parts && (
        <Box sx={{ mb: 2 }}>
          <DrawingPartsView
            parts={parts}
            questionNumber={question.display_order}
            language={language}
            showSolutions={unlocked}
            soloOf={chosen ? allParts?.items.length ?? null : null}
          />
        </Box>
      )}

      {question.drawing_marks ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          Worth {question.drawing_marks} marks
        </Typography>
      ) : null}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Skeleton variant="rounded" height={96} />
      ) : (
        <>
          {/* Your attempt so far */}
          {submission && (
            <Box sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', gap: 1 }}>
                {awaitingReview && (
                  <Chip
                    icon={<HourglassEmptyIcon />}
                    label="Waiting for your teacher"
                    size="small"
                    color="info"
                    sx={{ height: 28 }}
                  />
                )}
                {needsRedo && (
                  <Chip icon={<ReplayIcon />} label="Your teacher asked for another go" size="small" color="warning" sx={{ height: 28 }} />
                )}
                {submission.status === 'completed' && submission.tutor_marks != null && (
                  <Chip label={`Marked: ${submission.tutor_marks}`} size="small" color="success" sx={{ height: 28 }} />
                )}
                {(submission.attempt_number ?? 1) > 1 && (
                  <Chip label={`Attempt ${submission.attempt_number}`} size="small" variant="outlined" sx={{ height: 28 }} />
                )}
              </Stack>
              {submission.original_image_url && (
                <Box
                  component="img"
                  src={submission.reviewed_image_url || submission.original_image_url}
                  alt="Your drawing"
                  sx={{
                    width: '100%',
                    maxHeight: 260,
                    objectFit: 'contain',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                />
              )}
              {submission.tutor_feedback && (
                <Alert severity={needsRedo ? 'warning' : 'success'} sx={{ mt: 1 }}>
                  {submission.tutor_feedback}
                </Alert>
              )}
            </Box>
          )}

          {/* The gate */}
          {hasAnySolution && (!unlocked ? (
            <Box
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 1,
                border: '1px dashed',
                borderColor: 'divider',
                textAlign: 'center',
              }}
            >
              <LockOutlinedIcon sx={{ color: 'text.disabled', mb: 0.5 }} />
              <Typography variant="body2" color="text.secondary">
                {parts
                  ? 'Draw it first. The solutions open up once you upload your attempt, or you can switch them on below.'
                  : `Draw it first. The ${solutionWords} ${solutionIsPlural ? 'open' : 'opens'} up once you upload your attempt, or you can switch ${solutionIsPlural ? 'them' : 'it'} on below.`}
              </Typography>
            </Box>
          ) : (
            <>
              {state?.revealed_at && !submission && (
                <Chip
                  icon={<VisibilityOutlinedIcon />}
                  label="You opened the solution before drawing"
                  size="small"
                  sx={{ mb: 1.5, height: 28 }}
                />
              )}

              {/* Parts show their own solutions in the view above. */}
              {!parts && question.solution_image_url && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                      SOLUTION IMAGE
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        size="small"
                        aria-label="View full size"
                        onClick={() => setViewerOpen(true)}
                        sx={{ minWidth: 36, minHeight: 36 }}
                      >
                        <ZoomOutMapIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        component="a"
                        href={question.solution_image_url}
                        download
                        aria-label="Download the solution image"
                        sx={{ minWidth: 36, minHeight: 36 }}
                      >
                        <DownloadOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </Box>
                  <Box
                    component="img"
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewerOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setViewerOpen(true);
                    }}
                    src={question.solution_image_url}
                    alt="Solution"
                    sx={{
                      width: '100%',
                      maxHeight: 300,
                      objectFit: 'contain',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                    }}
                  />
                  <ImageViewerDialog
                    open={viewerOpen}
                    onClose={() => setViewerOpen(false)}
                    src={question.solution_image_url}
                    alt="Solution, full size"
                  />
                  {allowReport && (
                    <ReportMistakeLink
                      questionId={question.id}
                      target="solution_image"
                      targets={reportTargets}
                      isMcq={false}
                      source="drawing"
                    />
                  )}
                </Box>
              )}

              {videoUrl && (
                <Box sx={{ mb: 2 }}>
                  {videoOpen ? (
                    <SolutionVideoPlayer url={videoUrl} />
                  ) : (
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<PlayCircleOutlineIcon />}
                      onClick={() => setVideoOpen(true)}
                      sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
                    >
                      Watch the solution video
                    </Button>
                  )}
                  {allowReport && (
                    <ReportMistakeLink
                      questionId={question.id}
                      target="video"
                      targets={reportTargets}
                      isMcq={false}
                      source="drawing"
                    />
                  )}
                </Box>
              )}

              {allowReport && partSolutionTargets.length > 0 && (
                <ReportMistakeLink
                  anyPart
                  questionId={question.id}
                  target={partSolutionTargets[0].target}
                  partLabel={partSolutionTargets[0].partLabel}
                  targets={reportTargets}
                  isMcq={false}
                  source="drawing"
                  label="Report a mistake in a solution"
                />
              )}
            </>
          ))}

          {/* Actions */}
          <Stack spacing={1}>
            <Button
              variant="contained"
              fullWidth
              startIcon={<BrushOutlinedIcon />}
              onClick={() => setSheetOpen(true)}
              disabled={awaitingReview}
              sx={{ minHeight: 48, fontWeight: 600, textTransform: 'none', borderRadius: 2 }}
            >
              {needsRedo ? 'Upload your next try' : submission ? 'Upload another attempt' : 'Upload my attempt'}
            </Button>

            {/*
              A switch, not a one-way button, to read as a choice rather than a
              dare. It can only ever move to on: nexus_qb_drawing_reveals has no
              un-reveal, so a flip back to off would lie about what the teacher
              can still see on their side.
            */}
            {hasAnySolution && (
            <FormControlLabel
              sx={{ alignSelf: 'center', ml: 0 }}
              control={
                <Switch
                  checked={unlocked}
                  disabled={unlocked}
                  onChange={(e) => {
                    if (e.target.checked) setConfirmReveal('solution');
                  }}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  {parts ? 'Show the solutions' : `Show the ${solutionWords}`}
                </Typography>
              }
            />
            )}

            {peersAvailable && (
              <PeerAttempts
                questionId={question.id}
                partKey={partKey}
                unlocked={state?.peers_unlocked === true}
                onReveal={() => void reveal('peers')}
                getToken={getToken}
              />
            )}

            {state?.drawing_question_id && (
              <MuiLink
                component="button"
                type="button"
                variant="caption"
                onClick={() =>
                  router.push(`/student/drawings/${state.drawing_question_id}?from=qb&qb_id=${question.id}`)
                }
                sx={{ alignSelf: 'center', minHeight: 44 }}
              >
                See all your attempts on this drawing
              </MuiLink>
            )}
          </Stack>
        </>
      )}

      <Dialog
        open={confirmReveal !== null}
        onClose={() => setConfirmReveal(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {confirmReveal === 'peers'
            ? 'Look at other students first?'
            : 'Show the solution now?'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            {confirmReveal === 'peers'
              ? 'Your teacher will see that you looked at what other students drew before making your own. Looking for ideas is a fair way to start. In the exam you will get a question you have never seen, so it is worth trying one on your own first.'
              : 'Your teacher will see that you opened the answer before drawing. You can still upload an attempt afterwards, and copying a good drawing is a fair way to learn technique.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setConfirmReveal(null)} sx={{ minHeight: 44 }}>
            Not yet
          </Button>
          <Button
            variant="contained"
            onClick={() => reveal(confirmReveal ?? 'solution')}
            sx={{ minHeight: 44 }}
          >
            Show me
          </Button>
        </DialogActions>
      </Dialog>

      <DrawingSubmissionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        questionId={state?.drawing_question_id ?? undefined}
        sourceType="question_bank"
        getToken={getToken}
        redoFeedback={needsRedo ? submission?.tutor_feedback ?? undefined : undefined}
        // Reference and solution used to be different columns, one always
        // shown and one gated. They are the same column now, so this can only
        // be passed once `unlocked`: the sheet is reachable before that (the
        // Upload button has no gate of its own), and passing the image
        // unconditionally would show the solution through the submission
        // sheet to a student who has not earned it yet.
        // For a question split into options this is the chosen option's own
        // solution. The question-level column is only ever a copy of the first
        // option's, so passing it would hand 81A's answer to a student drawing
        // 81B.
        referenceImageUrl={unlocked ? referenceImageUrl ?? undefined : undefined}
        submitUrl={`/api/question-bank/questions/${question.id}/drawing-attempt`}
        // A bank drawing shows up in the student's sketchbook like any other,
        // so it needs the same 400px copy the grid loads, and the same quality
        // measurement the teacher's triage reads. Both used to be dropped here
        // because this callback took two arguments while the sheet passes four.
        withThumbnail
        submitBody={(uploadedUrl, selfNote, thumbnailUrl, imageQuality) => ({
          original_image_url: uploadedUrl,
          self_note: selfNote,
          thumbnail_url: thumbnailUrl,
          image_quality: imageQuality,
          // Which option of an "any one of two" this sheet answers. Without it
          // 81A and 81B would land on one thread and the second upload would
          // be refused with "wait for your teacher".
          part: partKey ?? '',
        })}
        onSubmitted={() => {
          setSheetOpen(false);
          void load();
        }}
      />
    </Box>
  );
}
