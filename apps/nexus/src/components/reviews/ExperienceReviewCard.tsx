'use client';

/**
 * "Tell us about your experience": a student writes a testimonial for Neram
 * (lifecycle plan M6), in their own words, with their own consent.
 *
 * Deliberately separate from the review campaigns below it on the page, which
 * send the student to Google or JustDial. This one stays with Neram: it lands
 * hidden, a staff member reads it, and only a review the student agreed to
 * share (with a parent or guardian agreeing for anyone under 18) can ever be
 * shown on the website.
 *
 * The card opens a ResponsiveSheet: a bottom sheet on a phone, a dialog from
 * 600px. The form checks itself with the same validateLearnerTestimonial the
 * server uses, shows each message next to its field and moves focus to the
 * first one. Under-18 comes from the server (GET /api/testimonials), never from
 * anything the student can change.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
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
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { validateLearnerTestimonial, type LearnerTestimonialInput } from '@neram/database';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import { formatDateIN } from '@/lib/student-profile-fields';
import { suggestDisplayName, testimonialYearOptions } from '@/lib/lifecycle-display';

type FieldKey = keyof LearnerTestimonialInput;
type FieldErrors = Partial<Record<FieldKey, string>>;

interface FormContext {
  isMinor: boolean;
  lastSubmittedAt: string | null;
  nextAllowedAt: string | null;
}

const MAX_TEXT = 1500;

const RATING_WORDS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
};

const EXAMS: { value: LearnerTestimonialInput['examType']; label: string }[] = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE_PAPER_2', label: 'JEE Paper 2' },
  { value: 'BOTH', label: 'Both' },
];

/** Order the form reads in, so focus lands on the first problem. */
const FIELD_ORDER: FieldKey[] = ['rating', 'text', 'examType', 'year', 'city', 'displayName', 'guardianConsent'];

export default function ExperienceReviewCard({
  getToken,
  studentName,
}: {
  getToken: () => Promise<string | null>;
  studentName: string | null;
}) {
  const [ctx, setCtx] = useState<FormContext | null>(null);
  const [ctxError, setCtxError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [justSent, setJustSent] = useState(false);

  const loadContext = useCallback(async () => {
    setCtxError(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/testimonials', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error || 'Could not open the form.');
      setCtx(data as FormContext);
    } catch (err) {
      setCtxError(err instanceof Error ? err.message : 'Could not open the form.');
    }
  }, [getToken]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const waiting = !!ctx?.nextAllowedAt;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="experience-card-title"
      sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 2, mb: 3 }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box
          aria-hidden
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'action.hover',
            color: 'primary.main',
          }}
        >
          <RecordVoiceOverOutlinedIcon />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography id="experience-card-title" component="h2" sx={{ fontWeight: 700, fontSize: '1.0625rem' }}>
            Tell us about your experience
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Your words help the next student decide. The Neram team reads every review, and nothing is published
            without that review and your consent.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mt: 2 }}>
        {!ctx && !ctxError ? (
          <Skeleton
            variant="rounded"
            height={48}
            aria-label="Loading"
            sx={{ maxWidth: 240, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }}
          />
        ) : ctxError && !ctx ? (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" onClick={() => void loadContext()} sx={{ minHeight: 44 }}>
                Try again
              </Button>
            }
          >
            {ctxError}
          </Alert>
        ) : waiting || justSent ? (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }} role="status">
            <CheckCircleOutlineIcon sx={{ color: 'success.main', mt: '2px' }} aria-hidden />
            <Typography variant="body2">
              {justSent ? 'Thank you, your review was sent. ' : 'Thank you for sharing your experience. '}
              {ctx?.nextAllowedAt ? `You can write again from ${formatDateIN(ctx.nextAllowedAt)}.` : ''}
            </Typography>
          </Box>
        ) : (
          <Button variant="contained" onClick={() => setOpen(true)} sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>
            Write about Neram
          </Button>
        )}
      </Box>

      {ctx && (
        <ExperienceSheet
          open={open}
          isMinor={ctx.isMinor}
          studentName={studentName}
          getToken={getToken}
          onClose={() => setOpen(false)}
          onSent={(nextAllowedAt) => {
            setOpen(false);
            setJustSent(true);
            setCtx((c) => (c ? { ...c, nextAllowedAt, lastSubmittedAt: new Date().toISOString() } : c));
          }}
        />
      )}
    </Paper>
  );
}

function ExperienceSheet({
  open,
  isMinor,
  studentName,
  getToken,
  onClose,
  onSent,
}: {
  open: boolean;
  isMinor: boolean;
  studentName: string | null;
  getToken: () => Promise<string | null>;
  onClose: () => void;
  onSent: (nextAllowedAt: string | null) => void;
}) {
  const ids = {
    rating: useId(),
    ratingError: useId(),
    exam: useId(),
    consent: useId(),
  };
  const years = testimonialYearOptions();

  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [examType, setExamType] = useState<LearnerTestimonialInput['examType'] | ''>('');
  const [year, setYear] = useState<number | ''>('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [displayName, setDisplayName] = useState(() => suggestDisplayName(studentName));
  const [guardian, setGuardian] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const setRef = (key: FieldKey) => (el: HTMLElement | null) => {
    refs.current[key] = el;
  };

  const input = (): LearnerTestimonialInput => ({
    text,
    rating: rating ?? 0,
    examType: (examType || undefined) as LearnerTestimonialInput['examType'],
    year: typeof year === 'number' ? year : NaN,
    city,
    displayName,
    consentToPublish: consent,
    guardianConsent: guardian,
    isMinor,
  });

  const focusFirst = (errs: FieldErrors) => {
    const first = FIELD_ORDER.find((k) => errs[k]);
    if (!first) return;
    const el = refs.current[first];
    const target = el?.querySelector<HTMLElement>('input, textarea, [role="combobox"], [tabindex="0"]') ?? el;
    target?.focus();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setSendError(null);
    const check = validateLearnerTestimonial(input());
    setErrors(check.errors);
    if (!check.ok) {
      focusFirst(check.errors);
      return;
    }
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/testimonials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // isMinor is not sent: the server works it out.
        body: JSON.stringify({
          text,
          rating,
          examType,
          year,
          city,
          displayName,
          consentToPublish: consent,
          guardianConsent: guardian,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 201) {
        onSent(data?.nextAllowedAt ?? null);
        return;
      }
      if (res.status === 400 && data?.fieldErrors) {
        setErrors(data.fieldErrors);
        focusFirst(data.fieldErrors);
        return;
      }
      if (res.status === 429) {
        setSendError(data?.error || 'You already shared your experience recently.');
        return;
      }
      setSendError(data?.error || 'Could not send your review. Try again in a moment.');
    } catch {
      setSendError('Could not reach Nexus. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const clear = (key: FieldKey) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const formId = 'experience-review-form';

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      disableClose={busy}
      title="Tell us about your experience"
      description="Nothing is published without review by the Neram team."
      actions={
        <>
          <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none' }}
          >
            {busy ? 'Sending' : 'Send review'}
          </Button>
        </>
      }
    >
      <Box component="form" id={formId} noValidate onSubmit={submit} sx={{ display: 'grid', gap: 2.5, pt: 1 }}>
        {/* Rating: MUI Rating renders real radio inputs, so arrows and screen readers work. */}
        <FormControl component="fieldset" error={!!errors.rating} ref={setRef('rating')}>
          <FormLabel component="legend" id={ids.rating} sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
            Your rating
          </FormLabel>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Rating
              name="experience-rating"
              value={rating}
              onChange={(_, v) => {
                setRating(v);
                clear('rating');
              }}
              getLabelText={(v: number) => `${v} star${v === 1 ? '' : 's'}, ${RATING_WORDS[v] ?? ''}`}
              icon={<StarRoundedIcon fontSize="inherit" />}
              emptyIcon={<StarBorderRoundedIcon fontSize="inherit" />}
              aria-describedby={errors.rating ? ids.ratingError : undefined}
              sx={{
                fontSize: 36,
                '& .MuiRating-icon': { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
                '& .MuiRating-iconFilled': { color: 'warning.main' },
                '&.Mui-focusVisible, & .Mui-focusVisible': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: 2,
                  borderRadius: 1,
                },
                '@media (prefers-reduced-motion: reduce)': {
                  '& .MuiRating-icon, & .MuiRating-iconHover': { transition: 'none', transform: 'none' },
                },
              }}
            />
            <Typography variant="body2" color="text.secondary" aria-hidden>
              {rating ? `${rating} of 5, ${RATING_WORDS[rating]}` : 'Tap a star'}
            </Typography>
          </Box>
          {errors.rating && <FormHelperText id={ids.ratingError}>{errors.rating}</FormHelperText>}
        </FormControl>

        <TextField
          ref={setRef('text')}
          label="Your experience"
          value={text}
          onChange={(e) => {
            setText(e.target.value.slice(0, MAX_TEXT));
            clear('text');
          }}
          multiline
          minRows={4}
          fullWidth
          error={!!errors.text}
          helperText={errors.text ?? `What helped you most? What would you tell a friend? ${text.length} of ${MAX_TEXT}`}
          inputProps={{ maxLength: MAX_TEXT }}
        />

        <FormControl component="fieldset" error={!!errors.examType} ref={setRef('examType')}>
          <FormLabel component="legend" id={ids.exam} sx={{ fontWeight: 600, color: 'text.primary' }}>
            Exam you prepared for
          </FormLabel>
          <RadioGroup
            row
            aria-labelledby={ids.exam}
            value={examType}
            onChange={(e) => {
              setExamType(e.target.value as LearnerTestimonialInput['examType']);
              clear('examType');
            }}
          >
            {EXAMS.map((x) => (
              <FormControlLabel key={x.value} value={x.value} control={<Radio />} label={x.label} sx={{ minHeight: 44, mr: 2 }} />
            ))}
          </RadioGroup>
          {errors.examType && <FormHelperText>{errors.examType}</FormHelperText>}
        </FormControl>

        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          <TextField
            ref={setRef('year')}
            select
            label="Exam year"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              clear('year');
            }}
            error={!!errors.year}
            helperText={errors.year}
            fullWidth
          >
            {years.map((y) => (
              <MenuItem key={y} value={y} sx={{ minHeight: 44 }}>
                {y}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            ref={setRef('city')}
            label="City"
            value={city}
            onChange={(e) => {
              setCity(e.target.value.slice(0, 60));
              clear('city');
            }}
            autoComplete="address-level2"
            error={!!errors.city}
            helperText={errors.city}
            fullWidth
          />
        </Box>

        <Box sx={{ display: 'grid', gap: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                id={ids.consent}
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  clear('displayName');
                  clear('guardianConsent');
                }}
              />
            }
            label="Neram may show this on its website"
            sx={{ minHeight: 44, alignItems: 'center', mr: 0 }}
          />

          {consent && (
            <Box sx={{ display: 'grid', gap: 1.5, pl: { xs: 0, sm: 4 } }}>
              <TextField
                ref={setRef('displayName')}
                label="Name to show"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value.slice(0, 60));
                  clear('displayName');
                }}
                error={!!errors.displayName}
                helperText={errors.displayName ?? 'For example, your first name and the first letter of your surname.'}
                autoComplete="off"
                fullWidth
              />
              {isMinor && (
                <FormControl error={!!errors.guardianConsent} ref={setRef('guardianConsent')}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={guardian}
                        onChange={(e) => {
                          setGuardian(e.target.checked);
                          clear('guardianConsent');
                        }}
                      />
                    }
                    label="My parent or guardian agrees"
                    sx={{ minHeight: 44, mr: 0 }}
                  />
                  <FormHelperText>
                    {errors.guardianConsent ??
                      'Needed because you are under 18, or we do not have your date of birth.'}
                  </FormHelperText>
                </FormControl>
              )}
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', color: 'text.secondary' }}>
            <LockOutlinedIcon sx={{ fontSize: 18, mt: '2px' }} aria-hidden />
            <Typography variant="body2" color="text.secondary">
              {consent
                ? 'The Neram team reviews it first. It is only shown after that review.'
                : 'Without this box ticked, only the Neram team will read it.'}
            </Typography>
          </Box>
        </Box>

        {sendError && (
          <Alert severity="error" role="alert">
            {sendError}
          </Alert>
        )}
      </Box>
    </ResponsiveSheet>
  );
}
