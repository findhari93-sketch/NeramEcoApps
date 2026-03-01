'use client';

import { useState } from 'react';
import {
  Box, Typography, Stack, Button, Card, CardContent,
  TextField, MenuItem, CircularProgress, Alert,
} from '@neram/ui';
import type { NataExamStatus } from '@neram/database';

const CURRENT_YEAR = new Date().getFullYear();
const EXAM_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i - 1);

interface ExamProfileOnboardingProps {
  getAuthToken: () => Promise<string | null>;
  onComplete: () => void;
  onBlocked: () => void; // "not interested" → redirect away
}

type Step = 'status' | 'attempted_details' | 'waiting_details' | 'planning_details' | 'motivation';

interface AttemptEntry {
  examYear: number;
  sessionLabel: string;
}

export default function ExamProfileOnboarding({
  getAuthToken,
  onComplete,
  onBlocked,
}: ExamProfileOnboardingProps) {
  const [step, setStep] = useState<Step>('status');
  const [nataStatus, setNataStatus] = useState<NataExamStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Attempted details
  const [attempts, setAttempts] = useState<AttemptEntry[]>([
    { examYear: CURRENT_YEAR, sessionLabel: '' },
  ]);

  // Waiting details
  const [nextExamDate, setNextExamDate] = useState('');

  // Planning details
  const [planningYear, setPlanningYear] = useState(CURRENT_YEAR);

  const handleStatusSelect = (status: NataExamStatus) => {
    setNataStatus(status);
    if (status === 'not_interested') {
      // Show block message then redirect
      setStep('status');
      submitProfile(status);
      return;
    }
    if (status === 'attempted') setStep('attempted_details');
    else if (status === 'applied_waiting') setStep('waiting_details');
    else if (status === 'planning_to_apply') setStep('planning_details');
  };

  const addAttempt = () => {
    setAttempts([...attempts, { examYear: CURRENT_YEAR, sessionLabel: '' }]);
  };

  const removeAttempt = (i: number) => {
    if (attempts.length > 1) {
      setAttempts(attempts.filter((_, idx) => idx !== i));
    }
  };

  const updateAttempt = (i: number, field: keyof AttemptEntry, value: string | number) => {
    const updated = [...attempts];
    (updated[i] as unknown as Record<string, unknown>)[field] = value;
    setAttempts(updated);
  };

  const submitProfile = async (statusOverride?: NataExamStatus) => {
    const status = statusOverride || nataStatus;
    if (!status) return;

    setError('');
    setSubmitting(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Please sign in first');
        return;
      }

      const body: Record<string, unknown> = {
        nataStatus: status,
      };

      if (status === 'attempted') {
        body.attemptCount = attempts.length;
        body.attempts = attempts.map((a) => ({
          exam_year: a.examYear,
          session_label: a.sessionLabel || undefined,
        }));
      } else if (status === 'applied_waiting') {
        body.nextExamDate = nextExamDate || undefined;
      } else if (status === 'planning_to_apply') {
        body.planningYear = planningYear;
      }

      const res = await fetch('/api/questions/exam-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        return;
      }

      // Cache in localStorage
      localStorage.setItem('qb_onboarding_done', 'true');
      localStorage.setItem('qb_nata_status', status);

      if (status === 'not_interested') {
        onBlocked();
      } else {
        setStep('motivation');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 1: Status selection
  if (step === 'status') {
    return (
      <Box sx={{ maxWidth: 500, mx: 'auto', py: 4, px: 2 }}>
        <Typography variant="h5" fontWeight={700} textAlign="center" sx={{ mb: 1 }}>
          Welcome to the Question Bank
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 4 }}>
          Before you start, tell us about your NATA journey so we can personalize your experience.
        </Typography>

        <Stack spacing={1.5}>
          <StatusOption
            label="I have attempted NATA"
            description="You've taken at least one NATA exam"
            onClick={() => handleStatusSelect('attempted')}
          />
          <StatusOption
            label="Applied & waiting for exam"
            description="You've registered and are waiting for your exam date"
            onClick={() => handleStatusSelect('applied_waiting')}
          />
          <StatusOption
            label="Planning to apply"
            description="You haven't applied yet but plan to"
            onClick={() => handleStatusSelect('planning_to_apply')}
          />
          <StatusOption
            label="None of these"
            description="I'm not planning to take NATA"
            onClick={() => handleStatusSelect('not_interested')}
            muted
          />
        </Stack>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </Box>
    );
  }

  // Step 2a: Attempted details
  if (step === 'attempted_details') {
    return (
      <Box sx={{ maxWidth: 500, mx: 'auto', py: 4, px: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Your NATA Attempts
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Tell us about your previous attempts. This helps us connect you with relevant questions.
        </Typography>

        <Stack spacing={2}>
          {attempts.map((attempt, i) => (
            <Card key={i} variant="outlined">
              <CardContent sx={{ pb: '12px !important' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    Attempt {i + 1}
                  </Typography>
                  {attempts.length > 1 && (
                    <Button size="small" color="error" onClick={() => removeAttempt(i)}>
                      Remove
                    </Button>
                  )}
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <TextField
                    select
                    label="Year"
                    size="small"
                    value={attempt.examYear}
                    onChange={(e) => updateAttempt(i, 'examYear', Number(e.target.value))}
                    sx={{ minWidth: 100 }}
                  >
                    {EXAM_YEARS.map((y) => (
                      <MenuItem key={y} value={y}>{y}</MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Session (optional)"
                    placeholder="e.g., Session 1"
                    size="small"
                    value={attempt.sessionLabel}
                    onChange={(e) => updateAttempt(i, 'sessionLabel', e.target.value)}
                    fullWidth
                  />
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        <Button size="small" onClick={addAttempt} sx={{ mt: 1 }}>
          + Add another attempt
        </Button>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={() => setStep('status')}>Back</Button>
          <Button
            variant="contained"
            onClick={() => submitProfile()}
            disabled={submitting}
            sx={{ minWidth: 120, minHeight: 44 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Continue'}
          </Button>
        </Stack>
      </Box>
    );
  }

  // Step 2b: Waiting details
  if (step === 'waiting_details') {
    return (
      <Box sx={{ maxWidth: 500, mx: 'auto', py: 4, px: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          When is your exam?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Let us know your next exam date so we can show you relevant questions.
        </Typography>

        <TextField
          label="Next Exam Date (optional)"
          type="date"
          value={nextExamDate}
          onChange={(e) => setNextExamDate(e.target.value)}
          fullWidth
          InputLabelProps={{ shrink: true }}
          sx={{ mb: 2 }}
        />

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={() => setStep('status')}>Back</Button>
          <Button
            variant="contained"
            onClick={() => submitProfile()}
            disabled={submitting}
            sx={{ minWidth: 120, minHeight: 44 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Continue'}
          </Button>
        </Stack>
      </Box>
    );
  }

  // Step 2c: Planning details
  if (step === 'planning_details') {
    return (
      <Box sx={{ maxWidth: 500, mx: 'auto', py: 4, px: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
          Which year are you planning for?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          This helps us tailor the Question Bank for your preparation timeline.
        </Typography>

        <TextField
          select
          label="Planning Year"
          value={planningYear}
          onChange={(e) => setPlanningYear(Number(e.target.value))}
          fullWidth
          sx={{ mb: 2 }}
        >
          {EXAM_YEARS.filter((y) => y >= CURRENT_YEAR).map((y) => (
            <MenuItem key={y} value={y}>{y}</MenuItem>
          ))}
        </TextField>

        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button variant="outlined" onClick={() => setStep('status')}>Back</Button>
          <Button
            variant="contained"
            onClick={() => submitProfile()}
            disabled={submitting}
            sx={{ minWidth: 120, minHeight: 44 }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : 'Continue'}
          </Button>
        </Stack>
      </Box>
    );
  }

  // Step 3: Motivation
  if (step === 'motivation') {
    return (
      <Box sx={{ maxWidth: 500, mx: 'auto', py: 4, px: 2, textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={700} sx={{ mb: 2 }}>
          You&apos;re all set!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1, lineHeight: 1.7 }}>
          Since NATA questions are never officially released, this forum depends on students like you sharing what they remember.
        </Typography>
        <Typography variant="body1" fontWeight={600} sx={{ mb: 4, lineHeight: 1.7 }}>
          Only a few contribute, but it makes a huge difference for everyone. Share what you remember!
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={onComplete}
          sx={{ minWidth: 200, minHeight: 48 }}
        >
          Enter Question Bank
        </Button>
      </Box>
    );
  }

  return null;
}

// Helper component for status options
function StatusOption({
  label,
  description,
  onClick,
  muted,
}: {
  label: string;
  description: string;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        border: '1px solid',
        borderColor: 'divider',
        '&:hover': {
          boxShadow: 2,
          borderColor: muted ? 'divider' : 'primary.main',
        },
        opacity: muted ? 0.7 : 1,
      }}
    >
      <CardContent sx={{ py: '12px !important' }}>
        <Typography variant="body1" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}
