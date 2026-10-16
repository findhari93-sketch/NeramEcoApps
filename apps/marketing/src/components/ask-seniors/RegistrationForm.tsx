'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Box, Typography, TextField, CircularProgress, InputAdornment } from '@neram/ui';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import { useFirebaseAuth } from '@neram/auth';
import { CtaButton, EmptyState, Pill, tokens as t } from '@/design-system';

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

export default function RegistrationForm({ event, colleges }: RegistrationFormProps) {
  const { user } = useFirebaseAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);
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

  // Pre-fill contact details from Firebase auth when user is logged in
  useEffect(() => {
    if (!user) return;
    setForm((prev) => {
      const name = prev.name || user.name || '';
      const email = prev.email || user.email || '';
      // Strip +91 prefix from stored phone number if present
      const rawPhone = user.phone || '';
      const phone = prev.phone || rawPhone.replace(/^\+91/, '');
      const didFill = Boolean(name || email || phone);
      if (didFill) setAutoFilled(true);
      return { ...prev, name, email, phone };
    });
  }, [user]);

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
        body: JSON.stringify({ ...form, event_id: event.id }),
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
      <Box id="register" role="status" sx={{ maxWidth: 560, mx: 'auto', width: '100%' }}>
        <EmptyState
          icon={<CheckCircleOutlineOutlinedIcon />}
          title="You're registered!"
          body="Check your email for confirmation and event details."
        />
      </Box>
    );
  }

  const stepTitles = ['Your NATA Scores', 'Which colleges interest you?', 'Your Details'];

  return (
    <Box
      id="register"
      sx={{
        maxWidth: 560,
        mx: 'auto',
        width: '100%',
        boxSizing: 'border-box',
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        p: { xs: 2.5, sm: 4 },
        scrollMarginTop: 80,
      }}
    >
      {/* Step progress */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 0.75 }} aria-hidden>
          {([1, 2, 3] as const).map((s) => (
            <Box
              key={s}
              sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: s <= step ? t.gold500 : t.line, transition: 'background-color 200ms ease' }}
            />
          ))}
        </Box>
        <Typography component="p" sx={{ m: 0, fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: t.inkMuted }}>
          STEP {step} OF 3
        </Typography>
      </Box>

      <Typography component="h3" sx={{ m: 0, mb: step === 2 ? 1 : 3, fontSize: '1.25rem', fontWeight: 700, color: t.ink }}>
        {stepTitles[step - 1]}
      </Typography>

      {/* Step 1: NATA Scores */}
      {step === 1 && (
        <Box>
          {/* Attempts */}
          <Box sx={{ mb: 3 }}>
            <Typography id="nata-attempts-label" component="p" sx={{ m: 0, mb: 1, fontSize: '0.9375rem', color: t.inkMuted }}>
              How many times did you appear for NATA?
            </Typography>
            <Box role="radiogroup" aria-labelledby="nata-attempts-label" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {([1, 2] as const).map((n) => (
                <Pill
                  key={n}
                  role="radio"
                  selected={form.nata_attempts === n}
                  onClick={() => setForm((prev) => ({ ...prev, nata_attempts: n }))}
                >
                  {n === 1 ? '1 Attempt' : '2 Attempts'}
                </Pill>
              ))}
            </Box>
          </Box>

          {/* NATA Score 1 */}
          <TextField
            fullWidth
            label="NATA Score (Attempt 1)"
            type="number"
            required
            value={form.nata_score_1}
            onChange={(e) => setForm((prev) => ({ ...prev, nata_score_1: e.target.value }))}
            inputProps={{ min: 0, max: 200, step: 0.5, inputMode: 'decimal' }}
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
              inputProps={{ min: 0, max: 200, step: 0.5, inputMode: 'decimal' }}
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
            inputProps={{ min: 0, max: 100, step: 0.01, inputMode: 'decimal' }}
            sx={textFieldSx}
          />

          {/* Live cutoff display */}
          {finalCutoff > 0 && (
            <Box
              aria-live="polite"
              sx={{
                bgcolor: t.navy900,
                borderRadius: `${t.radius}px`,
                p: 2.5,
                mb: 3,
                textAlign: 'center',
              }}
            >
              <Typography
                component="p"
                sx={{ m: 0, mb: 0.5, fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.paperSubtle }}
              >
                Your Best NATA Score
              </Typography>
              <Typography component="p" sx={{ m: 0, fontFamily: t.fontMono, fontSize: '2rem', fontWeight: 700, color: t.gold500 }}>
                {finalCutoff % 1 === 0 ? finalCutoff.toFixed(0) : finalCutoff}
              </Typography>
            </Box>
          )}

          <CtaButton fullWidth disabled={!form.nata_score_1 || !form.board_score} onClick={() => setStep(2)}>
            Next: College Preferences
          </CtaButton>
        </Box>
      )}

      {/* Step 2: College Preferences */}
      {step === 2 && (
        <Box>
          <Typography component="p" sx={{ m: 0, mb: 3, fontSize: '0.9375rem', color: t.inkMuted }}>
            Select all the colleges you want to know more about. You can pick multiple.
          </Typography>

          <Box role="group" aria-label="College preferences" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 4 }}>
            {colleges.map((college) => {
              const selected = form.college_preferences.includes(college.id);
              return (
                <Pill key={college.id} selected={selected} onClick={() => toggleCollegePreference(college.id)}>
                  {college.logo_url && (
                    <Box
                      component="span"
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: t.surface,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        flexShrink: 0,
                        ml: -0.75,
                      }}
                    >
                      <Image src={college.logo_url} alt="" width={20} height={20} style={{ objectFit: 'contain' }} unoptimized />
                    </Box>
                  )}
                  {college.short_name}
                </Pill>
              );
            })}
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <CtaButton variant="outline" endIcon={null} onClick={() => setStep(1)}>
              Back
            </CtaButton>
            <CtaButton fullWidth disabled={form.college_preferences.length === 0} onClick={() => setStep(3)}>
              Next: Your Details
            </CtaButton>
          </Box>
        </Box>
      )}

      {/* Step 3: Personal Details */}
      {step === 3 && (
        <Box>
          {autoFilled && (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                mt: -1.5,
                mb: 2.5,
                fontSize: '0.875rem',
                fontWeight: 600,
                color: t.success,
              }}
            >
              <CheckCircleOutlineOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
              Auto-filled
            </Box>
          )}

          <TextField
            fullWidth
            label="Full Name"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            sx={textFieldSx}
          />

          <TextField
            fullWidth
            label="Phone Number"
            required
            type="tel"
            autoComplete="tel-national"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            inputProps={{ maxLength: 10, inputMode: 'numeric' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Typography component="span" sx={{ color: t.inkMuted, fontSize: '1rem' }}>+91</Typography>
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
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            sx={textFieldSx}
          />

          <TextField
            fullWidth
            label="City (optional)"
            autoComplete="address-level2"
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
            SelectProps={{ native: true }}
            InputLabelProps={{ shrink: true }}
          >
            <option value="">Select a state</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </TextField>

          {error && (
            <Box
              role="alert"
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1,
                mb: 2.5,
                p: 1.5,
                bgcolor: t.surface,
                border: `1px solid ${t.line}`,
                borderRadius: `${t.radius}px`,
                boxShadow: `inset 3px 0 0 ${t.gold500}`,
                fontSize: '0.9375rem',
                color: t.ink,
              }}
            >
              <ErrorOutlineOutlinedIcon aria-hidden sx={{ fontSize: 20, color: t.gold800, mt: '1px' }} />
              {error}
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <CtaButton variant="outline" endIcon={null} onClick={() => setStep(2)} disabled={submitting}>
              Back
            </CtaButton>
            <CtaButton
              fullWidth
              disabled={submitting || !form.name || !form.phone || !form.email}
              onClick={handleSubmit}
              startIcon={submitting ? <CircularProgress size={20} sx={{ color: t.navy900 }} aria-hidden /> : undefined}
              endIcon={submitting ? null : undefined}
            >
              {submitting ? 'Registering...' : 'Register Free'}
            </CtaButton>
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
    minHeight: 48,
    borderRadius: `${t.radius}px`,
    bgcolor: t.surface,
  },
  // 16px stops iOS zooming into the field.
  '& .MuiInputBase-input': { fontSize: '1rem' },
} as const;
