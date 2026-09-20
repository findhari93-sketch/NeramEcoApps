'use client';

/**
 * The form a student fills in from the link their teacher sent them.
 *
 * Built for a phone on a slow connection first: 375px, one column, 48px controls,
 * a real label on every field, and the keyboard that suits each answer. Most of the
 * students this goes to are 15 to 18 and will open it inside WhatsApp's browser.
 *
 * Three short steps rather than one long page, because a wall of twelve questions is
 * what makes a teenager close the tab. Nothing is asked twice and only six answers
 * are actually required.
 *
 * The form is never prefilled from the server, even though it would be friendlier:
 * possession of the link is the only authentication, and it is forwardable, so
 * echoing back a date of birth or an address would hand them to whoever holds it.
 * A draft in this browser's own storage covers the student who closes the tab
 * halfway, which is the real problem prefilling would have solved.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  LinearProgress,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  APPLICATION_CATEGORY_OPTIONS,
  APPLICATION_CLASS_OPTIONS,
  APPLICATION_GENDER_OPTIONS,
  examYearOptions,
  validateApplicationAnswers,
  type ApplicationAnswers,
  type FieldError,
} from '@neram/database';

const STEP_TITLES = ['About you', 'Your studies', 'Where you live'] as const;
const TOTAL_STEPS = STEP_TITLES.length;

/** Which answers each step is responsible for, so Next only checks its own. */
const STEP_FIELDS: Record<number, (keyof ApplicationAnswers)[]> = {
  0: ['first_name', 'father_name', 'date_of_birth', 'gender', 'phone', 'parent_phone'],
  1: ['applicant_category', 'current_class', 'college_name', 'school_name', 'target_exam_year'],
  2: ['pincode', 'city', 'district', 'state', 'address'],
};

const COLLEGE_CATEGORIES = new Set(['college_student', 'diploma_student']);
const NON_SCHOOL_CATEGORIES = new Set(['college_student', 'diploma_student', 'working_professional']);

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; firstName: string | null; maskedEmail: string | null; alreadyAnswered: boolean }
  | { kind: 'refused'; message: string };

const draftKey = (token: string) => `neram_details_draft_${token}`;

export default function DetailRequestForm({ token }: { token: string }) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ApplicationAnswers>({});
  const [errors, setErrors] = useState<Partial<Record<keyof ApplicationAnswers, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [done, setDone] = useState(false);

  const yearOptions = useMemo(() => examYearOptions(), []);

  // ── validate the token ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/s/validate?token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoad({ kind: 'refused', message: body?.error || 'This link is not valid.' });
          return;
        }
        setLoad({
          kind: 'ready',
          firstName: body.firstName ?? null,
          maskedEmail: body.maskedEmail ?? null,
          alreadyAnswered: Boolean(body.alreadyAnswered),
        });
      } catch {
        if (!cancelled) {
          setLoad({ kind: 'refused', message: 'We could not open this link. Please check your connection and try again.' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── the draft, in this browser only ─────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey(token));
      if (saved) setAnswers(JSON.parse(saved));
    } catch {
      // A blocked or full storage must never stop the form working.
    }
  }, [token]);

  useEffect(() => {
    if (!Object.keys(answers).length) return;
    try {
      localStorage.setItem(draftKey(token), JSON.stringify(answers));
    } catch {
      // Same: the draft is a convenience, never a requirement.
    }
  }, [answers, token]);

  const set = useCallback((field: keyof ApplicationAnswers, value: string) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  /** Check only the fields this step owns, so Next never complains about later ones. */
  const checkStep = useCallback(
    (which: number): boolean => {
      const result = validateApplicationAnswers(answers);
      if (result.ok) return true;
      const mine = new Set(STEP_FIELDS[which]);
      const stepErrors = result.errors.filter((e: FieldError) => mine.has(e.field));
      if (!stepErrors.length) return true;
      setErrors(Object.fromEntries(stepErrors.map((e) => [e.field, e.message])));
      return false;
    },
    [answers],
  );

  /** Validate one field as the student leaves it, rather than only at the end. */
  const blurCheck = useCallback(
    (field: keyof ApplicationAnswers) => {
      const result = validateApplicationAnswers(answers);
      if (result.ok) return;
      const hit = result.errors.find((e: FieldError) => e.field === field);
      if (hit) setErrors((prev) => ({ ...prev, [field]: hit.message }));
    },
    [answers],
  );

  const onNext = () => {
    if (!checkStep(step)) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    window.scrollTo({ top: 0 });
  };

  const onBack = () => {
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  };

  const onSubmit = async () => {
    const result = validateApplicationAnswers(answers);
    if (!result.ok) {
      setErrors(Object.fromEntries(result.errors.map((e) => [e.field, e.message])));
      // Send them back to the first step that has a problem, rather than showing an
      // error about a field they cannot see.
      const firstBad = result.errors[0].field;
      const badStep = Number(Object.keys(STEP_FIELDS).find((k) => STEP_FIELDS[Number(k)].includes(firstBad)) ?? 0);
      setStep(badStep);
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/s/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, answers: result.answers }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (body?.errors) {
          setErrors(Object.fromEntries(body.errors.map((e: FieldError) => [e.field, e.message])));
          setSaveError('Please check the answers marked below.');
        } else {
          setSaveError(body?.error || 'We could not save that. Please try again.');
        }
        return;
      }
      try {
        localStorage.removeItem(draftKey(token));
      } catch {
        /* nothing to clean up */
      }
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch {
      setSaveError('We could not reach Neram Classes. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── shells ──────────────────────────────────────────────────────────────────
  if (load.kind === 'loading') {
    return (
      <Shell>
        <Stack spacing={2} aria-busy="true" aria-label="Opening your form">
          <Skeleton variant="text" height={40} />
          <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
          <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
        </Stack>
      </Shell>
    );
  }

  if (load.kind === 'refused') {
    return (
      <Shell>
        <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', py: 4 }}>
          <ErrorOutlineIcon aria-hidden sx={{ fontSize: 48, color: 'warning.main' }} />
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
            This link cannot be opened
          </Typography>
          <Typography color="text.secondary">{load.message}</Typography>
        </Stack>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <Stack spacing={2} alignItems="center" sx={{ textAlign: 'center', py: 4 }} role="status">
          <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 48, color: 'success.main' }} />
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
            Thank you, that is saved
          </Typography>
          <Typography color="text.secondary">
            Your details are now on your Neram Classes record. You can close this page.
          </Typography>
        </Stack>
      </Shell>
    );
  }

  const category = answers.applicant_category || '';

  return (
    <Shell>
      <Box component="header" sx={{ mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 800 }}>
          {load.firstName ? `Hello ${load.firstName}` : 'Your details'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Neram Classes is updating your student record. It takes about a minute.
        </Typography>
        {load.maskedEmail && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            For the account {load.maskedEmail}
          </Typography>
        )}
      </Box>

      {load.alreadyAnswered && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have already sent these details. Filling this in again will update them.
        </Alert>
      )}

      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          Step {step + 1} of {TOTAL_STEPS}: {STEP_TITLES[step]}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={((step + 1) / TOTAL_STEPS) * 100}
          aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}
          sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
        />
      </Box>

      {saveError && (
        <Alert severity="error" role="alert" sx={{ mb: 2 }}>
          {saveError}
        </Alert>
      )}

      <Stack spacing={2}>
        {step === 0 && (
          <>
            <Field
              label="Your name"
              value={answers.first_name || ''}
              onChange={(v) => set('first_name', v)}
              onBlur={() => blurCheck('first_name')}
              error={errors.first_name}
              autoFocus
              autoComplete="given-name"
              required
            />
            <Field
              label="Your father's name"
              value={answers.father_name || ''}
              onChange={(v) => set('father_name', v)}
              onBlur={() => blurCheck('father_name')}
              error={errors.father_name}
              required
            />
            <Field
              label="Date of birth"
              type="date"
              value={answers.date_of_birth || ''}
              onChange={(v) => set('date_of_birth', v)}
              onBlur={() => blurCheck('date_of_birth')}
              error={errors.date_of_birth}
              shrinkLabel
              required
            />
            <Field
              label="Gender"
              select
              options={APPLICATION_GENDER_OPTIONS}
              value={answers.gender || ''}
              onChange={(v) => set('gender', v)}
              error={errors.gender}
              helper="Optional"
            />
            <Field
              label="Your phone number"
              type="tel"
              inputMode="tel"
              value={answers.phone || ''}
              onChange={(v) => set('phone', v)}
              onBlur={() => blurCheck('phone')}
              error={errors.phone}
              autoComplete="tel"
              helper="So your teacher can reach you"
            />
            <Field
              label="A parent's phone number"
              type="tel"
              inputMode="tel"
              value={answers.parent_phone || ''}
              onChange={(v) => set('parent_phone', v)}
              onBlur={() => blurCheck('parent_phone')}
              error={errors.parent_phone}
              helper="Optional"
            />
          </>
        )}

        {step === 1 && (
          <>
            <Field
              label="What are you doing now"
              select
              options={APPLICATION_CATEGORY_OPTIONS}
              value={category}
              onChange={(v) => set('applicant_category', v)}
              error={errors.applicant_category}
              autoFocus
              required
            />
            {category && !NON_SCHOOL_CATEGORIES.has(category) && (
              <Field
                label="Which class are you in"
                select
                options={APPLICATION_CLASS_OPTIONS}
                value={answers.current_class || ''}
                onChange={(v) => set('current_class', v)}
                error={errors.current_class}
                required
              />
            )}
            {category && !NON_SCHOOL_CATEGORIES.has(category) && (
              <Field
                label="Your school"
                value={answers.school_name || ''}
                onChange={(v) => set('school_name', v)}
                helper="Optional"
              />
            )}
            {COLLEGE_CATEGORIES.has(category) && (
              <Field
                label="Your college"
                value={answers.college_name || ''}
                onChange={(v) => set('college_name', v)}
                onBlur={() => blurCheck('college_name')}
                error={errors.college_name}
                required
              />
            )}
            <Field
              label="Which year will you write the exam"
              select
              options={yearOptions}
              value={answers.target_exam_year || ''}
              onChange={(v) => set('target_exam_year', v)}
              error={errors.target_exam_year}
              required
            />
          </>
        )}

        {step === 2 && (
          <>
            <Field
              label="Pincode"
              inputMode="numeric"
              value={answers.pincode || ''}
              onChange={(v) => {
                set('pincode', v);
                if (/^[0-9]{6}$/.test(v)) void lookupPincode(v, set);
              }}
              onBlur={() => blurCheck('pincode')}
              error={errors.pincode}
              autoFocus
              autoComplete="postal-code"
              helper="We will fill in your town and state"
            />
            <Field
              label="Town or city"
              value={answers.city || ''}
              onChange={(v) => set('city', v)}
              onBlur={() => blurCheck('city')}
              error={errors.city}
              required
            />
            <Field
              label="District"
              value={answers.district || ''}
              onChange={(v) => set('district', v)}
              helper="Optional"
            />
            <Field
              label="State"
              value={answers.state || ''}
              onChange={(v) => set('state', v)}
              onBlur={() => blurCheck('state')}
              error={errors.state}
              required
            />
            <Field
              label="Address"
              value={answers.address || ''}
              onChange={(v) => set('address', v)}
              helper="Optional"
              multiline
            />
          </>
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        {step > 0 && (
          <Button
            variant="outlined"
            onClick={onBack}
            startIcon={<ArrowBackIcon />}
            disabled={saving}
            sx={{ minHeight: 48, flexShrink: 0 }}
          >
            Back
          </Button>
        )}
        {step < TOTAL_STEPS - 1 ? (
          <Button variant="contained" onClick={onNext} sx={{ minHeight: 48, flex: 1 }}>
            Next
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={onSubmit}
            disabled={saving}
            sx={{ minHeight: 48, flex: 1 }}
          >
            {saving ? 'Saving...' : 'Send my details'}
          </Button>
        )}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        Neram Classes uses these details for your class record only.
      </Typography>
    </Shell>
  );
}

/** Looks a pincode up and fills the place fields, quietly doing nothing on failure. */
async function lookupPincode(
  pincode: string,
  set: (field: keyof ApplicationAnswers, value: string) => void,
) {
  try {
    const res = await fetch(`/api/pincode/${pincode}`);
    if (!res.ok) return;
    // The route answers { success, data: { city, district, state, ... } }, not a
    // flat object. Reading the flat shape silently filled in nothing.
    const body = await res.json();
    const place = body?.data;
    if (!body?.success || !place) return;
    if (place.city) set('city', place.city);
    if (place.district) set('district', place.district);
    if (place.state) set('state', place.state);
  } catch {
    // The student can always type it themselves.
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Container
      maxWidth="sm"
      // 16px gutters and a capped width: no horizontal scroll at 375px, and the
      // line length stays readable on a laptop.
      sx={{ px: 2, py: { xs: 3, sm: 5 }, maxWidth: 560 }}
    >
      <Paper
        elevation={0}
        variant="outlined"
        sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, overflowWrap: 'anywhere' }}
      >
        {children}
      </Paper>
    </Container>
  );
}

/**
 * One question.
 *
 * Always a real label, never a placeholder standing in for one, and the error is
 * announced rather than shown only as a red line.
 */
function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  helper?: string;
  type?: string;
  inputMode?: 'tel' | 'numeric' | 'text';
  select?: boolean;
  options?: readonly { value: string; label: string }[];
  required?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  shrinkLabel?: boolean;
  multiline?: boolean;
}) {
  const { label, value, onChange, onBlur, error, helper, options, shrinkLabel, ...rest } = props;
  return (
    <TextField
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      error={Boolean(error)}
      helperText={error || helper || ' '}
      fullWidth
      select={rest.select}
      type={rest.type}
      required={rest.required}
      autoFocus={rest.autoFocus}
      autoComplete={rest.autoComplete}
      multiline={rest.multiline}
      minRows={rest.multiline ? 2 : undefined}
      InputLabelProps={shrinkLabel || rest.type === 'date' ? { shrink: true } : undefined}
      inputProps={{ inputMode: rest.inputMode }}
      FormHelperTextProps={error ? ({ role: 'alert' } as any) : undefined}
      sx={{
        // 16px stops iOS zooming the page on focus, and 48px is a thumb.
        '& .MuiInputBase-root': { minHeight: 48, fontSize: 16 },
        '& .MuiInputBase-input': { fontSize: 16 },
      }}
    >
      {rest.select &&
        (options || []).map((option) => (
          <MenuItem key={option.value} value={option.value} sx={{ minHeight: 48, fontSize: 16 }}>
            {option.label}
          </MenuItem>
        ))}
    </TextField>
  );
}
