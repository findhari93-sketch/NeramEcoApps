'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Fab, Skeleton, Chip, IconButton, Divider,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import DifficultyChip from '@/components/drawings/DifficultyChip';
import ReferenceImageToggle from '@/components/drawings/ReferenceImageToggle';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import ThreadTimeline from '@/components/drawings/ThreadTimeline';
import type { DrawingQuestion, DrawingThreadView } from '@neram/database/types';

export default function QuestionDetailPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [question, setQuestion] = useState<DrawingQuestion | null>(null);
  const [thread, setThread] = useState<DrawingThreadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const [qRes, tRes] = await Promise.all([
        fetch(`/api/drawing/questions/${questionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/drawing/submissions/thread?question_id=${questionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const qData = await qRes.json();
      const tData = await tRes.json();
      setQuestion(qData.question || null);
      setThread(tData.thread || null);
    } catch {
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, questionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDeleteThread = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/thread/manage?question_id=${questionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setThread(null);
      setDeleteDialogOpen(false);
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
        <Skeleton height={40} width={200} />
        <Skeleton height={120} sx={{ mt: 2 }} />
        <Skeleton height={300} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (!question) {
    return (
      <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">Question not found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto', pb: 10 }}>
      <IconButton onClick={() => router.back()} sx={{ mb: 1 }}>
        <ArrowBackIcon />
      </IconButton>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <CategoryBadge category={question.category} />
        <DifficultyChip difficulty={question.difficulty_tag} />
        <Chip label={`NATA ${question.year}`} size="small" variant="outlined" />
      </Box>

      <Typography variant="h6" fontWeight={600} sx={{ mb: 2, lineHeight: 1.4 }}>
        {question.question_text}
      </Typography>

      {question.objects.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" gutterBottom>
            OBJECTS
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
            {question.objects.map((obj) => (
              <Chip key={obj} label={obj} size="small" variant="outlined" />
            ))}
          </Box>
        </Box>
      )}

      {question.color_constraint && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'warning.50' }}>
          <Typography variant="caption" fontWeight={600}>Color Constraint</Typography>
          <Typography variant="body2">{question.color_constraint.replace(/_/g, ' ')}</Typography>
        </Paper>
      )}

      {question.design_principle && (
        <Paper variant="outlined" sx={{ p: 1.5, mb: 2, bgcolor: 'info.50' }}>
          <Typography variant="caption" fontWeight={600}>Design Principle</Typography>
          <Typography variant="body2">{question.design_principle.replace(/_/g, ' ')}</Typography>
        </Paper>
      )}

      {question.reference_images.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Reference Images
          </Typography>
          <ReferenceImageToggle images={question.reference_images} />
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Status banner */}
      {thread?.thread_status.status === 'completed' && (
        <Paper
          variant="outlined"
          sx={{ p: 1.5, mb: 2, bgcolor: 'success.50', borderColor: 'success.200', display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 20 }} />
          <Typography variant="body2" color="success.dark" fontWeight={500}>
            Great work! Your tutor has marked this as completed.
          </Typography>
        </Paper>
      )}
      {thread?.thread_status.status === 'redo' && (
        <Paper
          variant="outlined"
          sx={{ p: 1.5, mb: 2, bgcolor: 'warning.50', borderColor: 'warning.200' }}
        >
          <Typography variant="body2" color="warning.dark" fontWeight={500}>
            Your tutor requested improvements. Review the feedback and submit a new attempt.
          </Typography>
        </Paper>
      )}

      {/* My Submissions section */}
      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        My Submissions
      </Typography>
      {thread ? (
        <ThreadTimeline
          thread={thread}
          onAttemptClick={(subId) => router.push(`/student/drawings/submissions/${subId}`)}
        />
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          You haven&apos;t practiced this question yet. Tap the button below to submit your drawing!
        </Typography>
      )}

      {/* Start Fresh — delete thread (only for non-completed) */}
      {thread && thread.thread_status.status !== 'completed' && (
        <Button
          variant="text"
          color="error"
          size="small"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => setDeleteDialogOpen(true)}
          sx={{ mt: 1, textTransform: 'none' }}
        >
          Start Fresh (delete all attempts)
        </Button>
      )}

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Start Fresh?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete all your attempts and feedback for this question. You&apos;ll be able to start over from scratch. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>Cancel</Button>
          <Button onClick={handleDeleteThread} color="error" variant="contained" disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete All & Start Fresh'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dynamic FAB based on thread status */}
      {!thread && (
        <Fab
          color="primary"
          variant="extended"
          onClick={() => setSheetOpen(true)}
          sx={{
            position: 'fixed',
            bottom: { xs: 80, sm: 24 },
            right: { xs: 16, sm: 24 },
            textTransform: 'none',
          }}
        >
          <BrushOutlinedIcon sx={{ mr: 1 }} />
          Practice This
        </Fab>
      )}
      {thread?.thread_status.status === 'redo' && (
        <Fab
          color="warning"
          variant="extended"
          onClick={() => setSheetOpen(true)}
          sx={{
            position: 'fixed',
            bottom: { xs: 80, sm: 24 },
            right: { xs: 16, sm: 24 },
            textTransform: 'none',
          }}
        >
          <BrushOutlinedIcon sx={{ mr: 1 }} />
          Submit Improvement
        </Fab>
      )}
      {/* No FAB when thread status is 'active' (pending review) or 'completed' */}

      <DrawingSubmissionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        questionId={questionId}
        sourceType="question_bank"
        getToken={getToken}
        onSubmitted={fetchData}
      />
    </Box>
  );
}
