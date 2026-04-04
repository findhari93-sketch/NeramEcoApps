'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Fab, Skeleton, Chip, IconButton, Divider,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import DifficultyChip from '@/components/drawings/DifficultyChip';
import ReferenceImageToggle from '@/components/drawings/ReferenceImageToggle';
import DrawingSubmissionSheet from '@/components/drawings/DrawingSubmissionSheet';
import type { DrawingQuestion, DrawingSubmissionWithQuestion } from '@neram/database/types';

export default function QuestionDetailPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [question, setQuestion] = useState<DrawingQuestion | null>(null);
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const [qRes, sRes] = await Promise.all([
        fetch(`/api/drawing/questions/${questionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/drawing/submissions/my?question_id=${questionId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const qData = await qRes.json();
      const sData = await sRes.json();
      setQuestion(qData.question || null);
      setSubmissions(sData.submissions || []);
    } catch {
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, questionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

      <Typography variant="subtitle2" fontWeight={600} gutterBottom>
        My Submissions ({submissions.length})
      </Typography>
      {submissions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
          You haven&apos;t practiced this question yet. Tap the button below to submit your drawing!
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {submissions.map((s) => (
            <Paper
              key={s.id}
              variant="outlined"
              sx={{ p: 1.5, cursor: 'pointer' }}
              onClick={() => router.push(`/student/drawings/submissions/${s.id}`)}
            >
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                <Box
                  component="img"
                  src={s.original_image_url}
                  alt="Submission"
                  sx={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 1 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Chip
                    label={s.status}
                    size="small"
                    color={s.status === 'reviewed' ? 'success' : s.status === 'submitted' ? 'warning' : 'default'}
                    sx={{ mb: 0.5 }}
                  />
                  {s.tutor_rating && (
                    <Typography variant="caption" display="block">
                      Rating: {'★'.repeat(s.tutor_rating)}{'☆'.repeat(5 - s.tutor_rating)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

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
