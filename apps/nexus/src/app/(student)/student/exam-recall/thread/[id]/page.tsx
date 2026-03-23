'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  Alert,
  Button,
  Stack,
  Chip,
  Paper,
  Snackbar,
  useMediaQuery,
  useTheme,
  ImageList,
  ImageListItem,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ImageIcon from '@mui/icons-material/Image';
import EditIcon from '@mui/icons-material/Edit';
import LinkIcon from '@mui/icons-material/Link';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VersionTimeline from '@/components/exam-recall/VersionTimeline';
import ConfirmButton from '@/components/exam-recall/ConfirmButton';
import CommentThread from '@/components/exam-recall/CommentThread';
import DrawingRecallCard from '@/components/exam-recall/DrawingRecallCard';
import ContributeTypeIt from '@/components/exam-recall/ContributeTypeIt';
import type {
  ExamRecallThreadDetail,
  ExamRecallQuestionType,
  ExamRecallSection,
  ExamRecallThreadStatus,
  ExamRecallTopicCategory,
} from '@neram/database';

const QUESTION_TYPE_LABELS: Record<ExamRecallQuestionType, string> = {
  mcq: 'MCQ',
  numerical: 'Numerical',
  fill_blank: 'Fill-blank',
  drawing: 'Drawing',
};

const QUESTION_TYPE_COLORS: Record<ExamRecallQuestionType, string> = {
  mcq: '#1976d2',
  numerical: '#7b1fa2',
  fill_blank: '#e65100',
  drawing: '#2e7d32',
};

const SECTION_LABELS: Record<ExamRecallSection, string> = {
  part_a: 'Part A',
  part_b: 'Part B',
};

const STATUS_CONFIG: Record<ExamRecallThreadStatus, { label: string; color: 'default' | 'warning' | 'success' | 'error' }> = {
  raw: { label: 'Raw', color: 'default' },
  under_review: { label: 'Under Review', color: 'warning' },
  published: { label: 'Published', color: 'success' },
  dismissed: { label: 'Dismissed', color: 'error' },
};

const TOPIC_LABELS: Record<ExamRecallTopicCategory, string> = {
  visual_reasoning: 'Visual Reasoning',
  logical_derivation: 'Logical Derivation',
  gk_architecture: 'GK / Architecture',
  language: 'Language',
  design_sensitivity: 'Design Sensitivity',
  numerical_ability: 'Numerical Ability',
  drawing: 'Drawing',
};

export default function ThreadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const threadId = params.id as string;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, activeClassroom, getToken } = useNexusAuthContext();

  // Thread data
  const [thread, setThread] = useState<ExamRecallThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline refine form
  const [showRefineForm, setShowRefineForm] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  // Fetch thread
  useEffect(() => {
    if (!threadId) return;
    fetchThread();
  }, [threadId]);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/exam-recall/threads/${threadId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Thread not found');
        throw new Error('Failed to load thread');
      }
      const data: ExamRecallThreadDetail = await res.json();
      setThread(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [threadId, getToken]);

  const handleConfirm = useCallback(async () => {
    try {
      const token = await getToken();
      await fetch(`/api/exam-recall/threads/${threadId}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSnackbar({ open: true, message: 'Confirmed!', severity: 'success' });
      fetchThread();
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to confirm', severity: 'error' });
    }
  }, [threadId, getToken, fetchThread]);

  const handleVouch = useCallback(
    async (versionId: string) => {
      try {
        const token = await getToken();
        await fetch(`/api/exam-recall/threads/${threadId}/vouch`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ version_id: versionId }),
        });
        fetchThread();
      } catch (err) {
        console.error('Vouch error:', err);
      }
    },
    [threadId, getToken, fetchThread],
  );

  const handleAddComment = useCallback(
    async (body: string, parentId?: string) => {
      try {
        const token = await getToken();
        await fetch(`/api/exam-recall/threads/${threadId}/comments`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body, parent_comment_id: parentId }),
        });
        fetchThread();
      } catch (err) {
        console.error('Comment error:', err);
      }
    },
    [threadId, getToken, fetchThread],
  );

  const handleRefineSubmit = useCallback(
    async (data: any) => {
      const token = await getToken();
      // Create a new version on this thread
      const latestVersion = thread?.versions?.[thread.versions.length - 1];
      const res = await fetch(`/api/exam-recall/threads/${threadId}/versions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          parent_version_id: latestVersion?.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to submit refinement');
      }
      setShowRefineForm(false);
      setSnackbar({ open: true, message: 'Refinement submitted!', severity: 'success' });
      fetchThread();
    },
    [threadId, thread, getToken, fetchThread],
  );

  const formatExamDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getSessionLabel = (num: number) => {
    const labels: Record<number, string> = { 1: 'Morning', 2: 'Afternoon', 3: 'Evening' };
    return `Session ${num} (${labels[num] || ''})`;
  };

  // Loading
  if (loading) {
    return (
      <Stack spacing={2} sx={{ py: 2 }}>
        <Skeleton variant="rounded" height={40} width={200} />
        <Skeleton variant="rounded" height={120} />
        <Skeleton variant="rounded" height={200} />
        <Skeleton variant="rounded" height={150} />
      </Stack>
    );
  }

  // Error
  if (error || !thread) {
    return (
      <Box sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error || 'Thread not found'}
        </Alert>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/student/exam-recall')}
        >
          Back to Exam Recall
        </Button>
      </Box>
    );
  }

  const statusConfig = STATUS_CONFIG[thread.status];
  const userHasConfirmed = thread.confirms?.some((c) => c.user_id === user?.id) ?? false;

  return (
    <Box>
      {/* Back button */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.back()}
          size="small"
          color="inherit"
        >
          Back
        </Button>
      </Stack>

      {/* Header */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}>
        {/* Badges row */}
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
          <Chip
            label={QUESTION_TYPE_LABELS[thread.question_type]}
            size="small"
            sx={{
              bgcolor: QUESTION_TYPE_COLORS[thread.question_type] + '18',
              color: QUESTION_TYPE_COLORS[thread.question_type],
              fontWeight: 600,
            }}
          />
          <Chip
            label={SECTION_LABELS[thread.section]}
            size="small"
            variant="outlined"
          />
          <Chip
            label={statusConfig.label}
            size="small"
            color={statusConfig.color}
            variant="outlined"
          />
          {thread.topic_category && (
            <Chip
              label={TOPIC_LABELS[thread.topic_category]}
              size="small"
              variant="outlined"
              color="secondary"
            />
          )}
          {thread.has_image && (
            <Chip
              icon={<ImageIcon sx={{ fontSize: '0.9rem' }} />}
              label="Has Image"
              size="small"
              variant="outlined"
            />
          )}
        </Stack>

        {/* Exam context */}
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            {formatExamDate(thread.exam_date)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {getSessionLabel(thread.session_number)}
          </Typography>
        </Stack>
      </Paper>

      {/* Actions bar */}
      <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <ConfirmButton
            confirmed={userHasConfirmed}
            count={thread.confirm_count}
            onClick={handleConfirm}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => setShowRefineForm(!showRefineForm)}
          >
            Refine this question
          </Button>
        </Stack>
      </Paper>

      {/* Inline refine form */}
      {showRefineForm && activeClassroom && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Submit a refined version
          </Typography>
          <ContributeTypeIt
            examDate={thread.exam_date}
            sessionNumber={thread.session_number}
            classroomId={activeClassroom.id}
            onSubmit={handleRefineSubmit}
          />
        </Paper>
      )}

      {/* Versions section */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Question Versions ({thread.versions.length})
        </Typography>
        <VersionTimeline versions={thread.versions} onVouch={handleVouch} />
      </Paper>

      {/* Drawings section (if Part A) */}
      {thread.section === 'part_a' && thread.drawings && thread.drawings.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Drawing Recalls ({thread.drawings.length})
          </Typography>
          <Stack spacing={1.5}>
            {thread.drawings.map((drawing) => (
              <DrawingRecallCard key={drawing.id} drawing={drawing} />
            ))}
          </Stack>
        </Paper>
      )}

      {/* Linked variants */}
      {thread.variants && thread.variants.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <LinkIcon sx={{ fontSize: '1.2rem', color: 'text.secondary' }} />
            <Typography variant="subtitle1" fontWeight={600}>
              Linked Variants
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            This question also appeared in:
          </Typography>
          <Stack spacing={1}>
            {thread.variants.map((variant) => (
              <Paper
                key={variant.id}
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() =>
                  router.push(`/student/exam-recall/thread/${variant.linked_thread.id}`)
                }
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Chip
                    label={formatExamDate(variant.linked_thread.exam_date)}
                    size="small"
                    variant="outlined"
                  />
                  <Typography variant="body2">
                    {getSessionLabel(variant.linked_thread.session_number)}
                  </Typography>
                  <Chip
                    label={STATUS_CONFIG[variant.linked_thread.status].label}
                    size="small"
                    color={STATUS_CONFIG[variant.linked_thread.status].color}
                    variant="outlined"
                  />
                </Stack>
              </Paper>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Uploads / Image gallery */}
      {thread.uploads && thread.uploads.length > 0 && (
        <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Uploads ({thread.uploads.length})
          </Typography>
          <ImageList
            cols={isMobile ? 2 : 3}
            gap={8}
            sx={{ maxHeight: 400, overflow: 'auto' }}
          >
            {thread.uploads.map((upload) => (
              <ImageListItem key={upload.id}>
                <Box
                  component="img"
                  src={upload.storage_path}
                  alt={upload.upload_type || 'Upload'}
                  sx={{
                    width: '100%',
                    height: 150,
                    objectFit: 'cover',
                    borderRadius: 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => window.open(upload.storage_path, '_blank')}
                />
              </ImageListItem>
            ))}
          </ImageList>
        </Paper>
      )}

      {/* Discussion */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, mb: 2, borderRadius: 2 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Discussion ({thread.comments?.length || 0})
        </Typography>
        {user && (
          <CommentThread
            comments={thread.comments || []}
            onAddComment={handleAddComment}
            currentUserId={user.id}
          />
        )}
      </Paper>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
