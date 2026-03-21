'use client';

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Select,
  MenuItem,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ScorecardEntrySheet from './ScorecardEntrySheet';

interface ExamAttempt {
  id: string;
  exam_type: 'nata' | 'jee';
  phase: string;
  attempt_number: number;
  exam_date_id: string | null;
  state: 'planning' | 'applied' | 'completed' | 'scorecard_uploaded';
  application_date: string | null;
  exam_completed_at: string | null;
  aptitude_score: number | null;
  drawing_score: number | null;
  total_score: number | null;
}

interface ExamDate {
  id: string;
  exam_type: 'nata' | 'jee';
  year: number;
  phase: string;
  attempt_number: number;
  exam_date: string;
  label: string | null;
  registration_deadline: string | null;
}

interface AttemptCardProps {
  classroomId: string;
  getToken: () => Promise<string | null>;
  examType: 'nata' | 'jee';
  phase: string;
  attemptNumber: number;
  attempt: ExamAttempt | null;
  examDates: ExamDate[];
  onRefresh: () => void;
}

const STEPS = ['Planning', 'Applied', 'Completed', 'Scorecard'];
const STATE_TO_STEP: Record<string, number> = {
  planning: 0,
  applied: 1,
  completed: 2,
  scorecard_uploaded: 3,
};

export default function AttemptCard({
  classroomId,
  getToken,
  examType,
  phase,
  attemptNumber,
  attempt,
  examDates,
  onRefresh,
}: AttemptCardProps) {
  const theme = useTheme();
  const [activating, setActivating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedDateId, setSelectedDateId] = useState(attempt?.exam_date_id || '');
  const [scorecardOpen, setScorecardOpen] = useState(false);

  const handleActivate = useCallback(async () => {
    setActivating(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/documents/exam-attempts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: classroomId,
          exam_type: examType,
          phase,
          attempt_number: attemptNumber,
        }),
      });

      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to activate attempt:', err);
    } finally {
      setActivating(false);
    }
  }, [getToken, classroomId, examType, phase, attemptNumber, onRefresh]);

  const handleUpdateState = useCallback(async (newState: string, extraData?: Record<string, unknown>) => {
    if (!attempt) return;
    setUpdating(true);
    try {
      const token = await getToken();
      if (!token) return;

      const body: Record<string, unknown> = { state: newState, ...extraData };
      if (selectedDateId && newState === 'applied') {
        body.exam_date_id = selectedDateId;
      }

      const res = await fetch(`/api/documents/exam-attempts/${attempt.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to update attempt:', err);
    } finally {
      setUpdating(false);
    }
  }, [attempt, getToken, selectedDateId, onRefresh]);

  const handleSelectDate = useCallback(async (dateId: string) => {
    setSelectedDateId(dateId);
    if (!attempt) return;
    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/documents/exam-attempts/${attempt.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exam_date_id: dateId }),
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to update date:', err);
    }
  }, [attempt, getToken, onRefresh]);

  // Not activated state
  if (!attempt) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          borderStyle: 'dashed',
          borderColor: theme.palette.divider,
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Attempt {attemptNumber}
        </Typography>
        <Button
          variant="outlined"
          startIcon={activating ? <CircularProgress size={16} /> : <AddCircleOutlineIcon />}
          onClick={handleActivate}
          disabled={activating}
          sx={{ textTransform: 'none', minHeight: 48, minWidth: 140 }}
        >
          Activate
        </Button>
      </Paper>
    );
  }

  const activeStep = STATE_TO_STEP[attempt.state] ?? 0;
  const selectedDate = examDates.find((d) => d.id === (selectedDateId || attempt.exam_date_id));

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="body2" fontWeight={700}>
          Attempt {attemptNumber}
        </Typography>
        {attempt.state === 'scorecard_uploaded' && (
          <Chip
            icon={<EmojiEventsOutlinedIcon sx={{ fontSize: '1rem !important' }} />}
            label="Scorecard Uploaded"
            size="small"
            color="success"
            sx={{ height: 24, fontSize: '0.7rem' }}
          />
        )}
        {attempt.state === 'completed' && (
          <Chip
            icon={<CheckCircleOutlineIcon sx={{ fontSize: '1rem !important' }} />}
            label="Completed"
            size="small"
            color="info"
            sx={{ height: 24, fontSize: '0.7rem' }}
          />
        )}
      </Box>

      {/* Stepper */}
      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          mb: 2,
          '& .MuiStepLabel-label': { fontSize: '0.65rem', mt: 0.5 },
          '& .MuiStepIcon-root': { fontSize: '1.2rem' },
        }}
      >
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Planning state */}
      {attempt.state === 'planning' && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Select your planned exam date:
          </Typography>
          <Select
            value={selectedDateId || attempt.exam_date_id || ''}
            onChange={(e) => handleSelectDate(e.target.value as string)}
            fullWidth
            size="small"
            displayEmpty
            sx={{ mb: 1.5, minHeight: 48, '& .MuiSelect-select': { py: 1.5 } }}
          >
            <MenuItem value="" disabled>Choose a date</MenuItem>
            {examDates.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {new Date(d.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {d.label ? ` - ${d.label}` : ''}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="contained"
            fullWidth
            onClick={() => handleUpdateState('applied')}
            disabled={updating || !(selectedDateId || attempt.exam_date_id)}
            sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
          >
            {updating ? <CircularProgress size={20} /> : 'Mark as Applied'}
          </Button>
        </Box>
      )}

      {/* Applied state */}
      {attempt.state === 'applied' && (
        <Box>
          {selectedDate && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
              <CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                Exam Date:{' '}
                <Typography component="span" variant="body2" fontWeight={600}>
                  {new Date(selectedDate.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Typography>
              </Typography>
            </Box>
          )}
          <Button
            variant="contained"
            fullWidth
            onClick={() => handleUpdateState('completed', { exam_completed_at: new Date().toISOString() })}
            disabled={updating}
            sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
          >
            {updating ? <CircularProgress size={20} /> : 'Mark as Completed'}
          </Button>
        </Box>
      )}

      {/* Completed state */}
      {attempt.state === 'completed' && (
        <Box>
          {selectedDate && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
              <CalendarTodayOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                Completed on:{' '}
                <Typography component="span" variant="body2" fontWeight={600}>
                  {attempt.exam_completed_at
                    ? new Date(attempt.exam_completed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : new Date(selectedDate.exam_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Typography>
              </Typography>
            </Box>
          )}
          <Button
            variant="contained"
            fullWidth
            color="success"
            onClick={() => setScorecardOpen(true)}
            sx={{ textTransform: 'none', minHeight: 48, fontWeight: 600 }}
          >
            Enter Scorecard
          </Button>
        </Box>
      )}

      {/* Scorecard uploaded state */}
      {attempt.state === 'scorecard_uploaded' && (
        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.success.main, 0.06),
            border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, textAlign: 'center' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Aptitude</Typography>
              <Typography variant="body2" fontWeight={700}>{attempt.aptitude_score ?? '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Drawing</Typography>
              <Typography variant="body2" fontWeight={700}>{attempt.drawing_score ?? '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">Total</Typography>
              <Typography variant="body2" fontWeight={700} color="primary">{attempt.total_score ?? '-'}</Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* Scorecard entry sheet */}
      <ScorecardEntrySheet
        open={scorecardOpen}
        onClose={() => setScorecardOpen(false)}
        attemptId={attempt.id}
        examType={examType}
        classroomId={classroomId}
        getToken={getToken}
        onSubmitted={onRefresh}
      />
    </Paper>
  );
}
