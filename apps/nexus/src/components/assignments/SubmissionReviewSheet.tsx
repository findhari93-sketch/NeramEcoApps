'use client';

/**
 * Grade one student's submission: view their files, enter marks out of the
 * assignment max, write feedback, then Save review or Request redo. Prev/next
 * arrows let a teacher grade the whole class without leaving the sheet.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Drawer,
  Stack,
  Typography,
  IconButton,
  TextField,
  Button,
  Chip,
  Divider,
  Rating,
  alpha,
} from '@neram/ui';
import StudentAvatar from '@/components/students/StudentAvatar';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RedoIcon from '@mui/icons-material/Redo';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import type { GalleryReactionType, NexusAssignmentSubmissionHistoryEntry } from '@neram/database/types';
import { RATING_LABELS } from '@/lib/drawing-prompt-templates';
import SubmissionFiles, { type SubmissionFile } from './SubmissionFiles';
import ReactionPicker from './ReactionPicker';
import SubmissionHistoryTimeline from './SubmissionHistoryTimeline';
import { documentSubmissionToViews } from '@/lib/submission-history';
import { studentEditedAt } from '@/lib/assignment-submit-window';

export interface ReviewRow {
  student: { id: string; name: string | null; email: string | null; avatar_url: string | null };
  submission: {
    id: string;
    files: SubmissionFile[];
    status: string;
    attempt_number: number;
    marks: number | null;
    feedback: string | null;
    reaction?: GalleryReactionType | null;
    submitted_at: string;
    /** Moves when the student replaces their own unmarked file. See studentEditedAt. */
    updated_at?: string | null;
    reviewed_at?: string | null;
    /** Prior attempts appended on each redo-resubmit (files + marks + feedback per round). */
    history?: NexusAssignmentSubmissionHistoryEntry[];
  } | null;
  /** This student's go at the question paper, when the assignment has one. */
  answers?: {
    score: number;
    total_marks: number;
    percentage: number;
    answers: Record<string, string>;
  } | null;
  bucket: 'submitted' | 'late' | 'missing';
}

export interface ReviewPaper {
  questions: {
    id: string;
    question_text: string;
    format: string;
    marks: number;
    correct_answer?: string | null;
  }[];
  auto_marks: number;
  manual_marks: number;
  total_marks: number;
}

interface SubmissionReviewSheetProps {
  open: boolean;
  row: ReviewRow | null;
  maxMarks: number;
  /**
   * The question paper, when the assignment has one. Its presence changes what
   * the teacher is asked for: marks on the working alone, not on the whole
   * assignment, because the objective half already marked itself.
   */
  paper?: ReviewPaper | null;
  /** Grading scale: numeric marks out of maxMarks, or a 1-5 star rating. */
  evaluationType: 'marks' | 'stars';
  busy: boolean;
  onClose: () => void;
  onReview: (
    submissionId: string,
    marks: number | null,
    feedback: string,
    action: 'complete' | 'redo',
    reaction: GalleryReactionType | null,
  ) => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function SubmissionReviewSheet({
  open,
  row,
  maxMarks,
  paper = null,
  evaluationType,
  busy,
  onClose,
  onReview,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: SubmissionReviewSheetProps) {
  const isStars = evaluationType === 'stars';
  const [marks, setMarks] = useState('');
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [reaction, setReaction] = useState<GalleryReactionType | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const m = row?.submission?.marks;
    setMarks(m != null ? String(m) : '');
    setStars(m != null ? Math.round(m) : 0);
    setFeedback(row?.submission?.feedback || '');
    setReaction(row?.submission?.reaction ?? null);
    setError('');
  }, [row?.submission?.id]);

  const submission = row?.submission ?? null;
  const editedAt = studentEditedAt(submission);

  // With a paper attached, the teacher is only marking the working, so the
  // ceiling shown and validated against is the manual half, not the whole
  // assignment. The auto marks are added on the server.
  const hasPaper = !isStars && !!paper && paper.questions.length > 0;
  const markCeiling = hasPaper ? paper!.manual_marks : maxMarks;
  const studentAnswers = row?.answers ?? null;
  // Prior rounds (everything before the current attempt) so the teacher can see
  // what was submitted and what they asked for last time before re-grading.
  const priorViews = submission
    ? documentSubmissionToViews(submission as any, { evaluationType, maxMarks }).slice(0, -1)
    : [];

  const submit = async (action: 'complete' | 'redo') => {
    if (!submission) return;
    let marksVal: number | null = null;
    if (action === 'complete') {
      if (isStars) {
        if (stars < 1) {
          setError('Tap to give a star rating, or use Request redo.');
          return;
        }
        marksVal = stars;
      } else {
        if (marks.trim() === '') {
          setError(hasPaper ? 'Enter marks for their working, or use Request redo.' : 'Enter marks, or use Request redo.');
          return;
        }
        const m = Number(marks);
        if (!Number.isFinite(m) || m < 0 || m > markCeiling) {
          setError(
            hasPaper
              ? `Marks for the working must be between 0 and ${markCeiling}.`
              : `Marks must be between 0 and ${maxMarks}.`,
          );
          return;
        }
        marksVal = m;
      }
    } else {
      marksVal = isStars ? (stars >= 1 ? stars : null) : marks.trim() === '' ? null : Number(marks);
    }
    setError('');
    await onReview(submission.id, marksVal, feedback.trim(), action, reaction);
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { maxHeight: '94vh', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
      }}
    >
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {/* Header + student nav */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <IconButton onClick={onPrev} disabled={!hasPrev} sx={{ minWidth: 44, minHeight: 44 }}>
            <ChevronLeftIcon />
          </IconButton>
          <StudentAvatar
            userId={row?.student.id}
            src={row?.student.avatar_url}
            name={row?.student.name}
            size={36}
            tapToView={false}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }} noWrap>
              {row?.student.name || 'Student'}
            </Typography>
            {submission && (
              <Typography variant="caption" color="text.secondary">
                Attempt {submission.attempt_number} ·{' '}
                {new Date(submission.submitted_at).toLocaleString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {editedAt && (
                  // Not a resubmission and deliberately not styled like one: the
                  // student corrected their own work before anyone marked it.
                  // The teacher still needs to know the file is not the one that
                  // arrived at the time above.
                  <>
                    {' · '}
                    <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
                      student updated{' '}
                      {new Date(editedAt).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Box>
                  </>
                )}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onNext} disabled={!hasNext} sx={{ minWidth: 44, minHeight: 44 }}>
            <ChevronRightIcon />
          </IconButton>
          <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
            <CloseIcon />
          </IconButton>
        </Stack>

        {!submission ? (
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <Typography color="text.secondary">This student has not submitted yet.</Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {row?.bucket === 'late' && (
              <Chip
                label="Submitted late"
                size="small"
                sx={{ width: 'fit-content', bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }}
              />
            )}
            <SubmissionFiles files={submission.files} />

            {priorViews.length > 0 && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha('#EF6C00', 0.06),
                  border: `1px solid ${alpha('#EF6C00', 0.2)}`,
                }}
              >
                <SubmissionHistoryTimeline attempts={priorViews} title="Previous attempts" />
              </Box>
            )}

            <Divider />

            {/* What the machine already marked, so the teacher is not re-checking
                arithmetic a grader has settled. Shown before the marks box
                because it changes what that box is for. */}
            {hasPaper && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  bgcolor: alpha('#2E7D32', 0.06),
                  border: `1px solid ${alpha('#2E7D32', 0.22)}`,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: '#1B5E20', flex: 1 }}>
                    MARKED AUTOMATICALLY
                  </Typography>
                  <Chip
                    size="small"
                    label={
                      studentAnswers
                        ? `${studentAnswers.score} / ${studentAnswers.total_marks}`
                        : 'Not answered'
                    }
                    sx={{ height: 22, fontWeight: 700, bgcolor: alpha('#2E7D32', 0.16), color: '#1B5E20' }}
                  />
                </Stack>
                <Stack spacing={0.5}>
                  {paper!.questions.map((q, i) => {
                    if (q.format === 'SUBJECTIVE') return null;
                    const given = studentAnswers?.answers?.[q.id];
                    const right =
                      given != null && q.correct_answer != null
                        ? String(given).trim().toLowerCase() ===
                            String(q.correct_answer).trim().toLowerCase() ||
                          (Number.isFinite(Number(given)) &&
                            Number.isFinite(Number(q.correct_answer)) &&
                            Math.abs(Number(given) - Number(q.correct_answer)) < 1e-9)
                        : false;
                    return (
                      <Stack key={q.id} direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" sx={{ fontWeight: 700, minWidth: 26 }}>
                          Q{i + 1}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
                          {given == null || given === '' ? 'no answer' : `answered ${given}`}
                          {!right && q.correct_answer ? ` (correct: ${q.correct_answer})` : ''}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 700, color: right ? 'success.main' : 'error.main' }}
                        >
                          {right ? `+${q.marks}` : '0'}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            )}

            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                {isStars ? 'Rating' : hasPaper ? 'Marks for their working' : 'Marks'}
              </Typography>
              {isStars ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                  <Rating value={stars} onChange={(_, v) => setStars(v || 0)} size="large" />
                  <Typography
                    color={stars >= 4 ? 'success.main' : stars >= 3 ? 'primary.main' : stars >= 1 ? 'warning.main' : 'text.disabled'}
                    sx={{ fontWeight: 600 }}
                  >
                    {stars > 0 ? RATING_LABELS[stars] : 'Tap to rate'}
                  </Typography>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    value={marks}
                    onChange={(e) => setMarks(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputProps={{ inputMode: 'decimal' }}
                    size="small"
                    sx={{ width: 100 }}
                    placeholder="0"
                  />
                  <Typography color="text.secondary">out of {markCeiling}</Typography>
                  {hasPaper && (
                    <Typography variant="caption" color="text.secondary">
                      (+{studentAnswers?.score ?? 0} already earned)
                    </Typography>
                  )}
                </Stack>
              )}
            </Box>

            <TextField
              label="Feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="What was good, what to fix..."
            />

            <ReactionPicker value={reaction} onChange={setReaction} disabled={busy} />

            {error && (
              <Typography color="error" variant="body2">
                {error}
              </Typography>
            )}

            <Stack direction="row" spacing={1.5}>
              <Button
                variant="outlined"
                color="warning"
                startIcon={<RedoIcon />}
                disabled={busy}
                onClick={() => submit('redo')}
                sx={{ flex: 1, minHeight: 48 }}
              >
                Request redo
              </Button>
              <Button
                variant="contained"
                startIcon={<CheckCircleOutlineIcon />}
                disabled={busy}
                onClick={() => submit('complete')}
                sx={{ flex: 1, minHeight: 48 }}
              >
                Save review
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
}
