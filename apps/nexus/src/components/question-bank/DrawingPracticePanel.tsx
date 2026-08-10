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
} from '@neram/ui';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ReplayIcon from '@mui/icons-material/Replay';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusQBQuestionDetail, QBDrawingState } from '@neram/database';

/**
 * A drawing question, from a student's side.
 *
 * The prompt is always visible. The model solution, the solution video and the
 * focus points are not, until the student has either uploaded an attempt or
 * explicitly chosen to see the answer first. Drawing from a worked example is a
 * real way to learn, so that door stays open, but it is recorded: the teacher
 * marking the later attempt can see they had the answer in front of them.
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
  const focusPoints = (question.drawing_focus_points ?? []).filter((f) => f?.text?.trim());

  return (
    <Box sx={{ mb: 3 }}>
      {/* Always visible: what the question asks for. */}
      {question.drawing_reference_image_url && (
        <Box
          component="img"
          src={question.drawing_reference_image_url}
          alt="Reference for this drawing question"
          sx={{
            width: '100%',
            maxHeight: 280,
            objectFit: 'contain',
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            mb: 2,
          }}
        />
      )}

      {question.objects_to_include && (question.objects_to_include as any[]).length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            OBJECTS TO INCLUDE
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
            {(question.objects_to_include as any[]).map((obj: any, i: number) => (
              <Chip
                key={i}
                label={obj.name || String(obj)}
                size="small"
                variant="outlined"
                sx={{ height: 24, fontSize: '0.75rem' }}
              />
            ))}
          </Box>
        </Box>
      )}

      {question.colour_constraint && (
        <Box sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={600}>Colour rule</Typography>
          <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>{question.colour_constraint}</Typography>
        </Box>
      )}

      {question.design_principle_tested && (
        <Box sx={{ mb: 1.5, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={600}>Design principle</Typography>
          <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>{question.design_principle_tested}</Typography>
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
                Draw it first. The model answer and the points to concentrate on open up once you
                upload your attempt.
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

              {focusPoints.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    WHAT TO CONCENTRATE ON
                  </Typography>
                  <Box component="ol" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                    {focusPoints.map((fp, i) => (
                      <li key={i}>
                        <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>{fp.text}</Typography>
                      </li>
                    ))}
                  </Box>
                </Box>
              )}

              {question.solution_image_url && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.7rem', mb: 0.5, display: 'block' }}>
                    MODEL ANSWER
                  </Typography>
                  <Box
                    component="img"
                    src={question.solution_image_url}
                    alt="Model answer"
                    sx={{
                      width: '100%',
                      maxHeight: 300,
                      objectFit: 'contain',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
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

            {!unlocked && (
              <Button
                variant="text"
                fullWidth
                startIcon={<VisibilityOutlinedIcon />}
                onClick={() => setConfirmReveal(true)}
                sx={{ minHeight: 44, textTransform: 'none' }}
              >
                Just show me the solution
              </Button>
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
        referenceImageUrl={question.drawing_reference_image_url ?? undefined}
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
