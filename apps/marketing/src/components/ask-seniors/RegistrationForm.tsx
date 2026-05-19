'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  Box,
  Typography,
  TextField,
  Button,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  InputAdornment,
  CheckCircleIcon,
} from '@neram/ui';

interface AskSeniorsEvent {
  id: string;
  year: number;
  title: string;
  event_date: string | null;
  event_time: string | null;
  event_link: string | null;
  status: 'upcoming' | 'active' | 'completed';
  description: string | null;
  created_at: string;
}

interface AskSeniorsCollege {
  id: string;
  slug: string;
  state_slug: string;
  name: string;
  short_name: string;
  city: string;
  logo_url: string | null;
}

interface FormData {
  nata_attempts: 1 | 2;
  nata_score_1: string;
  nata_score_2: string;
  board_score: string;
  college_preferences: string[];
  name: string;
  phone: string;
  email: string;
  city: string;
  state: string;
}

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Puducherry',
];

interface RegistrationFormProps {
  event: AskSeniorsEvent;
  colleges: AskSeniorsCollege[];
}

export default function RegistrationForm({ event: _event, colleges }: RegistrationFormProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    nata_attempts: 1,
    nata_score_1: '',
    nata_score_2: '',
    board_score: '',
    college_preferences: [],
    name: '',
    phone: '',
    email: '',
    city: '',
    state: '',
  });

  const finalCutoff =
    form.nata_attempts === 2
      ? Math.max(
          parseFloat(form.nata_score_1) || 0,
          parseFloat(form.nata_score_2) || 0,
        )
      : parseFloat(form.nata_score_1) || 0;

  function toggleCollegePreference(collegeId: string) {
    setForm((prev) => {
      const existing = prev.college_preferences;
      if (existing.includes(collegeId)) {
        return { ...prev, college_preferences: existing.filter((id) => id !== collegeId) };
      }
      return { ...prev, college_preferences: [...existing, collegeId] };
    });
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/ask-seniors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Registration failed. Please try again.');
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // Success state
  if (success) {
    return (
      <Box
        id="register"
        sx={{
          maxWidth: 560,
          mx: 'auto',
          px: { xs: 2, md: 0 },
          py: 6,
          textAlign: 'center',
        }}
      >
        <CheckCircleIcon sx={{ fontSize: 72, color: '#4caf50', mb: 2 }} />
        <Typography
          variant="h5"
          sx={{ fontWeight: 800, color: '#fff', mb: 1.5 }}
        >
          You're registered!
        </Typography>
        <Typography sx={{ color: '#9ca3af', lineHeight: 1.7 }}>
          Check your email for confirmation and event details.
        </Typography>
      </Box>
    );
  }

  // Step progress bars
  const StepIndicator = () => (
    <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
      {([1, 2, 3] as const).map((s) => (
        <Box
          key={s}
          sx={{
            width: 32,
            height: 4,
            borderRadius: 2,
            bgcolor: s <= step ? '#e8a020' : 'rgba(255,255,255,0.1)',
            transition: 'background-color 0.3s',
          }}
        />
      ))}
    </Box>
  );

  return (
    <Box
      id="register"
      sx={{
        maxWidth: 560,
        mx: 'auto',
        px: { xs: 2, md: 0 },
      }}
    >
      <StepIndicator />

      {/* Step 1: NATA Scores */}
      {step === 1 && (
        <Box>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: '#fff', mb: 3 }}
          >
            Your NATA Scores
          </Typography>

          {/* Attempts toggle */}
          <Box sx={{ mb: 3 }}>
            <Typography
              sx={{ color: '#9ca3af', fontSize: 13, mb: 1 }}
            >
              How many times did you appear for NATA?
            </Typography>
            <ToggleButtonGroup
              exclusive
              value={form.nata_attempts}
              onChange={(_e, val) => {
                if (val !== null) {
                  setForm((prev) => ({ ...prev, nata_attempts: val as 1 | 2 }));
                }
              }}
              sx={{
                '& .MuiToggleButton-root': {
                  color: '#9ca3af',
                  borderColor: 'rgba(255,255,255,0.15)',
                  px: 3,
                  py: 1,
                  '&.Mui-selected': {
                    color: '#e8a020',
                    borderColor: '#e8a020',
                    bgcolor: 'rgba(232,160,32,0.12)',
                    '&:hover': {
                      bgcolor: 'rgba(232,160,32,0.18)',
                    },
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.05)',
                  },
                },
              }}
            >
              <ToggleButton value={1}>1 Attempt</ToggleButton>
              <ToggleButton value={2}>2 Attempts</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* NATA Score 1 */}
          <TextField
            fullWidth
            label="NATA Score (Attempt 1)"
            type="number"
            required
            value={form.nata_score_1}
            onChange={(e) => setForm((prev) => ({ ...prev, nata_score_1: e.target.value }))}
            inputProps={{ min: 0, max: 200, step: 0.5 }}
            sx={textFieldSx}
          />

          {/* NATA Score 2 (conditional) */}
          {form.nata_attempts === 2 && (
            <TextField
              fullWidth
              label="NATA Score (Attempt 2)"
              type="number"
              value={form.nata_score_2}
              onChange={(e) => setForm((prev) => ({ ...prev, nata_score_2: e.target.value }))}
              inputProps={{ min: 0, max: 200, step: 0.5 }}
              sx={textFieldSx}
            />
          )}

          {/* Board Score */}
          <TextField
            fullWidth
            label="Board Exam Score (%)"
            type="number"
            required
            value={form.board_score}
            onChange={(e) => setForm((prev) => ({ ...prev, board_score: e.target.value }))}
            inputProps={{ min: 0, max: 100, step: 0.01 }}
            sx={textFieldSx}
          />

          {/* Live cutoff display */}
          {finalCutoff > 0 && (
            <Box
              sx={{
                bgcolor: 'rgba(232,160,32,0.08)',
                border: '1px solid rgba(232,160,32,0.3)',
                borderRadius: 2,
                p: 2.5,
                mb: 3,
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  color: '#e8a020',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  mb: 0.5,
                }}
              >
                Your Best NATA Score
              </Typography>
              <Typography
                variant="h4"
                sx={{ fontWeight: 800, color: '#e8a020' }}
              >
                {finalCutoff % 1 === 0 ? finalCutoff.toFixed(0) : finalCutoff}
              </Typography>
            </Box>
          )}

          <Button
            fullWidth
            variant="contained"
            size="large"
            disabled={!form.nata_score_1 || !form.board_score}
            onClick={() => setStep(2)}
            sx={primaryButtonSx}
          >
            Next: College Preferences
          </Button>
        </Box>
      )}

      {/* Step 2: College Preferences */}
      {step === 2 && (
        <Box>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: '#fff', mb: 1 }}
          >
            Which colleges interest you?
          </Typography>
          <Typography
            sx={{ color: '#9ca3af', fontSize: 14, mb: 3 }}
          >
            Select all the colleges you want to know more about. You can pick multiple.
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 4 }}>
            {colleges.map((college) => {
              const selected = form.college_preferences.includes(college.id);
              return (
                <Chip
                  key={college.id}
                  label={college.short_name}
                  onClick={() => toggleCollegePreference(college.id)}
                  avatar={
                    college.logo_url ? (
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          flexShrink: 0,
                        }}
                      >
                        <Image
                          src={college.logo_url}
                          alt={college.short_name}
                          width={20}
                          height={20}
                          style={{ objectFit: 'contain' }}
                          unoptimized
                        />
                      </Box>
                    ) : undefined
                  }
                  sx={{
                    border: selected
                      ? '1px solid #e8a020'
                      : '1px solid rgba(255,255,255,0.15)',
                    bgcolor: selected
                      ? 'rgba(232,160,32,0.15)'
                      : 'transparent',
                    color: selected ? '#e8a020' : '#9ca3af',
                    cursor: 'pointer',
                    fontWeight: selected ? 600 : 400,
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: selected
                        ? 'rgba(232,160,32,0.22)'
                        : 'rgba(255,255,255,0.05)',
                      borderColor: selected ? '#e8a020' : 'rgba(255,255,255,0.3)',
                    },
                    '& .MuiChip-avatar': {
                      ml: 0.5,
                      mr: -0.5,
                    },
                  }}
                />
              );
            })}
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              size="large"
              onClick={() => setStep(1)}
              sx={secondaryButtonSx}
            >
              Back
            </Button>
            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={form.college_preferences.length === 0}
              onClick={() => setStep(3)}
              sx={primaryButtonSx}
            >
              Next: Your Details
            </Button>
          </Box>
        </Box>
      )}

      {/* Step 3: Personal Details */}
      {step === 3 && (
        <Box>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: '#fff', mb: 3 }}
          >
            Your Details
          </Typography>

          <TextField
            fullWidth
            label="Full Name"
            required
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            sx={textFieldSx}
          />

          <TextField
            fullWidth
            label="Phone Number"
            required
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            inputProps={{ maxLength: 10 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Typography sx={{ color: '#9ca3af', fontSize: 14 }}>+91</Typography>
                </InputAdornment>
              ),
            }}
            sx={textFieldSx}
          />

          <TextField
            fullWidth
            label="Email Address"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            sx={textFieldSx}
          />

          <TextField
            fullWidth
            label="City (optional)"
            value={form.city}
            onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
            sx={textFieldSx}
          />

          <TextField
            fullWidth
            label="State (optional)"
            select
            value={form.state}
            onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
            sx={textFieldSx}
            SelectProps={{
              MenuProps: {
                PaperProps: {
                  sx: {
                    bgcolor: '#1a1a2e',
                    border: '1px solid rgba(255,255,255,0.15)',
                    '& .MuiMenuItem-root': {
                      color: '#e5e7eb',
                      '&:hover': { bgcolor: 'rgba(232,160,32,0.1)' },
                      '&.Mui-selected': {
                        bgcolor: 'rgba(232,160,32,0.15)',
                        color: '#e8a020',
                      },
                    },
                  },
                },
              },
            }}
          >
            <option value="" disabled style={{ display: 'none' }} />
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state} style={{ background: '#1a1a2e', color: '#e5e7eb' }}>
                {state}
              </option>
            ))}
          </TextField>

          {error && (
            <Typography
              sx={{
                color: '#f87171',
                fontSize: 13,
                mb: 2,
                p: 1.5,
                bgcolor: 'rgba(248,113,113,0.08)',
                borderRadius: 1,
                border: '1px solid rgba(248,113,113,0.2)',
              }}
            >
              {error}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              size="large"
              onClick={() => setStep(2)}
              disabled={submitting}
              sx={secondaryButtonSx}
            >
              Back
            </Button>
            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={submitting || !form.name || !form.phone || !form.email}
              onClick={handleSubmit}
              sx={primaryButtonSx}
              startIcon={
                submitting ? <CircularProgress size={20} sx={{ color: '#000' }} /> : undefined
              }
            >
              {submitting ? 'Registering...' : 'Register Free'}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

// Shared style helpers
const textFieldSx = {
  mb: 2.5,
  '& .MuiOutlinedInput-root': {
    color: '#e5e7eb',
    minHeight: 48,
    '& fieldset': {
      borderColor: 'rgba(255,255,255,0.15)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(232,160,32,0.5)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#e8a020',
    },
  },
  '& .MuiInputLabel-root': {
    color: '#9ca3af',
    '&.Mui-focused': {
      color: '#e8a020',
    },
  },
  '& .MuiInputBase-input': {
    color: '#e5e7eb',
  },
  '& .MuiSelect-icon': {
    color: '#9ca3af',
  },
} as const;

const primaryButtonSx = {
  background: 'linear-gradient(135deg, #f59e0b 0%, #e8a020 100%)',
  color: '#000',
  fontWeight: 700,
  fontSize: '1rem',
  py: 1.5,
  borderRadius: 2,
  textTransform: 'none',
  minHeight: 48,
  '&:hover': {
    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
  },
  '&.Mui-disabled': {
    background: 'rgba(232,160,32,0.25)',
    color: 'rgba(0,0,0,0.4)',
  },
} as const;

const secondaryButtonSx = {
  color: '#9ca3af',
  borderColor: 'rgba(255,255,255,0.2)',
  fontWeight: 600,
  py: 1.5,
  borderRadius: 2,
  textTransform: 'none',
  minHeight: 48,
  flexShrink: 0,
  '&:hover': {
    borderColor: 'rgba(255,255,255,0.4)',
    bgcolor: 'rgba(255,255,255,0.05)',
  },
} as const;
