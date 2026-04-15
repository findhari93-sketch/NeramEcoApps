'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box, Typography, Paper, Fab, Skeleton, Chip, IconButton, Divider,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, DialogContentText,
  Accordion, AccordionSummary, AccordionDetails,
  useTheme, useMediaQuery,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RepeatIcon from '@mui/icons-material/Repeat';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import DifficultyChip from '@/components/drawings/DifficultyChip';
import ReferenceImageToggle from '@/components/drawings/ReferenceImageToggle';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import ThreadTimeline from '@/components/drawings/ThreadTimeline';
import type { DrawingQuestionEnriched, DrawingThreadView } from '@neram/database/types';

export default function QuestionDetailPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromQb = searchParams.get('from') === 'qb';
  const qbId = searchParams.get('qb_id');
  const { getToken } = useNexusAuthContext();
  const [question, setQuestion] = useState<DrawingQuestionEnriched | null>(null);
  const [thread, setThread] = useState<DrawingThreadView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

  // Whether to show the submit CTA
  const showSubmitCTA = !thread || thread.thread_status.status === 'redo';
  const isRedo = thread?.thread_status.status === 'redo';

  return (
    <Box sx={{
      px: isMobile ? 0 : { sm: 3 },
      pt: isMobile ? 0 : 2,
      pb: showSubmitCTA ? (isMobile ? 16 : 10) : 10,
      maxWidth: 800,
      mx: 'auto',
      ...(isMobile && { mx: { xs: -2, sm: -3 }, mt: -2 }),
    }}>
      {/* Header row: back + Q number + badges inline */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 0.75,
        px: isMobile ? 1 : 0,
        py: isMobile ? 0.75 : 0,
        mb: isMobile ? 0.75 : 1,
        ...(isMobile && {
          bgcolor: '#fff',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }),
      }}>
        <IconButton
          onClick={() => {
            if (fromQb && qbId) {
              router.push(`/student/question-bank/questions/${qbId}`);
            } else {
              router.back();
            }
          }}
          size="small"
          sx={{ p: 0.5 }}
        >
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        {question.question_number && (
          <Chip
            label={`Q${question.question_number}`}
            size="small"
            sx={{ fontWeight: 700, fontSize: '0.72rem', height: 22 }}
          />
        )}
        <CategoryBadge category={question.category} />
        <DifficultyChip difficulty={question.difficulty_tag} />
        <Chip label={`NATA ${question.year}`} size="small" variant="outlined" />
      </Box>

      {/* Repeat info */}
      {question.repeat_count > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: isMobile ? 1.5 : 0, mb: 1 }}>
          <RepeatIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
            This question appeared in: {question.repeat_years.join(', ')}
          </Typography>
        </Box>
      )}

      {/* Content area */}
      <Box sx={{ px: isMobile ? 1.5 : 0 }}>
        <Typography
          variant={isMobile ? 'subtitle1' : 'h6'}
          fontWeight={600}
          sx={{ mb: isMobile ? 1 : 2, lineHeight: 1.35, fontSize: isMobile ? '0.95rem' : undefined }}
        >
          {question.question_text}
        </Typography>

        {question.objects.length > 0 && (
          <Box sx={{ mb: isMobile ? 1 : 2 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.68rem' }}>
              OBJECTS
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.25 }}>
              {question.objects.map((obj) => (
                <Chip key={obj} label={obj} size="small" variant="outlined" sx={isMobile ? { height: 24, fontSize: '0.75rem' } : undefined} />
              ))}
            </Box>
          </Box>
        )}

        {question.color_constraint && (
          <Paper variant="outlined" sx={{ p: isMobile ? 1 : 1.5, mb: isMobile ? 1 : 2, bgcolor: 'warning.50' }}>
            <Typography variant="caption" fontWeight={600}>Color Constraint</Typography>
            <Typography variant="body2" sx={{ fontSize: isMobile ? '0.82rem' : undefined }}>{question.color_constraint.replace(/_/g, ' ')}</Typography>
          </Paper>
        )}

        {question.design_principle && (
          <Paper variant="outlined" sx={{ p: isMobile ? 1 : 1.5, mb: isMobile ? 1 : 2, bgcolor: 'info.50' }}>
            <Typography variant="caption" fontWeight={600}>Design Principle</Typography>
            <Typography variant="body2" sx={{ fontSize: isMobile ? '0.82rem' : undefined }}>{question.design_principle.replace(/_/g, ' ')}</Typography>
          </Paper>
        )}

        {question.reference_images.length > 0 && (
          <Box sx={{ mb: isMobile ? 1.5 : 3 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ fontSize: isMobile ? '0.82rem' : undefined }}>
              Reference Images
            </Typography>
            <ReferenceImageToggle images={question.reference_images} />
          </Box>
        )}

        {/* Teacher's Reference Solution (visible after first submission) */}
        {thread && (question.solution_image_url || question.solution_video_url) && (
          <Accordion
            variant="outlined"
            sx={{ mb: isMobile ? 1.5 : 3, '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <PhotoLibraryOutlinedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography variant="subtitle2" fontWeight={600} sx={{ fontSize: isMobile ? '0.82rem' : undefined }}>
                  Teacher&apos;s Reference Solution
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {question.solution_image_url && (
                <Box sx={{ mb: 1 }}>
                  <Box
                    component="img"
                    src={question.solution_image_url}
                    alt="Teacher's reference solution"
                    sx={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                  />
                </Box>
              )}
              {question.solution_video_url && (
                <Button
                  variant="outlined"
                  size="small"
                  href={question.solution_video_url}
                  target="_blank"
                  sx={{ textTransform: 'none', fontSize: '0.8rem' }}
                >
                  Watch Solution Video
                </Button>
              )}
            </AccordionDetails>
          </Accordion>
        )}
        {thread && !question.solution_image_url && !question.solution_video_url && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: isMobile ? 1 : 2, fontSize: '0.72rem' }}>
            Reference solution coming soon
          </Typography>
        )}

        <Divider sx={{ my: isMobile ? 1.5 : 3 }} />

        {/* Status banner */}
        {thread?.thread_status.status === 'completed' && (
          <Paper
            variant="outlined"
            sx={{ p: isMobile ? 1 : 1.5, mb: isMobile ? 1 : 2, bgcolor: 'success.50', borderColor: 'success.200', display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 18 }} />
            <Typography variant="body2" color="success.dark" fontWeight={500} sx={{ fontSize: isMobile ? '0.82rem' : undefined }}>
              Great work! Your tutor has marked this as completed.
            </Typography>
          </Paper>
        )}
        {thread?.thread_status.status === 'redo' && (
          <Paper
            variant="outlined"
            sx={{ p: isMobile ? 1 : 1.5, mb: isMobile ? 1 : 2, bgcolor: 'warning.50', borderColor: 'warning.200' }}
          >
            <Typography variant="body2" color="warning.dark" fontWeight={500} sx={{ fontSize: isMobile ? '0.82rem' : undefined }}>
              Your tutor requested improvements. Review the feedback and submit a new attempt.
            </Typography>
          </Paper>
        )}

        {/* My Submissions section */}
        <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ fontSize: isMobile ? '0.85rem' : undefined }}>
          My Submissions
        </Typography>
        {thread ? (
          <ThreadTimeline
            thread={thread}
            onAttemptClick={(subId) => router.push(`/student/drawings/submissions/${subId}`)}
          />
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            You haven&apos;t practiced this question yet. Tap the button below to submit your drawing!
          </Typography>
        )}

        {/* Start Fresh */}
        {thread && thread.thread_status.status !== 'completed' && (
          <Button
            variant="text"
            color="error"
            size="small"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            sx={{ mt: 0.5, textTransform: 'none', fontSize: isMobile ? '0.75rem' : undefined }}
          >
            Start Fresh (delete all attempts)
          </Button>
        )}
      </Box>

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

      {/* Submit CTA: sticky bottom bar on mobile, FAB on desktop */}
      {showSubmitCTA && isMobile && (
        <Box sx={{
          position: 'fixed',
          bottom: 64,
          left: 0, right: 0,
          px: 2, py: 1.25,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          zIndex: 10,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
        }}>
          <Button
            variant="contained"
            color={isRedo ? 'warning' : 'primary'}
            fullWidth
            onClick={() => setSheetOpen(true)}
            startIcon={<BrushOutlinedIcon />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 48,
              borderRadius: 2,
              fontSize: '0.9rem',
            }}
          >
            {isRedo ? 'Submit Improvement' : 'Practice This'}
          </Button>
        </Box>
      )}

      {/* FAB for desktop/tablet */}
      {showSubmitCTA && !isMobile && (
        <Fab
          color={isRedo ? 'warning' : 'primary'}
          variant="extended"
          onClick={() => setSheetOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            textTransform: 'none',
          }}
        >
          <BrushOutlinedIcon sx={{ mr: 1 }} />
          {isRedo ? 'Submit Improvement' : 'Practice This'}
        </Fab>
      )}

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
