'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Rating,
  Skeleton,
  TextField,
  Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StarIcon from '@mui/icons-material/Star';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';
import { validateLearnerTestimonial } from '@neram/database';
import type { LearnerTestimonialInput, TestimonialExam } from '@neram/database';
import { formatReviewDate } from '@/lib/learner-feedback';

// ─── Journey: where Back and Done return to ────────────────────────────────
const RETURN_TO: Record<string, { href: string; label: string }> = {
  feedback: { href: '/feedback', label: 'Back to feedback' },
  profile: { href: '/profile', label: 'Back to profile' },
  dashboard: { href: '/dashboard', label: 'Back to dashboard' },
};

const EXAM_OPTIONS: { value: TestimonialExam; label: string }[] = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE_PAPER_2', label: 'JEE Paper 2' },
  { value: 'BOTH', label: 'Both' },
];

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

const MAX_TEXT = 1500;
const MIN_TEXT = 20;

type FieldErrors = Partial<Record<keyof LearnerTestimonialInput, string>>;

// Field order, for moving focus to the first problem.
const FIELD_ORDER: (keyof LearnerTestimonialInput)[] = [
  'rating',
  'text',
  'examType',
  'year',
  'city',
  'displayName',
  'guardianConsent',
];
const FIELD_SELECTOR: Partial<Record<keyof LearnerTestimonialInput, string>> = {
  rating: '#review-rating-legend',
  text: '#review-text',
  examType: '#review-exam-NATA',
  year: '#review-year',
  city: '#review-city',
  displayName: '#review-display-name',
  guardianConsent: '#review-guardian',
};

interface Eligibility {
  isMinor: boolean;
  suggestedDisplayName: string;
  lastSubmittedAt: string | null;
  nextAllowedAt: string | null;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await getCurrentUser()?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

export function ReviewFormSkeleton() {
  return (
    <Container maxWidth="sm" disableGutters sx={{ pb: { xs: 10, md: 4 } }} aria-busy="true" aria-label="Loading the review form">
      <Skeleton variant="text" width={140} height={48} />
      <Skeleton variant="text" width="70%" height={40} sx={{ mt: 1 }} />
      <Skeleton variant="text" width="90%" height={24} />
      <Skeleton variant="rounded" height={560} sx={{ mt: 2, borderRadius: 3 }} />
    </Container>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ReviewForm() {
  const searchParams = useSearchParams();
  const back = RETURN_TO[searchParams.get('from') || ''] ?? RETURN_TO.dashboard;
  const { user } = useFirebaseAuth();

  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(true);

  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState(-1);
  const [text, setText] = useState('');
  const [examType, setExamType] = useState<TestimonialExam | ''>('');
  const [year, setYear] = useState<number | ''>('');
  const [city, setCity] = useState('');
  const [consentToPublish, setConsentToPublish] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const formErrorRef = useRef<HTMLDivElement>(null);

  const isMinor = eligibility?.isMinor ?? true;

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const out: number[] = [];
    for (let y = now + 1; y >= 2015; y -= 1) out.push(y);
    return out;
  }, []);

  // What the form needs from the server: age rule, suggested name, rate limit.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/testimonials', { headers: await authHeader() });
        if (!res.ok) throw new Error(String(res.status));
        const data: Eligibility = await res.json();
        if (cancelled) return;
        setEligibility(data);
        setDisplayName((current) => current || data.suggestedDisplayName || '');
      } catch {
        // The form still works; the server applies every rule on submit.
      } finally {
        if (!cancelled) setLoadingEligibility(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const currentInput = useCallback(
    (): Partial<LearnerTestimonialInput> => ({
      text,
      rating: rating ?? undefined,
      examType: (examType || undefined) as TestimonialExam | undefined,
      year: year === '' ? undefined : year,
      city,
      displayName,
      consentToPublish,
      guardianConsent,
      isMinor,
    }),
    [text, rating, examType, year, city, displayName, consentToPublish, guardianConsent, isMinor],
  );

  // After the first attempt, errors update as the learner fixes them.
  useEffect(() => {
    if (attempted) setErrors(validateLearnerTestimonial(currentInput()).errors);
  }, [attempted, currentInput]);

  const focusFirstError = (errs: FieldErrors) => {
    const first = FIELD_ORDER.find((k) => errs[k]);
    const selector = first ? FIELD_SELECTOR[first] : undefined;
    if (selector) window.requestAnimationFrame(() => document.querySelector<HTMLElement>(selector)?.focus());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    setFormError('');
    const check = validateLearnerTestimonial(currentInput());
    setErrors(check.errors);
    if (!check.ok) {
      focusFirstError(check.errors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          text: text.trim(),
          rating,
          examType,
          year,
          city: city.trim(),
          consentToPublish,
          displayName: consentToPublish ? displayName.trim() : undefined,
          guardianConsent: consentToPublish && isMinor ? guardianConsent : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(true);
        window.scrollTo({ top: 0 });
        return;
      }
      if (res.status === 400 && data.fieldErrors) {
        setErrors(data.fieldErrors);
        focusFirstError(data.fieldErrors);
      }
      if (res.status === 429 && data.nextAllowedAt) {
        setEligibility((prev) => (prev ? { ...prev, nextAllowedAt: data.nextAllowedAt } : prev));
      }
      setFormError(data.error || 'We could not save your review. Please try again.');
      window.requestAnimationFrame(() => formErrorRef.current?.focus());
    } catch {
      setFormError('You seem to be offline. Check your connection and try again.');
      window.requestAnimationFrame(() => formErrorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoverRating !== -1 ? hoverRating : rating || 0;
  const trimmedLength = text.trim().length;

  // ─── States ────────────────────────────────────────────────────────────

  if (!user || loadingEligibility) return <ReviewFormSkeleton />;

  const backLink = (
    <Button
      component={Link}
      href={back.href}
      startIcon={<ArrowBackIcon />}
      sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, ml: -1, px: 1 }}
    >
      {back.label}
    </Button>
  );

  if (done) {
    return (
      <Container maxWidth="sm" disableGutters sx={{ pb: { xs: 10, md: 4 } }}>
        {backLink}
        <Paper
          elevation={0}
          role="status"
          sx={{ mt: 1, p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}
        >
          <CheckCircleOutlineIcon sx={{ fontSize: 56, color: 'success.main' }} aria-hidden />
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 1.5 }}>
            Thank you for your review
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            {consentToPublish
              ? `Our team will read it first. If it is approved, it will appear on our website as ${displayName.trim()}.`
              : 'You chose to keep it private, so only the Neram team will read it.'}
          </Typography>
          <Button
            component={Link}
            href={back.href}
            variant="contained"
            fullWidth
            sx={{ mt: 3, minHeight: 52, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Done
          </Button>
        </Paper>
      </Container>
    );
  }

  if (eligibility?.nextAllowedAt && !formError) {
    return (
      <Container maxWidth="sm" disableGutters sx={{ pb: { xs: 10, md: 4 } }}>
        {backLink}
        <Paper
          elevation={0}
          sx={{ mt: 1, p: { xs: 3, md: 4 }, borderRadius: 3, border: '1px solid', borderColor: 'divider', textAlign: 'center' }}
        >
          <ScheduleIcon sx={{ fontSize: 48, color: 'primary.main' }} aria-hidden />
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mt: 1 }}>
            We already have your review
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            {eligibility.lastSubmittedAt
              ? `You shared one on ${formatReviewDate(new Date(eligibility.lastSubmittedAt))}. `
              : ''}
            You can write another from {formatReviewDate(new Date(eligibility.nextAllowedAt))}.
          </Typography>
          <Button
            component={Link}
            href={back.href}
            variant="outlined"
            fullWidth
            sx={{ mt: 3, minHeight: 48, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            {back.label}
          </Button>
        </Paper>
      </Container>
    );
  }

  // ─── Form ──────────────────────────────────────────────────────────────

  const inputSx = { '& .MuiInputBase-root': { borderRadius: 2 }, '& .MuiInputBase-input': { fontSize: 16 } };

  return (
    <Container maxWidth="sm" disableGutters sx={{ pb: { xs: 10, md: 4 } }}>
      {backLink}
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 1, fontSize: { xs: '1.375rem', md: '1.5rem' } }}>
        Write a review
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
        Tell other students what learning with Neram was like.
      </Typography>

      <Paper
        component="form"
        noValidate
        onSubmit={handleSubmit}
        elevation={0}
        sx={{ mt: 2, p: { xs: 2, sm: 3 }, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        {formError && (
          <Alert
            severity="error"
            role="alert"
            ref={formErrorRef}
            tabIndex={-1}
            sx={{ mb: 2.5, borderRadius: 2, '&:focus': { outline: 'none' } }}
            onClose={() => setFormError('')}
          >
            {formError}
          </Alert>
        )}

        {/* Rating: radio stars (MUI Rating renders a radio group) */}
        <FormControl component="fieldset" error={!!errors.rating} sx={{ mb: 3, width: '100%' }}>
          <FormLabel
            component="legend"
            id="review-rating-legend"
            tabIndex={-1}
            sx={{ color: 'text.primary', fontWeight: 600, mb: 1, '&.Mui-focused': { color: 'text.primary' }, '&:focus': { outline: 'none' } }}
          >
            Your overall rating
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Rating
              name="review-rating"
              value={rating}
              onChange={(_, v) => setRating(v)}
              onChangeActive={(_, v) => setHoverRating(v)}
              getLabelText={(v: number) => `${v} star${v === 1 ? '' : 's'}, ${RATING_LABELS[v]}`}
              emptyIcon={<StarIcon style={{ opacity: 0.3 }} fontSize="inherit" />}
              aria-describedby={errors.rating ? 'review-rating-error' : undefined}
              sx={{
                ml: -0.5,
                borderRadius: 2,
                '& .MuiRating-label': { p: '4px' },
                '& .MuiRating-icon': { fontSize: 40 },
                '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                '@media (prefers-reduced-motion: reduce)': { '& .MuiRating-icon': { transition: 'none' } },
              }}
            />
            <Typography variant="body2" color="text.secondary" aria-hidden sx={{ minWidth: 72 }}>
              {RATING_LABELS[activeRating] || ''}
            </Typography>
          </Box>
          {errors.rating && <FormHelperText id="review-rating-error">{errors.rating}</FormHelperText>}
        </FormControl>

        {/* Text */}
        <TextField
          id="review-text"
          label="Your review"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          fullWidth
          multiline
          minRows={5}
          placeholder="What helped you most? How did the classes, teachers or tools make a difference?"
          error={!!errors.text}
          helperText={
            errors.text ||
            (trimmedLength > 0 && trimmedLength < MIN_TEXT
              ? `${MIN_TEXT - trimmedLength} more characters needed`
              : `${text.length} / ${MAX_TEXT}`)
          }
          inputProps={{ maxLength: MAX_TEXT }}
          sx={{ mb: 3, ...inputSx }}
        />

        {/* Exam */}
        <FormControl component="fieldset" error={!!errors.examType} sx={{ mb: 3, width: '100%' }}>
          <FormLabel component="legend" sx={{ color: 'text.primary', fontWeight: 600, mb: 1, '&.Mui-focused': { color: 'text.primary' } }}>
            Exam you prepared for
          </FormLabel>
          <RadioGroup
            name="review-exam"
            value={examType}
            onChange={(e) => setExamType(e.target.value as TestimonialExam)}
            sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}
          >
            {EXAM_OPTIONS.map((o) => {
              const on = examType === o.value;
              return (
                <FormControlLabel
                  key={o.value}
                  value={o.value}
                  label={o.label}
                  control={<Radio id={`review-exam-${o.value}`} />}
                  sx={{
                    m: 0,
                    minHeight: 48,
                    pr: 2,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: on ? 'primary.main' : 'divider',
                    bgcolor: on ? 'action.selected' : 'transparent',
                    '& .MuiFormControlLabel-label': { fontWeight: on ? 600 : 400 },
                    '&:has(.Mui-focusVisible)': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                />
              );
            })}
          </RadioGroup>
          {errors.examType && <FormHelperText>{errors.examType}</FormHelperText>}
        </FormControl>

        {/* Year and city: one per row on phones, side by side from 600px */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 3 }}>
          <TextField
            id="review-year"
            select
            label="Exam year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            error={!!errors.year}
            helperText={errors.year || ' '}
            fullWidth
            sx={inputSx}
          >
            {years.map((y) => (
              <MenuItem key={y} value={y} sx={{ minHeight: 48 }}>
                {y}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            id="review-city"
            label="City"
            value={city}
            onChange={(e) => setCity(e.target.value.slice(0, 60))}
            error={!!errors.city}
            helperText={errors.city || ' '}
            autoComplete="address-level2"
            fullWidth
            sx={inputSx}
          />
        </Box>

        {/* Consent */}
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
            mb: 2,
          }}
        >
          <FormControlLabel
            sx={{ m: 0, ml: '-12px', minHeight: 48 }}
            control={
              <Checkbox
                checked={consentToPublish}
                onChange={(e) => setConsentToPublish(e.target.checked)}
                sx={{ p: '12px' }}
              />
            }
            label={
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Neram may show this on its website
              </Typography>
            }
          />
          {consentToPublish && (
            <Box sx={{ mt: 1.5 }}>
              <TextField
                id="review-display-name"
                label="Name to show"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
                error={!!errors.displayName}
                helperText={errors.displayName || 'For example, your first name and last initial: Priya S.'}
                autoComplete="off"
                fullWidth
                sx={{ ...inputSx, '& .MuiInputBase-root': { borderRadius: 2, bgcolor: 'background.paper' } }}
              />
              {isMinor && (
                <FormControl error={!!errors.guardianConsent} sx={{ mt: 2, width: '100%' }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    You are under 18, or we do not have your date of birth, so a parent or guardian must agree too.
                  </Typography>
                  <FormControlLabel
                    sx={{ m: 0, ml: '-12px', minHeight: 48 }}
                    control={
                      <Checkbox
                        id="review-guardian"
                        checked={guardianConsent}
                        onChange={(e) => setGuardianConsent(e.target.checked)}
                        inputProps={{ 'aria-describedby': errors.guardianConsent ? 'review-guardian-error' : undefined }}
                        sx={{ p: '12px' }}
                      />
                    }
                    label="My parent or guardian agrees"
                  />
                  {errors.guardianConsent && (
                    <FormHelperText id="review-guardian-error" sx={{ mx: 0 }}>
                      {errors.guardianConsent}
                    </FormHelperText>
                  )}
                </FormControl>
              )}
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 3, color: 'text.secondary' }}>
          <VerifiedUserOutlinedIcon fontSize="small" sx={{ mt: '2px' }} aria-hidden />
          <Typography variant="body2" color="text.secondary">
            Nothing is published without review by the Neram team.
          </Typography>
        </Box>

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={submitting}
          aria-busy={submitting}
          sx={{ minHeight: 52, textTransform: 'none', fontWeight: 600, fontSize: '1rem', borderRadius: 2 }}
        >
          {submitting ? <CircularProgress size={24} color="inherit" aria-label="Sending your review" /> : 'Send review'}
        </Button>
      </Paper>
    </Container>
  );
}
