'use client';

/**
 * Assignment detail (student): the instructions, any image/video/links the
 * teacher attached, and, for late joiners, the class recording to watch first
 * plus a "Day N since you joined" clock. Submit or resubmit here; reviewed work
 * shows marks and feedback. Reuses the shared submit sheet + file viewer.
 *
 * A drawing assignment opens as a workspace (components/assignments/workspace)
 * when `student.assignment-workspace` is on: the drawing fixed, the feedback
 * beside it. The route is full bleed for that, so every other view of it puts
 * the page padding back through LegacyPagePadding.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Stack, Chip, Button, Skeleton, Divider, alpha, Snackbar, Alert,
  Breadcrumbs, Link as MuiLink,
} from '@neram/ui';
import NextLink from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { computeAssignmentClock } from '@/lib/assignment-clock';
import { dueLabel } from '@/lib/assignment-due-label';
import SubmissionFiles from '@/components/assignments/SubmissionFiles';
import AssignmentBriefBody from '@/components/assignments/AssignmentBriefBody';
import AssignmentQuestions, { type PaperView } from '@/components/assignments/AssignmentQuestions';
import AssignmentSubmitSheet from '@/components/assignments/AssignmentSubmitSheet';
import DrawingAssignmentPanel, { type DrawingSubmissionView } from '@/components/assignments/DrawingAssignmentPanel';
import GradeDisplay from '@/components/assignments/GradeDisplay';
import ReactionAppreciation from '@/components/assignments/ReactionAppreciation';
import SubmissionHistoryTimeline from '@/components/assignments/SubmissionHistoryTimeline';
import StudentDrawingWorkspace from '@/components/assignments/workspace/StudentDrawingWorkspace';
import type {
  AssignmentRecording, StudentAssignmentDetail, StudentDrawingAttempt, StudentRubric,
} from '@/components/assignments/workspace/types';
import { documentSubmissionToViews, drawingAttemptsToViews } from '@/lib/submission-history';
import { captureScreenshot } from '@/lib/capture-screenshot';
import type { SubmitMode } from '@/lib/assignment-submit-window';
import type { VoiceFeedbackView } from '@/lib/drawing-voice-feedback';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import type { GalleryReactionType, NexusAssignmentSubmissionHistoryEntry } from '@neram/database/types';

interface MySubmission {
  id?: string;
  files: { path: string; name: string; mime: string; url?: string | null }[];
  status: 'submitted' | 'reviewed' | 'redo';
  attempt_number?: number;
  marks: number | null;
  feedback: string | null;
  reaction?: GalleryReactionType | null;
  submitted_at: string;
  /** Prior rounds, appended on each redo-resubmit. */
  history?: NexusAssignmentSubmissionHistoryEntry[];
}

/** The padding `<main>` gives an ordinary page, which this full-bleed route has to add back. */
function LegacyPagePadding({ children }: { children: ReactNode }) {
  return <Box sx={{ pt: { xs: 2, md: 3 }, px: { xs: 2, sm: 3, md: 4 }, pb: { xs: 2, md: 3 } }}>{children}</Box>;
}

export default function StudentAssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading, getToken, isFeatureEnabled } = useNexusAuthContext();

  // Go back to wherever the student came from (the timetable, the assignments
  // list, a notification), rather than always dumping them on the list. If they
  // landed here directly (no in-app history), fall back to the Assignments list.
  const goBack = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/student/assignments');
    }
  }, [router]);

  const [detail, setDetail] = useState<StudentAssignmentDetail | null>(null);
  const [submission, setSubmission] = useState<MySubmission | null>(null);
  // Resolved server-side by resolveSubmitMode so the page cannot disagree with
  // the API about who may hand work in.
  const [submitMode, setSubmitMode] = useState<SubmitMode>('first');
  const [lockedWhy, setLockedWhy] = useState<string | null>(null);
  const [paper, setPaper] = useState<PaperView | null>(null);
  const [answersLocked, setAnswersLocked] = useState(false);
  const [myAnswers, setMyAnswers] = useState<Record<string, string> | null>(null);
  const [myResult, setMyResult] = useState<{ score: number; total_marks: number; percentage: number } | null>(null);
  const [answersBusy, setAnswersBusy] = useState(false);
  const [drawingSubmission, setDrawingSubmission] = useState<StudentDrawingAttempt | null>(null);
  // Oldest first, and already stripped of any review the teacher has not sent.
  const [drawingAttempts, setDrawingAttempts] = useState<StudentDrawingAttempt[]>([]);
  // The teacher's voice notes, keyed by the attempt (submission id) each belongs to.
  const [voiceBySubmission, setVoiceBySubmission] = useState<Record<string, VoiceFeedbackView>>({});
  const [rubric, setRubric] = useState<StudentRubric | null>(null);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [recording, setRecording] = useState<AssignmentRecording>({ url: null, source: null });
  const [error, setError] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportShot, setReportShot] = useState<File | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await authFetch(`/api/assignments/${id}`);
      setDetail(res.assignment as StudentAssignmentDetail);
      setSubmission((res.submission as MySubmission) ?? null);
      setDrawingSubmission((res.drawing_submission as StudentDrawingAttempt) ?? null);
      setDrawingAttempts((res.drawing_attempts as StudentDrawingAttempt[]) ?? []);
      setVoiceBySubmission((res.voice_by_submission as Record<string, VoiceFeedbackView>) ?? {});
      setRubric((res.rubric as StudentRubric) ?? null);
      setEnrolledAt(res.enrolled_at ?? null);
      setRecording(res.recording ?? { url: null, source: null });
      setSubmitMode((res.submit_mode as SubmitMode) ?? 'first');
      setLockedWhy(res.submit_locked_reason ?? null);
      setPaper((res.paper as PaperView) ?? null);
      setAnswersLocked(!!res.answers_locked);
      setMyAnswers(res.my_answers ?? null);
      setMyResult(res.my_result ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this assignment.');
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const openAttachment = async (studyFileId: string) => {
    const token = await getToken();
    if (!token) return;
    const url = `/api/study-materials/files/${studyFileId}/content?token=${encodeURIComponent(token)}`;
    // Open the tab synchronously (popup-blocker safe), then verify the response
    // before navigating it. On failure, close it and offer an in-app report
    // instead of dumping a raw error page on the student.
    const tab = window.open('', '_blank');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`content ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (tab) tab.location.href = blobUrl;
      else window.open(blobUrl, '_blank', 'noopener');
    } catch {
      if (tab) tab.close();
      const shot = await captureScreenshot();
      setReportShot(shot);
      setAttachmentError(true);
    }
  };

  const clock = detail
    ? computeAssignmentClock({
        class_date: detail.class_date,
        enrolled_at: enrolledAt,
        due_at: detail.due_at,
        catchup_window_days: detail.catchup_window_days,
      })
    : null;

  const submitAnswers = useCallback(
    async (answers: Record<string, string>) => {
      setAnswersBusy(true);
      try {
        await authFetch('/api/student/assignments', {
          method: 'POST',
          body: JSON.stringify({ action: 'submit_answers', assignment_id: id, answers }),
        });
        await load();
      } finally {
        setAnswersBusy(false);
      }
    },
    [authFetch, id, load],
  );

  const isDrawing = detail?.assignment_type === 'drawing';
  const useWorkspace = isDrawing && isFeatureEnabled('student.assignment-workspace');
  // 'replace' counts as being able to submit: it is the same door, it just means
  // something different on the other side. Only 'locked' closes it.
  const canSubmit = submitMode !== 'locked';
  const hasQuestions = !!paper && paper.questions.length > 0;
  // The gate the server enforces, mirrored here so the questions can show
  // themselves as waiting rather than simply refusing on submit.
  const awaitingPdf =
    hasQuestions && (detail?.requires_pdf ?? true) && !(submission?.files || []).length;
  const due = dueLabel(clock, canSubmit);

  // Prior attempts (everything before the current one) so a student sent back for
  // a redo can revisit their earlier work and the feedback that came with it.
  const priorAttemptViews = !detail || useWorkspace
    ? []
    : isDrawing
      ? drawingAttemptsToViews(drawingAttempts as any, {
          evaluationType: detail.evaluation_type,
          maxMarks: detail.max_marks,
        }).slice(0, -1)
      : submission
        ? documentSubmissionToViews(submission as any, {
            evaluationType: detail.evaluation_type,
            maxMarks: detail.max_marks,
          }).slice(0, -1)
        : [];

  const attachmentSnackbar = (
    <>
      {/* A reference material failed to open: offer a one-tap report instead of
          dumping a raw error page in a new tab. */}
      <Snackbar
        open={attachmentError}
        autoHideDuration={8000}
        onClose={() => setAttachmentError(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="error"
          onClose={() => setAttachmentError(false)}
          action={
            <Button
              color="inherit"
              size="small"
              startIcon={<BugReportOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
              onClick={() => {
                setAttachmentError(false);
                setReportOpen(true);
              }}
              sx={{ textTransform: 'none' }}
            >
              Report
            </Button>
          }
        >
          This file couldn&apos;t be opened.
        </Alert>
      </Snackbar>

      <ReportIssueDialog
        open={reportOpen}
        onClose={() => {
          setReportOpen(false);
          setReportShot(null);
        }}
        getToken={getToken}
        initialScreenshotFile={reportShot}
        prefill={{
          category: 'bug',
          title: 'Reference material would not open',
        }}
      />
    </>
  );

  if (error) {
    return (
      <LegacyPagePadding>
        <Box sx={{ p: 3, maxWidth: 480, mx: 'auto', textAlign: 'center', mt: 6 }}>
          <Typography sx={{ fontWeight: 700 }}>Could not load this assignment</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {error}
          </Typography>
          <Button variant="outlined" onClick={load} sx={{ mt: 2, minHeight: 44 }}>
            Try again
          </Button>
        </Box>
      </LegacyPagePadding>
    );
  }

  if (detail && useWorkspace) {
    return (
      <>
        <StudentDrawingWorkspace
          detail={detail}
          attempts={drawingAttempts}
          voiceBySubmission={voiceBySubmission}
          rubric={rubric}
          submitMode={submitMode}
          lockedReason={lockedWhy}
          clock={clock}
          recording={recording}
          getToken={getToken}
          onChanged={load}
          onOpenAttachment={openAttachment}
          onBack={goBack}
        />
        {attachmentSnackbar}
      </>
    );
  }

  return (
    <LegacyPagePadding>
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 640, mx: 'auto' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ mb: 1, minHeight: 44, color: 'text.secondary', fontWeight: 600 }}>
        Back
      </Button>

      {!detail ? (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={70} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />
        </Stack>
      ) : (
        <>
          {/* Parent-folder trail, so the student can always jump to the full
              Assignments list even when they arrived here from the timetable. */}
          <Breadcrumbs separator={<NavigateNextIcon sx={{ fontSize: '0.9rem' }} />} sx={{ mb: 0.75 }}>
            <MuiLink
              component={NextLink}
              href="/student/assignments"
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
              sx={{ fontWeight: 600, maxWidth: { xs: 200, sm: 360 }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {detail.title}
            </Typography>
          </Breadcrumbs>
          <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.4rem' }, fontWeight: 800 }}>
            {detail.title}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, mb: 2 }} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" color="text.secondary">
              Class {new Date(detail.class_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {detail.evaluation_type === 'stars' ? '1-5 stars' : `out of ${detail.max_marks}`}
            </Typography>
            {submission?.status === 'reviewed' && submission.marks != null ? (
              <GradeDisplay evaluationType={detail.evaluation_type} value={submission.marks} maxMarks={detail.max_marks} size="small" showStarLabel />
            ) : due ? (
              <Chip
                size="small"
                label={due.label}
                sx={{ fontWeight: 700, bgcolor: alpha(due.overdue ? '#C62828' : '#1565C0', 0.12), color: due.overdue ? '#C62828' : '#1565C0' }}
              />
            ) : null}
          </Stack>

          {/* Catch-up banner for late joiners */}
          {clock?.is_late_joiner && canSubmit && (
            <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, bgcolor: alpha('#B8860B', 0.1), border: `1px solid ${alpha('#B8860B', 0.3)}` }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#8a6100' }}>
                Catch-up assignment
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                This class ran before you joined. Watch the recording, then submit. You have{' '}
                {detail.catchup_window_days} days from your join date.
              </Typography>
            </Box>
          )}

          <Stack spacing={2}>
            <AssignmentBriefBody detail={detail} recording={recording} onOpenAttachment={openAttachment} />

            <Divider />

            {isDrawing ? (
              <DrawingAssignmentPanel
                assignmentId={detail.id}
                submission={drawingSubmission as unknown as DrawingSubmissionView | null}
                voice={drawingSubmission ? voiceBySubmission[drawingSubmission.id] ?? null : null}
                evaluationType={detail.evaluation_type}
                maxMarks={detail.max_marks}
                submitMode={submitMode}
                lockedReason={lockedWhy}
                getToken={getToken}
                onChanged={load}
              />
            ) : (
              <>
                {/* Redo banner: what the teacher asked to fix, up top so it is not missed. */}
                {submission?.status === 'redo' && (
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha('#EF6C00', 0.1), border: `1px solid ${alpha('#EF6C00', 0.3)}` }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#B54700' }}>
                      Your teacher asked for a redo
                    </Typography>
                    {submission.feedback && (
                      <Typography variant="body2" sx={{ mt: 0.25 }}>
                        {submission.feedback}
                      </Typography>
                    )}
                  </Box>
                )}

                {/* My submission. Titled for what it holds: when there are
                    questions too, "your submission" alone is ambiguous. */}
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
                      {hasQuestions ? 'Your working' : 'Your submission'}
                    </Typography>
                    {submission?.status === 'redo' && (
                      <Chip label="Redo requested" size="small" sx={{ bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }} />
                    )}
                  </Stack>
                  {submission ? (
                    <Stack spacing={1.5}>
                      <SubmissionFiles files={submission.files} />
                      {submission.status === 'reviewed' && <ReactionAppreciation reaction={submission.reaction} />}
                      {submission.feedback && (
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                            Teacher feedback
                          </Typography>
                          <Typography variant="body2" sx={{ mt: 0.25 }}>
                            {submission.feedback}
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      You have not submitted yet.
                    </Typography>
                  )}
                </Box>

                {canSubmit ? (
                  <Box>
                    <Button
                      variant={submitMode === 'replace' ? 'outlined' : 'contained'}
                      fullWidth
                      onClick={() => setSubmitOpen(true)}
                      sx={{ minHeight: 48 }}
                    >
                      {submitMode === 'redo'
                        ? 'Resubmit'
                        : submitMode === 'replace'
                          ? 'Replace your file'
                          : 'Submit your work'}
                    </Button>
                    {submitMode === 'replace' && (
                      // Said before they need it, not after. A student who knows
                      // this is here does not have to message their teacher to
                      // find out whether a mistake can be fixed.
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mt: 0.75, textAlign: 'center' }}
                      >
                        Spotted a mistake? You can change this until your teacher marks it.
                      </Typography>
                    )}
                  </Box>
                ) : (
                  lockedWhy && (
                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <Typography variant="body2" color="text.secondary">
                        {lockedWhy}
                      </Typography>
                    </Box>
                  )
                )}

                {/* The questions, after the upload, because that is the order
                    they have to be done in when working is required. */}
                {hasQuestions && (
                  <>
                    <Divider />
                    <AssignmentQuestions
                      paper={paper!}
                      locked={answersLocked}
                      myAnswers={myAnswers}
                      myResult={myResult}
                      awaitingPdf={awaitingPdf}
                      busy={answersBusy}
                      onSubmit={submitAnswers}
                    />
                  </>
                )}
              </>
            )}

            {/* Your previous attempts (redo history) */}
            {priorAttemptViews.length > 0 && (
              <Box>
                <Divider sx={{ mb: 2 }} />
                <SubmissionHistoryTimeline
                  attempts={priorAttemptViews}
                  title="Your previous attempts"
                  voiceByKey={voiceBySubmission}
                  getToken={getToken}
                />
              </Box>
            )}
          </Stack>

          {!isDrawing && (
            <AssignmentSubmitSheet
              open={submitOpen}
              onClose={() => setSubmitOpen(false)}
              assignmentId={detail.id}
              format={detail.submission_format}
              submitMode={submitMode}
              redoFeedback={submission?.status === 'redo' ? submission.feedback : null}
              authFetch={authFetch}
              onSubmitted={() => {
                setSubmitOpen(false);
                load();
              }}
            />
          )}
        </>
      )}

      {attachmentSnackbar}
    </Box>
    </LegacyPagePadding>
  );
}
