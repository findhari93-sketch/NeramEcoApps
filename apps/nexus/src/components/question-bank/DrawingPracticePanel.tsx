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
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
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
  classroomId?: string | null;
}

export default function DrawingPracticePanel({ question, classroomId }: Props) {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [state, setState] = useState<QBDrawingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/questions/${question.id}/drawing-state`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load your progress');
      setState(json.data as QBDrawingState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your progress');
    } finally {
      setLoading(false);
    }
  }, [question.id, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const reveal = useCallback(async () => {
    setConfirmReveal(false);
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/questions/${question.id}/drawing-reveal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ classroom_id: classroomId ?? null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'That did not work');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
    }
  }, [question.id, classroomId, getToken, load]);

  const unlocked = state?.unlocked === true;
  const submission = state?.submission ?? null;
  const awaitingReview = submission?.status === 'submitted' || submission?.status === 'under_review';
  const needsRedo = submission?.status === 'redo';

  return (
    <Box sx={{ mb: 3 }}>
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
          {!unlocked ? (
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
                Draw it first. The solution image opens up once you upload your attempt, or you can
                switch it on below.
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

              {question.solution_image_url && (
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
                </Box>
              )}
            </>
          )}

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
            <FormControlLabel
              sx={{ alignSelf: 'center', ml: 0 }}
              control={
                <Switch
                  checked={unlocked}
                  disabled={unlocked}
                  onChange={(e) => {
                    if (e.target.checked) setConfirmReveal(true);
                  }}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Show the solution image
                </Typography>
              }
            />

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

      <Dialog open={confirmReveal} onClose={() => setConfirmReveal(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Show the solution now?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Your teacher will see that you opened the answer before drawing. You can still upload an
            attempt afterwards, and copying a good drawing is a fair way to learn technique.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setConfirmReveal(false)} sx={{ minHeight: 44 }}>
            Not yet
          </Button>
          <Button variant="contained" onClick={reveal} sx={{ minHeight: 44 }}>
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
        referenceImageUrl={unlocked ? question.solution_image_url ?? undefined : undefined}
        submitUrl={`/api/question-bank/questions/${question.id}/drawing-attempt`}
        submitBody={(uploadedUrl, selfNote) => ({
          original_image_url: uploadedUrl,
          self_note: selfNote,
          classroom_id: classroomId ?? null,
        })}
        onSubmitted={() => {
          setSheetOpen(false);
          void load();
        }}
      />
    </Box>
  );
}
