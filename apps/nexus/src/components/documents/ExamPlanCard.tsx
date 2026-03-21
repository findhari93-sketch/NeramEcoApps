'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Button,
  alpha,
  useTheme,
} from '@neram/ui';

interface ExamPlanCardProps {
  examType: 'nata' | 'jee';
  state: string;
  applicationNumber: string | null;
  onStateChange: (state: string, applicationNumber?: string) => void;
  loading?: boolean;
}

const STATES = ['still_thinking', 'planning_to_write', 'applied', 'completed'];
const STATE_LABELS: Record<string, string> = {
  still_thinking: 'Thinking',
  planning_to_write: 'Planning',
  applied: 'Applied',
  completed: 'Completed',
};

export default function ExamPlanCard({ examType, state, applicationNumber, onStateChange, loading }: ExamPlanCardProps) {
  const theme = useTheme();
  const activeStep = STATES.indexOf(state);
  const [appNumber, setAppNumber] = useState(applicationNumber || '');
  const [showAppInput, setShowAppInput] = useState(false);

  const handleStepClick = (step: number) => {
    if (loading) return;
    const newState = STATES[step];
    if (newState === 'applied' && !appNumber) {
      setShowAppInput(true);
      return;
    }
    onStateChange(newState, newState === 'applied' ? appNumber : undefined);
  };

  const handleApplied = () => {
    onStateChange('applied', appNumber);
    setShowAppInput(false);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderColor: alpha(examType === 'nata' ? theme.palette.primary.main : theme.palette.secondary.main, 0.3),
      }}
    >
      <Typography variant="body2" fontWeight={700} sx={{ mb: 1.5 }}>
        {examType.toUpperCase()} Exam Plan
      </Typography>

      <Stepper
        activeStep={activeStep}
        alternativeLabel
        sx={{
          '& .MuiStepLabel-label': { fontSize: '0.7rem', mt: 0.5 },
          '& .MuiStepIcon-root': { fontSize: '1.2rem', cursor: 'pointer' },
        }}
      >
        {STATES.map((s, i) => (
          <Step key={s} completed={i < activeStep} onClick={() => handleStepClick(i)}>
            <StepLabel sx={{ cursor: 'pointer' }}>{STATE_LABELS[s]}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {applicationNumber && state === 'applied' && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
          Application: {applicationNumber}
        </Typography>
      )}

      {showAppInput && (
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            label="Application Number"
            value={appNumber}
            onChange={(e) => setAppNumber(e.target.value)}
            size="small"
            fullWidth
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleApplied}
            disabled={!appNumber.trim()}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            Save
          </Button>
        </Box>
      )}
    </Paper>
  );
}
