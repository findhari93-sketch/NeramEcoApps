'use client';

/**
 * Student view of one assignment: the instructions, the teacher's reference
 * files (opened view-only), and the student's own submission with marks and
 * feedback. Submitting (or resubmitting after a redo) opens the submit sheet.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Dialog,
  Stack,
  Typography,
  IconButton,
  Button,
  Chip,
  Divider,
  CircularProgress,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SubmissionFiles from './SubmissionFiles';
import AssignmentSubmitSheet from './AssignmentSubmitSheet';

interface Attachment {
  id: string;
  study_file_id: string;
  file: { id: string; title: string; file_name: string; file_type: string | null } | null;
}
interface AssignmentDetail {
  id: string;
  title: string;
  instructions: string | null;
  submission_format: 'pdf' | 'image' | 'pdf_or_image';
  max_marks: number;
  due_at: string | null;
  attachments: Attachment[];
}
interface MySubmission {
  id: string;
  files: { path: string; name: string; mime: string; url?: string | null }[];
  status: string;
  marks: number | null;
  feedback: string | null;
  submitted_at: string;
}

interface StudentAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  assignmentId: string;
  authFetch: (url: string, init?: RequestInit) => Promise<any>;
  getToken: () => Promise<string | null>;
  onChanged: () => void;
}

export default function StudentAssignmentDialog({
  open,
  onClose,
  assignmentId,
  authFetch,
  getToken,
  onChanged,
}: StudentAssignmentDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [assignment, setAssignment] = useState<AssignmentDetail | null>(null);
  const [submission, setSubmission] = useState<MySubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/api/assignments/${assignmentId}`);
      setAssignment(res.assignment as AssignmentDetail);
      setSubmission((res.submission as MySubmission) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this assignment.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, assignmentId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const openAttachment = async (studyFileId: string) => {
    const token = await getToken();
    if (!token) return;
    window.open(
      `/api/study-materials/files/${studyFileId}/content?token=${encodeURIComponent(token)}`,
      '_blank',
      'noopener',
    );
  };

  const canSubmit = !submission || submission.status === 'redo';
  const reviewed = submission?.status === 'reviewed';

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <Stack direction="row" alignItems="center" sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography sx={{ fontWeight: 700, flex: 1 }} noWrap>
          {assignment?.title || 'Assignment'}
        </Typography>
        <IconButton onClick={onClose} sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ textAlign: 'center', py: 5 }}>
            <CircularProgress size={30} />
          </Box>
        ) : error ? (
          <Typography color="error">{error}</Typography>
        ) : assignment ? (
          <Stack spacing={2}>
            <Typography variant="caption" color="text.secondary">
              Out of {assignment.max_marks}
              {assignment.due_at
                ? ` · due ${new Date(assignment.due_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                : ''}
            </Typography>

            {assignment.instructions && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {assignment.instructions}
              </Typography>
            )}

            {assignment.attachments.length > 0 && (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
                  Reference materials
                </Typography>
                <Stack spacing={1}>
                  {assignment.attachments.map((a) => {
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

            {/* My submission */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                  Your submission
                </Typography>
                {reviewed && submission?.marks != null && (
                  <Chip
                    label={`${submission.marks} / ${assignment.max_marks}`}
                    size="small"
                    sx={{ bgcolor: alpha('#2E7D32', 0.12), color: '#1B5E20', fontWeight: 700 }}
                  />
                )}
                {submission?.status === 'redo' && (
                  <Chip label="Redo requested" size="small" sx={{ bgcolor: alpha('#EF6C00', 0.14), color: '#B54700', fontWeight: 700 }} />
                )}
              </Stack>

              {submission ? (
                <Stack spacing={1.5}>
                  <SubmissionFiles files={submission.files} />
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

            <AssignmentSubmitSheet
              open={submitOpen}
              onClose={() => setSubmitOpen(false)}
              assignmentId={assignment.id}
              format={assignment.submission_format}
              redoFeedback={submission?.status === 'redo' ? submission.feedback : null}
              authFetch={authFetch}
              onSubmitted={() => {
                setSubmitOpen(false);
                load();
                onChanged();
              }}
            />
          </Stack>
        ) : null}
      </Box>
    </Dialog>
  );
}
