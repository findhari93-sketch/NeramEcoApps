'use client';

/**
 * Assignment detail (student): the instructions, any image/video/links the
 * teacher attached, and, for late joiners, the class recording to watch first
 * plus a "Day N since you joined" clock. Submit or resubmit here; reviewed work
 * shows marks and feedback. Reuses the shared submit sheet + file viewer.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Stack, Chip, Button, Skeleton, Divider, IconButton, alpha, Snackbar, Alert,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import LinkIcon from '@mui/icons-material/Link';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { computeAssignmentClock } from '@/lib/assignment-clock';
import { extractYouTubeId } from '@/lib/youtube';
import SubmissionFiles from '@/components/assignments/SubmissionFiles';
import AssignmentSubmitSheet from '@/components/assignments/AssignmentSubmitSheet';
import DrawingAssignmentPanel, { type DrawingSubmissionView } from '@/components/assignments/DrawingAssignmentPanel';
import GradeDisplay from '@/components/assignments/GradeDisplay';
import ReactionAppreciation from '@/components/assignments/ReactionAppreciation';
import SubmissionHistoryTimeline from '@/components/assignments/SubmissionHistoryTimeline';
import { documentSubmissionToViews, drawingAttemptsToViews } from '@/lib/submission-history';
import { captureScreenshot } from '@/lib/capture-screenshot';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import type { DrawingSubmission, GalleryReactionType, NexusAssignmentSubmissionHistoryEntry } from '@neram/database/types';

interface Attachment {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface Detail {
  id: string;
  title: string;
  class_date: string;
  instructions: string | null;
  assignment_type: 'drawing' | 'document';
  submission_format: 'pdf' | 'image' | 'pdf_or_image';
  evaluation_type: 'marks' | 'stars';
  max_marks: number;
  due_at: string | null;
  catchup_window_days: number;
  content_image_url: string | null;
  reference_images?: string[] | null;
  content_video_url: string | null;
  links: { label: string; url: string }[];
  attachments: Attachment[];
}
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

export default function StudentAssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading, getToken } = useNexusAuthContext();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [submission, setSubmission] = useState<MySubmission | null>(null);
  const [drawingSubmission, setDrawingSubmission] = useState<DrawingSubmissionView | null>(null);
  const [drawingAttempts, setDrawingAttempts] = useState<DrawingSubmission[]>([]);
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null);
  const [recording, setRecording] = useState<{ url: string | null; source: string | null }>({ url: null, source: null });
  const [error, setError] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportShot, setReportShot] = useState<File | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await authFetch(`/api/assignments/${id}`);
      setDetail(res.assignment as Detail);
      setSubmission((res.submission as MySubmission) ?? null);
      setDrawingSubmission((res.drawing_submission as DrawingSubmissionView) ?? null);
      setDrawingAttempts((res.drawing_attempts as DrawingSubmission[]) ?? []);
      setEnrolledAt(res.enrolled_at ?? null);
      setRecording(res.recording ?? { url: null, source: null });
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

  const isDrawing = detail?.assignment_type === 'drawing';
  const canSubmit = isDrawing
    ? !drawingSubmission || drawingSubmission.status === 'redo'
    : !submission || submission.status === 'redo';
  const youtubeId = recording.url && recording.source === 'youtube' ? extractYouTubeId(recording.url) : null;
  // Reference / expected-output images: prefer the multi-image set, fall back to the
  // single legacy content image so older assignments still render.
  const refImages = detail
    ? detail.reference_images?.length
      ? detail.reference_images
      : detail.content_image_url
        ? [detail.content_image_url]
        : []
    : [];

  // Prior attempts (everything before the current one) so a student sent back for
  // a redo can revisit their earlier work and the feedback that came with it.
  const priorAttemptViews = !detail
    ? []
    : isDrawing
      ? drawingAttemptsToViews(drawingAttempts, {
          evaluationType: detail.evaluation_type,
          maxMarks: detail.max_marks,
        }).slice(0, -1)
      : submission
        ? documentSubmissionToViews(submission as any, {
            evaluationType: detail.evaluation_type,
            maxMarks: detail.max_marks,
          }).slice(0, -1)
        : [];

  if (error) {
    return (
      <Box sx={{ p: 3, maxWidth: 480, mx: 'auto', textAlign: 'center', mt: 6 }}>
        <Typography sx={{ fontWeight: 700 }}>Could not load this assignment</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {error}
        </Typography>
        <Button variant="outlined" onClick={load} sx={{ mt: 2, minHeight: 44 }}>
          Try again
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 640, mx: 'auto' }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/student/assignments')} sx={{ mb: 1, minHeight: 44, color: 'text.secondary', fontWeight: 600 }}>
        Assignments
      </Button>

      {!detail ? (
        <Stack spacing={1.5}>
          <Skeleton variant="rounded" height={70} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={200} sx={{ borderRadius: 3 }} />
        </Stack>
      ) : (
        <>
          <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.4rem' }, fontWeight: 800 }}>
            {detail.title}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, mb: 2 }} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" color="text.secondary">
              Class {new Date(detail.class_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {detail.evaluation_type === 'stars' ? '1-5 stars' : `out of ${detail.max_marks}`}
            </Typography>
            {submission?.status === 'reviewed' && submission.marks != null ? (
              <GradeDisplay evaluationType={detail.evaluation_type} value={submission.marks} maxMarks={detail.max_marks} size="small" showStarLabel />
            ) : clock && canSubmit && clock.personal_due ? (
              <Chip
                size="small"
                label={
                  clock.is_late_joiner
                    ? clock.status === 'overdue'
                      ? `${Math.abs(clock.days_remaining ?? 0)}d overdue`
                      : `Day ${clock.days_elapsed} · ${clock.days_remaining}d left`
                    : clock.status === 'overdue'
                      ? 'Overdue'
                      : clock.days_remaining === 0
                        ? 'Due today'
                        : `${clock.days_remaining}d left`
                }
                sx={{ fontWeight: 700, bgcolor: alpha(clock.status === 'overdue' ? '#C62828' : '#1565C0', 0.12), color: clock.status === 'overdue' ? '#C62828' : '#1565C0' }}
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
            {/* Class recording */}
            {recording.url && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                  Class recording
                </Typography>
                {youtubeId ? (
                  <Box sx={{ position: 'relative', pt: '56.25%', borderRadius: 2, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                    <Box
                      component="iframe"
                      src={`https://www.youtube.com/embed/${youtubeId}`}
                      title="Class recording"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                    />
                  </Box>
                ) : (
                  <Button
                    variant="outlined"
                    fullWidth
                    startIcon={<PlayCircleOutlineIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                    onClick={() => window.open(recording.url!, '_blank', 'noopener')}
                    sx={{ minHeight: 48, textTransform: 'none' }}
                  >
                    Watch the class recording
                  </Button>
                )}
              </Box>
            )}

            {/* Reference / expected-output images */}
            {refImages.length > 0 && (
              <Box>
                {refImages.length > 1 && (
                  <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                    Reference ({refImages.length})
                  </Typography>
                )}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns:
                      refImages.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: 1,
                  }}
                >
                  {refImages.map((src, i) => (
                    <Box
                      key={`${src}-${i}`}
                      component="img"
                      src={src}
                      alt={refImages.length > 1 ? `Reference ${i + 1}` : ''}
                      onClick={() => window.open(src, '_blank', 'noopener')}
                      sx={{
                        width: '100%',
                        ...(refImages.length === 1 ? {} : { aspectRatio: '1 / 1', objectFit: 'cover' }),
                        borderRadius: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            {/* Instructions */}
            {detail.instructions && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {detail.instructions}
              </Typography>
            )}

            {/* Explainer video + links */}
            {(detail.content_video_url || detail.links.length > 0) && (
              <Stack spacing={1}>
                {detail.content_video_url && (
                  <Button
                    variant="outlined"
                    startIcon={<OndemandVideoOutlinedIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                    onClick={() => window.open(detail.content_video_url!, '_blank', 'noopener')}
                    sx={{ justifyContent: 'flex-start', minHeight: 48, textTransform: 'none' }}
                  >
                    Watch explainer video
                  </Button>
                )}
                {detail.links.map((l, i) => (
                  <Button
                    key={i}
                    variant="outlined"
                    startIcon={<LinkIcon />}
                    endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                    onClick={() => window.open(l.url, '_blank', 'noopener')}
                    sx={{ justifyContent: 'flex-start', minHeight: 48, textTransform: 'none' }}
                  >
                    <Box sx={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.label}</Box>
                  </Button>
                ))}
              </Stack>
            )}

            {/* Reference materials */}
            {detail.attachments.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
                  Reference materials
                </Typography>
                <Stack spacing={1}>
                  {detail.attachments.map((a) => {
                    const isPdf = a.file?.file_type === 'application/pdf';
                    return (
                      <Button
                        key={a.id}
                        variant="outlined"
                        onClick={() => openAttachment(a.study_file_id)}
                        startIcon={isPdf ? <PictureAsPdfOutlinedIcon /> : <ImageOutlinedIcon />}
                        endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                        sx={{ justifyContent: 'flex-start', minHeight: 48, textTransform: 'none' }}
                      >
                        <Box sx={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.file?.title || a.file?.file_name || 'File'}
                        </Box>
                      </Button>
                    );
                  })}
                </Stack>
              </Box>
            )}

            <Divider />

            {isDrawing ? (
              <DrawingAssignmentPanel
                assignmentId={detail.id}
                submission={drawingSubmission}
                evaluationType={detail.evaluation_type}
                maxMarks={detail.max_marks}
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

                {/* My submission */}
                <Box>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, flex: 1 }}>
                      Your submission
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

                {canSubmit && (
                  <Button variant="contained" onClick={() => setSubmitOpen(true)} sx={{ minHeight: 48 }}>
                    {submission?.status === 'redo' ? 'Resubmit' : 'Submit your work'}
                  </Button>
                )}
              </>
            )}

            {/* Your previous attempts (redo history) */}
            {priorAttemptViews.length > 0 && (
              <Box>
                <Divider sx={{ mb: 2 }} />
                <SubmissionHistoryTimeline attempts={priorAttemptViews} title="Your previous attempts" />
              </Box>
            )}
          </Stack>

          {!isDrawing && (
            <AssignmentSubmitSheet
              open={submitOpen}
              onClose={() => setSubmitOpen(false)}
              assignmentId={detail.id}
              format={detail.submission_format}
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

      {/* A reference material failed to open — offer a one-tap report instead of
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
    </Box>
  );
}
