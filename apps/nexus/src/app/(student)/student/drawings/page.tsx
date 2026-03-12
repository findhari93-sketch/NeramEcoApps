'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  LinearProgress,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import SubmissionUpload from '@/components/SubmissionUpload';

interface DrawingExercise {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  dos_and_donts: string | null;
  reference_images: Array<{ url: string; caption?: string }>;
  is_unlocked: boolean;
  latest_submission: {
    id: string;
    status: string;
    submission_url: string;
    correction_url: string | null;
    teacher_notes: string | null;
    grade: string | null;
    attempt_number: number;
  } | null;
}

interface DrawingCategory {
  id: string;
  title: string;
  description: string | null;
  is_unlocked: boolean;
  exercises: DrawingExercise[];
}

interface DrawingLevel {
  id: string;
  title: string;
  description: string | null;
  categories: DrawingCategory[];
}

interface ProgressSummary {
  total: number;
  approved: number;
  percentage: number;
}

export default function StudentDrawings() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [levels, setLevels] = useState<DrawingLevel[]>([]);
  const [progress, setProgress] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedExercise, setSelectedExercise] = useState<DrawingExercise | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };
      const [pathRes, progressRes] = await Promise.all([
        fetch(`/api/drawings?classroom=${activeClassroom.id}&mode=path`, { headers }),
        fetch(`/api/drawings?classroom=${activeClassroom.id}&mode=progress`, { headers }),
      ]);

      if (pathRes.ok) {
        const data = await pathRes.json();
        setLevels(data.levels || []);
      }
      if (progressRes.ok) {
        setProgress(await progressRes.json());
      }
    } catch (err) {
      console.error('Failed to load drawings:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getStatusIcon = (exercise: DrawingExercise) => {
    if (!exercise.is_unlocked) return <LockOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />;
    if (!exercise.latest_submission) return <BrushOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />;
    const status = exercise.latest_submission.status;
    if (status === 'approved') return <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />;
    if (status === 'redo') return <ReplayOutlinedIcon sx={{ fontSize: 18, color: 'warning.main' }} />;
    if (status === 'pending') return <PendingOutlinedIcon sx={{ fontSize: 18, color: 'info.main' }} />;
    return <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />;
  };

  const getStatusChip = (exercise: DrawingExercise) => {
    if (!exercise.is_unlocked) return <Chip label="Locked" size="small" disabled />;
    if (!exercise.latest_submission) return <Chip label="Not Started" size="small" variant="outlined" />;
    const status = exercise.latest_submission.status;
    const map: Record<string, { label: string; color: any }> = {
      approved: { label: 'Approved', color: 'success' },
      redo: { label: 'Redo', color: 'warning' },
      pending: { label: 'Pending Review', color: 'info' },
      graded: { label: `Grade: ${exercise.latest_submission.grade || '-'}`, color: 'success' },
    };
    const config = map[status] || map.pending;
    return <Chip label={config.label} size="small" color={config.color} />;
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={32} sx={{ mb: 1 }} />
        <Skeleton variant="rectangular" height={60} sx={{ borderRadius: 1, mb: 2 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (levels.length === 0) {
    return (
      <Box>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
          Drawing Exercises
        </Typography>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <BrushOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No drawing exercises have been added yet.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          Drawing Exercises
        </Typography>
        {progress && progress.total > 0 && (
          <Chip label={`${progress.approved}/${progress.total}`} size="small" color="primary" variant="outlined" />
        )}
      </Box>

      {progress && progress.total > 0 && (
        <Paper sx={{ p: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Overall Progress</Typography>
            <Typography variant="caption" fontWeight={600}>{progress.percentage}%</Typography>
          </Box>
          <LinearProgress variant="determinate" value={progress.percentage} sx={{ height: 6, borderRadius: 3 }} />
        </Paper>
      )}

      {levels.map((level) => (
        <Box key={level.id} sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1, px: 0.5 }}>
            {level.title}
          </Typography>
          {level.description && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, px: 0.5, display: 'block' }}>
              {level.description}
            </Typography>
          )}

          {level.categories.map((category) => (
            <Accordion
              key={category.id}
              defaultExpanded={category.is_unlocked}
              disabled={!category.is_unlocked}
              sx={{
                mb: 1,
                '&:before': { display: 'none' },
                borderRadius: '8px !important',
                overflow: 'hidden',
                boxShadow: 'none',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <AccordionSummary
                expandIcon={category.is_unlocked ? <ExpandMoreIcon /> : <LockOutlinedIcon sx={{ fontSize: 18 }} />}
                sx={{ minHeight: 48, '& .MuiAccordionSummary-content': { my: 1 } }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
                    {category.title}
                  </Typography>
                  {category.is_unlocked && (
                    <Typography variant="caption" color="text.secondary">
                      {category.exercises.filter((e) => e.latest_submission?.status === 'approved').length}
                      /{category.exercises.length}
                    </Typography>
                  )}
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 0 }}>
                {category.exercises.map((exercise, idx) => (
                  <Box
                    key={exercise.id}
                    onClick={() => exercise.is_unlocked ? setSelectedExercise(exercise) : undefined}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1.5,
                      cursor: exercise.is_unlocked ? 'pointer' : 'default',
                      opacity: exercise.is_unlocked ? 1 : 0.5,
                      borderTop: idx > 0 ? '1px solid' : 'none',
                      borderColor: 'divider',
                      '&:hover': exercise.is_unlocked ? { bgcolor: 'action.hover' } : {},
                      '&:active': exercise.is_unlocked ? { bgcolor: 'action.selected' } : {},
                    }}
                  >
                    {getStatusIcon(exercise)}
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                      {exercise.title}
                    </Typography>
                    {getStatusChip(exercise)}
                  </Box>
                ))}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      ))}

      {/* Exercise detail bottom sheet */}
      {selectedExercise && (
        <ExerciseDetail
          exercise={selectedExercise}
          getToken={getToken}
          onClose={() => setSelectedExercise(null)}
          onSubmitted={() => {
            setSelectedExercise(null);
            fetchData();
          }}
        />
      )}
    </Box>
  );
}

function ExerciseDetail({
  exercise,
  getToken,
  onClose,
  onSubmitted,
}: {
  exercise: DrawingExercise;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const canSubmit = !exercise.latest_submission ||
    exercise.latest_submission.status === 'redo' ||
    exercise.latest_submission.status === 'graded';

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box onClick={onClose} sx={{ flex: 1, bgcolor: 'rgba(0,0,0,0.5)', minHeight: 60 }} />

      <Paper
        elevation={8}
        sx={{
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '85vh',
          overflow: 'auto',
          p: { xs: 2, sm: 3 },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
          {exercise.title}
        </Typography>

        {exercise.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {exercise.description}
          </Typography>
        )}

        {exercise.instructions && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Instructions
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
              {exercise.instructions}
            </Typography>
          </Box>
        )}

        {exercise.dos_and_donts && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase' }}>
              Do&apos;s &amp; Don&apos;ts
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
              {exercise.dos_and_donts}
            </Typography>
          </Box>
        )}

        {exercise.reference_images.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'block' }}>
              Reference
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
              {exercise.reference_images.map((img, i) => (
                <Box
                  key={i}
                  component="img"
                  src={img.url}
                  alt={img.caption || `Reference ${i + 1}`}
                  sx={{
                    width: 120,
                    height: 120,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    flexShrink: 0,
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Latest submission status */}
        {exercise.latest_submission && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                Attempt #{exercise.latest_submission.attempt_number}
              </Typography>
              <Chip
                label={exercise.latest_submission.status}
                size="small"
                color={
                  exercise.latest_submission.status === 'approved' ? 'success'
                    : exercise.latest_submission.status === 'redo' ? 'warning'
                      : exercise.latest_submission.status === 'pending' ? 'info'
                        : 'default'
                }
                sx={{ textTransform: 'capitalize' }}
              />
            </Box>
            {exercise.latest_submission.teacher_notes && (
              <Typography variant="body2" color="text.secondary">
                {exercise.latest_submission.teacher_notes}
              </Typography>
            )}
            {exercise.latest_submission.grade && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                Grade: <strong>{exercise.latest_submission.grade}</strong>
              </Typography>
            )}
            {exercise.latest_submission.correction_url && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Teacher Correction:</Typography>
                <Box
                  component="img"
                  src={exercise.latest_submission.correction_url}
                  alt="Teacher correction"
                  sx={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 1, mt: 0.5 }}
                />
              </Box>
            )}
          </Paper>
        )}

        {/* Upload or close */}
        {canSubmit ? (
          <Box sx={{ mb: 1 }}>
            <SubmissionUpload
              exerciseId={exercise.id}
              getToken={getToken}
              onSubmitted={onSubmitted}
              label={exercise.latest_submission ? 'Resubmit Drawing' : 'Submit Drawing'}
            />
          </Box>
        ) : (
          exercise.latest_submission?.status === 'pending' && (
            <Typography variant="body2" color="info.main" sx={{ textAlign: 'center', mb: 1 }}>
              Your submission is being reviewed by the teacher.
            </Typography>
          )
        )}

        <Button
          variant="outlined"
          fullWidth
          onClick={onClose}
          sx={{ textTransform: 'none', minHeight: 48 }}
        >
          Close
        </Button>
      </Paper>
    </Box>
  );
}
