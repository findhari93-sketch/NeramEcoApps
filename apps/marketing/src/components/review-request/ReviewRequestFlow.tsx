'use client';

/**
 * The page a past student opens from the review link Neram sent them.
 *
 * Built for a phone inside WhatsApp's browser first: 375px, one column, one task
 * per screen, 48px controls, a real label on every field, and the main action in
 * a bar at the bottom where the thumb already is.
 *
 * Voice first. Most students will not type 80 words on a phone, but they will talk
 * for a minute. The mic is the big button; Gemini turns what they said into a
 * written review they can still edit. Typing is always one tap away, and nothing
 * here depends on AI: if it is unavailable the student simply types.
 *
 * Steps: confirm your details, stars, say it, check and send, then the thank-you
 * screen with the one-tap Google step (shown to everyone, whatever the rating,
 * because asking only happy students is against Google's rules).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Container,
  FormControlLabel,
  LinearProgress,
  Paper,
  Rating,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import { useVoiceRecorder } from '@neram/ui/hooks';
import { REVIEW_HELPED_CHIPS } from '@neram/ai/review-compose';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';
import KeyboardIcon from '@mui/icons-material/KeyboardOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VerifiedIcon from '@mui/icons-material/VerifiedOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import type { PublicReviewView } from '@/lib/review-request-view';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { eyebrowSx, tokens as tk } from '@/design-system/tokens';

const RECORD_CAP_MS = 120_000;
const MIN_TEXT = 20;

const EXAM_LABEL: Record<PublicReviewView['examType'], string> = {
  NATA: 'NATA',
  JEE_PAPER_2: 'JEE Paper 2',
  BOTH: 'NATA and JEE Paper 2',
};

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Below average',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
};

const PLATFORM_LABEL = { justdial: 'Justdial', sulekha: 'Sulekha' } as const;

/**
 * An on/off chip that reads as on/off. Explicit colours rather than color="primary",
 * because the marketing theme draws a filled primary chip pale grey, which made the
 * selected chip look less selected than the others. Selection also carries a tick,
 * so colour is never the only signal.
 */
function selectChipSx(on: boolean) {
  // The design-system Pill: selected = navy900 fill with paper text, unselected = white with a 2px line border.
  const bg = on ? tk.navy900 : tk.surface;
  const fg = on ? tk.paper : tk.ink;
  // '&&' doubles the class specificity: the theme's own hover, focus and active
  // rules otherwise win on a chip just tapped and turn it white on white.
  return {
    '&&': {
      minHeight: 44,
      fontWeight: 600,
      borderRadius: `${tk.radiusPill}px`,
      border: '2px solid',
      borderColor: on ? tk.navy900 : tk.line,
      bgcolor: bg,
      color: fg,
      '& .MuiChip-icon': { color: 'inherit' },
      '&:hover': { bgcolor: on ? tk.navy700 : tk.surface, borderColor: on ? tk.navy700 : tk.ink, color: fg },
      '&:focus, &:active, &.Mui-focusVisible': { bgcolor: bg, color: fg },
      '&.Mui-focusVisible': { outline: tk.focusOutline, outlineOffset: 2 },
      '@media (hover: none)': { '&:hover': { bgcolor: bg, borderColor: on ? tk.navy900 : tk.line } },
    },
  } as const;
}

type Step = 'confirm' | 'rate' | 'speak' | 'check' | 'thanks';
const FORM_STEPS: Step[] = ['confirm', 'rate', 'speak', 'check'];

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; view: PublicReviewView }
  | { kind: 'refused'; message: string };

interface Draft {
  rating: number | null;
  helped: string[];
  text: string;
  ownText: string;
  aiText: string;
  transcript: string;
  inputMode: 'typed' | 'voice';
  displayName: string;
  corrections: Record<string, string>;
}

const draftKey = (token: string) => `neram_review_draft_${token}`;

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ReviewRequestFlow({ token }: { token: string }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [step, setStep] = useState<Step>('confirm');
  const [draft, setDraft] = useState<Draft>({
    rating: null,
    helped: [],
    text: '',
    ownText: '',
    aiText: '',
    transcript: '',
    inputMode: 'typed',
    displayName: '',
    corrections: {},
  });
  const [consent, setConsent] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(true);
  const [isMinor, setIsMinor] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState('');
  const [aiCallsLeft, setAiCallsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [googlePosted, setGooglePosted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const recorder = useVoiceRecorder({ capMs: RECORD_CAP_MS });

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  // ── open the link ────────────────────────────────────────────────────────
  const applyView = useCallback((view: PublicReviewView, fromSubmit = false) => {
    setLoad({ kind: 'ready', view });
    setAiCallsLeft(view.aiCallsLeft);
    setGooglePosted(view.googlePosted);
    if (view.state !== 'new') {
      setStep('thanks');
      if (view.review && !fromSubmit) {
        setDraft((d) => ({
          ...d,
          rating: view.review!.rating,
          text: view.review!.text,
          ownText: d.ownText || view.review!.text,
          displayName: view.review!.displayName,
        }));
        setConsent(true);
      }
    }
    setDraft((d) => ({ ...d, displayName: d.displayName || view.suggestedDisplayName }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/r/validate?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoad({ kind: 'refused', message: body?.error || 'This link is not valid.' });
          return;
        }
        applyView(body as PublicReviewView);
      } catch {
        if (!cancelled) setLoad({ kind: 'refused', message: 'We could not open this link. Please check your connection and try again.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, applyView]);

  // ── the draft, in this browser only ──────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey(token));
      if (saved) setDraft((d) => ({ ...d, ...JSON.parse(saved) }));
    } catch {
      // A blocked storage must never stop the page working.
    }
  }, [token]);

  useEffect(() => {
    if (!draft.text && !draft.rating) return;
    try {
      localStorage.setItem(draftKey(token), JSON.stringify(draft));
    } catch {
      // Convenience only.
    }
  }, [draft, token]);

  // Move focus to each new screen's heading, so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  // ── AI compose ───────────────────────────────────────────────────────────
  const compose = useCallback(
    async (input: { audio?: Blob; mime?: string; text?: string }) => {
      setComposing(true);
      setComposeError('');
      try {
        const form = new FormData();
        form.set('token', token);
        form.set('helped', JSON.stringify(draft.helped));
        form.set('corrections', JSON.stringify(draft.corrections));
        if (input.audio) form.set('audio', new File([input.audio], 'review', { type: input.mime || input.audio.type }));
        if (input.text) form.set('text', input.text);
        const res = await fetch('/api/r/compose', { method: 'POST', body: form });
        const body = await res.json().catch(() => ({}));
        if (typeof body.aiCallsLeft === 'number') setAiCallsLeft(body.aiCallsLeft);
        if (!res.ok) {
          if (body.code === 'AI_LIMIT') setAiCallsLeft(0);
          if (body.transcript) setDraft((d) => ({ ...d, ownText: body.transcript, text: d.text || body.transcript }));
          setComposeError(body.error || 'AI help did not work this time. You can type your review instead.');
          if (input.audio) setTyping(true);
          return;
        }
        setDraft((d) => ({
          ...d,
          aiText: body.review,
          text: body.review,
          transcript: body.transcript || d.transcript,
          ownText: input.text ? input.text : body.transcript || d.ownText,
          inputMode: input.audio ? 'voice' : d.inputMode,
        }));
        setStep('check');
      } catch {
        setComposeError('We could not reach AI help. Check your connection, or type your review.');
        if (input.audio) setTyping(true);
      } finally {
        setComposing(false);
      }
    },
    [token, draft.helped, draft.corrections],
  );

  // When a recording finishes, send it straight away: one less tap.
  const sentRecording = useRef<string | null>(null);
  useEffect(() => {
    const rec = recorder.recording;
    if (!rec || sentRecording.current === rec.url) return;
    sentRecording.current = rec.url;
    if (rec.durationMs < 3000) {
      setComposeError('That was very short. Tap the mic and talk for at least 20 seconds.');
      recorder.discard();
      return;
    }
    void compose({ audio: rec.blob, mime: rec.mime });
  }, [recorder.recording, recorder, compose]);

  // ── submit ───────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    setSubmitError('');
    setFieldErrors({});
    if (draft.text.trim().length < MIN_TEXT) {
      setFieldErrors({ text: 'Write at least a couple of sentences.' });
      return;
    }
    if (!consent) {
      setFieldErrors({ consent: 'Please tick this so we can show your review.' });
      return;
    }
    if (isMinor && !guardianConsent) {
      setFieldErrors({ guardian: 'A parent or guardian must agree for students under 18.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/r/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          text: draft.text.trim(),
          rating: draft.rating,
          displayName: draft.displayName,
          consentToPublish: consent,
          photoConsent,
          isMinor,
          guardianConsent,
          inputMode: draft.inputMode,
          voiceTranscript: draft.transcript,
          corrections: draft.corrections,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.fieldErrors) setFieldErrors(body.fieldErrors);
        setSubmitError(body.error || 'We could not save your review. Please try again.');
        return;
      }
      try {
        localStorage.removeItem(draftKey(token));
      } catch {
        // Convenience only.
      }
      if (body.view) applyView(body.view, true);
      setStep('thanks');
    } catch {
      setSubmitError('We could not reach Neram. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }, [token, draft, consent, photoConsent, isMinor, guardianConsent, applyView]);

  const track = useCallback(
    (event: 'google_click' | 'google_posted' | 'secondary_click') => {
      // Fire and forget, and keepalive so it survives the tab switching to Google.
      fetch('/api/r/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, event }),
        keepalive: true,
      }).catch(() => {});
    },
    [token],
  );

  if (load.kind === 'loading') return <LoadingShell />;
  if (load.kind === 'refused') return <RefusedShell message={load.message} />;

  const view = load.view;
  const stepIndex = FORM_STEPS.indexOf(step);
  const facts = { ...view, ...correctedFacts(view, draft.corrections) };

  const goBack = () => setStep(FORM_STEPS[Math.max(0, stepIndex - 1)]);

  return (
    <Shell>
      {step !== 'thanks' && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" component="p">
            Step {stepIndex + 1} of {FORM_STEPS.length}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={((stepIndex + 1) / FORM_STEPS.length) * 100}
            aria-label={`Step ${stepIndex + 1} of ${FORM_STEPS.length}`}
            sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      {/* ── 1. Confirm ─────────────────────────────────────────────────── */}
      {step === 'confirm' && (
        <>
          <Heading refEl={headingRef}>Congratulations, {view.firstName}</Heading>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Your story can help the next student choose. It takes about two minutes.
          </Typography>
          <FactsCard view={facts} photoUrl={view.photoUrl} name={view.studentName} />
          <Button
            variant="text"
            startIcon={<EditIcon />}
            onClick={() => setFixing((f) => !f)}
            aria-expanded={fixing}
            sx={{ mt: 1, minHeight: 48 }}
          >
            {fixing ? 'Done fixing' : 'Something not right? Fix it'}
          </Button>
          <Collapse in={fixing}>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Field
                label="College you joined"
                value={draft.corrections.college_admitted ?? view.collegeAdmitted ?? ''}
                onChange={(v) => set('corrections', { ...draft.corrections, college_admitted: v })}
              />
              <Field
                label="All India Rank"
                inputMode="numeric"
                value={draft.corrections.air_rank ?? (view.airRank ? String(view.airRank) : '')}
                onChange={(v) => set('corrections', { ...draft.corrections, air_rank: v.replace(/\D/g, '') })}
              />
              <Field
                label="Exam year"
                inputMode="numeric"
                value={draft.corrections.exam_year ?? (view.examYear ? String(view.examYear) : '')}
                onChange={(v) => set('corrections', { ...draft.corrections, exam_year: v.replace(/\D/g, '').slice(0, 4) })}
              />
              <Field
                label="Your city"
                value={draft.corrections.city ?? view.city ?? ''}
                onChange={(v) => set('corrections', { ...draft.corrections, city: v })}
              />
            </Stack>
          </Collapse>
          <ActionBar>
            <Button variant="contained" fullWidth onClick={() => setStep('rate')} sx={{ minHeight: 52 }}>
              Looks right, continue
            </Button>
          </ActionBar>
        </>
      )}

      {/* ── 2. Rate ────────────────────────────────────────────────────── */}
      {step === 'rate' && (
        <>
          <Heading refEl={headingRef}>How was Neram for you?</Heading>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 2 }}>
            <Rating
              name="review-rating"
              value={draft.rating}
              onChange={(_, v) => set('rating', v)}
              getLabelText={(v: number) => `${v} star${v === 1 ? '' : 's'}, ${RATING_LABELS[v]}`}
              sx={{
                // Each star is its own 48px target, with a gap between them.
                gap: 0.5,
                '& .MuiRating-icon': { fontSize: 48 },
                '& .MuiRating-label, & label': { p: 0.25 },
              }}
            />
            <Typography sx={{ mt: 1, minHeight: 24, fontWeight: 600 }} aria-live="polite">
              {draft.rating ? RATING_LABELS[draft.rating] : 'Tap a star'}
            </Typography>
          </Box>
          <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 600, mt: 2, mb: 1 }}>
            What helped you most? <Typography component="span" color="text.secondary">(optional)</Typography>
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} role="group" aria-label="What helped you most">
            {REVIEW_HELPED_CHIPS.map((chip) => {
              const on = draft.helped.includes(chip);
              return (
                <Chip
                  key={chip}
                  label={chip}
                  clickable
                  icon={on ? <CheckIcon /> : undefined}
                  aria-pressed={on}
                  onClick={() => set('helped', on ? draft.helped.filter((h) => h !== chip) : [...draft.helped, chip])}
                  sx={{ ...selectChipSx(on), fontSize: 15, px: 0.5 }}
                />
              );
            })}
          </Box>
          <ActionBar>
            <BackButton onClick={goBack} />
            <Button variant="contained" fullWidth disabled={!draft.rating} onClick={() => setStep('speak')} sx={{ minHeight: 52 }}>
              Continue
            </Button>
          </ActionBar>
        </>
      )}

      {/* ── 3. Speak or type ───────────────────────────────────────────── */}
      {step === 'speak' && (
        <>
          <Heading refEl={headingRef}>Tell us in your own words</Heading>
          {!typing ? (
            <>
              <Typography color="text.secondary" sx={{ mb: 1 }}>
                Tap the mic and just talk for 30 to 60 seconds, in English, Tamil or a mix. We will turn it into a written review you can check.
              </Typography>
              <Prompts />
              <VoiceRecorderPanel
                recorder={recorder}
                composing={composing}
                aiAvailable={aiCallsLeft > 0}
              />
              {composeError && (
                <Alert severity="warning" sx={{ mt: 2 }} role="alert">
                  {composeError}
                </Alert>
              )}
              <Button
                variant="text"
                startIcon={<KeyboardIcon />}
                onClick={() => {
                  recorder.cancel();
                  setTyping(true);
                }}
                disabled={composing}
                sx={{ mt: 2, minHeight: 48 }}
              >
                Prefer typing?
              </Button>
            </>
          ) : (
            <>
              <Prompts />
              <TextField
                label="Your review"
                value={draft.ownText}
                onChange={(e) => setDraft((d) => ({ ...d, ownText: e.target.value, text: e.target.value, inputMode: 'typed' }))}
                multiline
                minRows={6}
                fullWidth
                autoFocus
                helperText={`${draft.ownText.trim().length} characters. At least ${MIN_TEXT}.`}
                inputProps={{ maxLength: 1500 }}
                sx={{ mt: 1, '& .MuiInputBase-input': { fontSize: 16, lineHeight: 1.5 } }}
              />
              {composeError && (
                <Alert severity="warning" sx={{ mt: 2 }} role="alert">
                  {composeError}
                </Alert>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2 }}>
                {aiCallsLeft > 0 && (
                  <Button
                    variant="outlined"
                    startIcon={composing ? <CircularProgress size={18} /> : <AutoAwesomeIcon />}
                    disabled={composing || draft.ownText.trim().length < 10}
                    onClick={() => compose({ text: draft.ownText })}
                    sx={{ minHeight: 48 }}
                  >
                    {composing ? 'Improving...' : 'Improve with AI'}
                  </Button>
                )}
                <Button variant="text" startIcon={<MicIcon />} onClick={() => setTyping(false)} disabled={composing} sx={{ minHeight: 48 }}>
                  Speak instead
                </Button>
              </Stack>
            </>
          )}
          <ActionBar>
            <BackButton onClick={goBack} disabled={composing || recorder.status === 'recording'} />
            {typing && (
              <Button
                variant="contained"
                fullWidth
                disabled={composing || draft.ownText.trim().length < MIN_TEXT}
                onClick={() => {
                  setDraft((d) => ({ ...d, text: d.ownText, inputMode: 'typed' }));
                  setStep('check');
                }}
                sx={{ minHeight: 52 }}
              >
                Use my words
              </Button>
            )}
          </ActionBar>
        </>
      )}

      {/* ── 4. Check and send ──────────────────────────────────────────── */}
      {step === 'check' && (
        <>
          <Heading refEl={headingRef}>Check your review</Heading>
          {draft.aiText && draft.ownText && draft.aiText !== draft.ownText && (
            <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }} role="group" aria-label="Which version to use">
              <Chip
                icon={<AutoAwesomeIcon />}
                label="AI version"
                clickable
                aria-pressed={draft.text === draft.aiText}
                onClick={() => set('text', draft.aiText)}
                sx={selectChipSx(draft.text === draft.aiText)}
              />
              <Chip
                icon={draft.text === draft.ownText ? <CheckIcon /> : undefined}
                label={draft.inputMode === 'voice' ? 'What I said' : 'My words'}
                clickable
                aria-pressed={draft.text === draft.ownText}
                onClick={() => set('text', draft.ownText)}
                sx={selectChipSx(draft.text === draft.ownText)}
              />
            </Box>
          )}
          <TextField
            label="Your review (you can edit it)"
            value={draft.text}
            onChange={(e) => set('text', e.target.value)}
            multiline
            minRows={6}
            fullWidth
            error={Boolean(fieldErrors.text)}
            helperText={fieldErrors.text || 'Make sure it says what you mean. It will appear with your name.'}
            FormHelperTextProps={fieldErrors.text ? ({ role: 'alert' } as any) : undefined}
            inputProps={{ maxLength: 1500 }}
            sx={{ '& .MuiInputBase-input': { fontSize: 16, lineHeight: 1.5 } }}
          />
          {draft.rating && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }}>
              <Rating value={draft.rating} readOnly size="small" aria-label={`${draft.rating} stars`} />
              <Button size="small" onClick={() => setStep('rate')} sx={{ minHeight: 44 }}>
                Change stars
              </Button>
            </Stack>
          )}

          <Box sx={{ mt: 2.5 }}>
            <Field label="Name to show with your review" value={draft.displayName} onChange={(v) => set('displayName', v)} />
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <ConsentBox
                checked={consent}
                onChange={setConsent}
                label="Show my review with this name on neramclasses.com"
                error={fieldErrors.consent}
              />
              {view.photoUrl && (
                <ConsentBox checked={photoConsent} onChange={setPhotoConsent} label="Show my photo with it" />
              )}
              <ConsentBox checked={isMinor} onChange={setIsMinor} label="I am under 18" />
              {isMinor && (
                <ConsentBox
                  checked={guardianConsent}
                  onChange={setGuardianConsent}
                  label="My parent or guardian agrees"
                  error={fieldErrors.guardian}
                />
              )}
            </Stack>
          </Box>

          {submitError && (
            <Alert severity="error" sx={{ mt: 2 }} role="alert">
              {submitError}
            </Alert>
          )}

          <ActionBar>
            <BackButton onClick={() => setStep('speak')} disabled={submitting} />
            <Button variant="contained" fullWidth onClick={submit} disabled={submitting} sx={{ minHeight: 52 }}>
              {submitting ? 'Sending...' : view.state === 'submitted' ? 'Save changes' : 'Send my review'}
            </Button>
          </ActionBar>
        </>
      )}

      {/* ── 5. Thank you + Google ──────────────────────────────────────── */}
      {step === 'thanks' && (
        <ThanksScreen
          view={load.view}
          text={draft.text || view.review?.text || ''}
          headingRef={headingRef}
          copied={copied}
          googlePosted={googlePosted}
          onGoogle={() => {
            const google = view.targets.google;
            if (!google) return;
            const text = view.review?.text || draft.text;
            // Copy and open in the same tap: browsers only allow both inside a user gesture.
            navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false));
            window.open(google.url, '_blank', 'noopener,noreferrer');
            track('google_click');
          }}
          onPosted={() => {
            setGooglePosted(true);
            track('google_posted');
          }}
          onSecondary={() => track('secondary_click')}
          onEdit={
            view.state === 'submitted'
              ? () => {
                  setDraft((d) => ({ ...d, text: d.text || view.review?.text || '', ownText: d.ownText || view.review?.text || '' }));
                  setStep('check');
                }
              : undefined
          }
        />
      )}
    </Shell>
  );
}

function correctedFacts(view: PublicReviewView, c: Record<string, string>): Partial<PublicReviewView> {
  return {
    collegeAdmitted: c.college_admitted ?? view.collegeAdmitted,
    airRank: c.air_rank ? Number(c.air_rank) : view.airRank,
    examYear: c.exam_year ? Number(c.exam_year) : view.examYear,
    city: c.city ?? view.city,
  };
}

// ── pieces ─────────────────────────────────────────────────────────────────

function Heading({ children, refEl }: { children: React.ReactNode; refEl: React.RefObject<HTMLHeadingElement> }) {
  return (
    <Typography
      ref={refEl}
      tabIndex={-1}
      component="h1"
      variant="h5"
      sx={{ fontWeight: 700, mb: 1, outline: 'none', lineHeight: 1.3 }}
    >
      {children}
    </Typography>
  );
}

function FactsCard({ view, photoUrl, name }: { view: PublicReviewView; photoUrl: string | null; name: string }) {
  const result = view.airRank ? `AIR ${view.airRank}` : view.percentile != null ? `${view.percentile} percentile` : null;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: `${tk.radius}px`, borderColor: tk.line, display: 'flex', gap: 2, alignItems: 'center' }}>
      <Avatar
        src={photoUrl || undefined}
        alt={name}
        sx={{
          width: 72,
          height: 72,
          flexShrink: 0,
          fontSize: 28,
          fontWeight: 700,
          bgcolor: tk.navy700,
          color: tk.paper,
          // The avatar ring the public card uses, so the student sees how they will look.
          boxShadow: `0 0 0 3px ${tk.surface}, 0 0 0 5px ${tk.gold500}`,
        }}
      >
        {name.trim()[0]?.toUpperCase()}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 17 }}>{name}</Typography>
        <Typography variant="body2" color="text.secondary">
          {EXAM_LABEL[view.examType]}
          {view.examYear ? ` ${view.examYear}` : ''}
          {result ? ` · ${result}` : ''}
        </Typography>
        {view.collegeAdmitted && (
          <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
            {view.collegeAdmitted}
          </Typography>
        )}
        {(view.city || view.learningMode) && (
          <Typography variant="body2" color="text.secondary">
            {[view.city, view.learningMode ? `${view.learningMode[0].toUpperCase()}${view.learningMode.slice(1)} classes` : null]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

function Prompts() {
  return (
    <Typography component="ul" variant="body1" color="text.secondary" sx={{ pl: 2.5, my: 1.5, '& li': { mb: 0.5, lineHeight: 1.5 } }}>
      <li>What was hard before you joined Neram?</li>
      <li>What helped you the most?</li>
      <li>Where are you studying now?</li>
    </Typography>
  );
}

function VoiceRecorderPanel({
  recorder,
  composing,
  aiAvailable,
}: {
  recorder: ReturnType<typeof useVoiceRecorder>;
  composing: boolean;
  aiAvailable: boolean;
}) {
  const { status, elapsedMs, level, capMs } = recorder;

  if (!aiAvailable) {
    return (
      <Alert severity="info" sx={{ mt: 1 }}>
        Voice help is not available for this link right now. Please type your review.
      </Alert>
    );
  }

  if (composing) {
    return (
      <Box sx={{ mt: 2 }} aria-live="polite" aria-busy="true">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <AutoAwesomeIcon color="primary" />
          <Typography sx={{ fontWeight: 600 }}>Writing your review from what you said...</Typography>
        </Stack>
        <Skeleton height={22} />
        <Skeleton height={22} />
        <Skeleton height={22} width="80%" />
        <Skeleton height={22} width="60%" />
      </Box>
    );
  }

  const recording = status === 'recording';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 2, gap: 1.5 }}>
      <Box sx={{ position: 'relative', width: 112, height: 112 }}>
        {/* Live level ring. Decorative; the timer below carries the same news. */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            bgcolor: 'error.main',
            opacity: recording ? 0.18 : 0,
            transform: `scale(${recording ? 1 + level * 0.35 : 1})`,
            transition: 'transform 100ms linear, opacity 200ms',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none', transform: 'none' },
          }}
        />
        <Button
          variant="contained"
          color={recording ? 'error' : 'primary'}
          onClick={recording ? recorder.stop : recorder.start}
          disabled={status === 'requesting'}
          aria-label={recording ? 'Stop recording' : 'Start recording your review'}
          sx={{ position: 'absolute', inset: 8, minWidth: 0, borderRadius: '50%', boxShadow: 3 }}
        >
          {status === 'requesting' ? <CircularProgress size={32} color="inherit" /> : recording ? <StopIcon sx={{ fontSize: 44 }} /> : <MicIcon sx={{ fontSize: 48 }} />}
        </Button>
      </Box>
      <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} aria-live="polite">
        {recording ? `Listening ${clock(elapsedMs)} of ${clock(capMs)}. Tap to finish.` : status === 'requesting' ? 'Allow the microphone to start' : 'Tap to start'}
      </Typography>
      {recording && (
        <Button variant="text" onClick={recorder.cancel} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
      )}
      {status === 'denied' && (
        <Alert severity="warning" role="alert">
          The microphone is blocked. Allow it in your browser settings, or tap Prefer typing.
        </Alert>
      )}
      {status === 'unsupported' && (
        <Alert severity="info" role="alert">
          This browser cannot record. Please tap Prefer typing.
        </Alert>
      )}
      {status === 'error' && recorder.error && (
        <Alert severity="warning" role="alert">
          {recorder.error}
        </Alert>
      )}
    </Box>
  );
}

function ThanksScreen(props: {
  view: PublicReviewView;
  text: string;
  headingRef: React.RefObject<HTMLHeadingElement>;
  copied: boolean;
  googlePosted: boolean;
  onGoogle: () => void;
  onPosted: () => void;
  onSecondary: () => void;
  onEdit?: () => void;
}) {
  const { view, text, copied, googlePosted } = props;
  const google = view.targets.google;
  const secondary = view.targets.secondary;
  return (
    <>
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <CheckCircleIcon color="success" sx={{ fontSize: 56 }} />
        <Heading refEl={props.headingRef}>Thank you, {view.firstName}</Heading>
        <Typography color="text.secondary">
          {view.state === 'locked'
            ? 'Your review is with Neram Classes.'
            : 'Neram Classes will check your review and put it on the website soon.'}
        </Typography>
      </Box>

      {google && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, mb: 2 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
            Help other students find us
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
            Most parents check Google before they choose. Post the same review on our {google.centreName} Google page. It takes 20 seconds.
          </Typography>
          <Typography component="ol" variant="body2" sx={{ pl: 2.5, my: 0, mb: 1.5, '& li': { mb: 0.5, lineHeight: 1.5 } }}>
            <li>Tap the button. We copy your review for you.</li>
            <li>On Google, tap the stars and paste your review.</li>
            <li>Tap Post.</li>
          </Typography>
          <Button
            variant="contained"
            fullWidth
            endIcon={<OpenInNewIcon />}
            onClick={props.onGoogle}
            disabled={!text}
            sx={{ minHeight: 52 }}
          >
            Copy review and open Google
          </Button>
          {copied && (
            <Typography variant="body2" color="success.main" sx={{ mt: 1 }} role="status">
              Copied. Paste it on Google.
            </Typography>
          )}
          <Button
            variant={googlePosted ? 'text' : 'outlined'}
            fullWidth
            startIcon={googlePosted ? <VerifiedIcon /> : undefined}
            onClick={props.onPosted}
            disabled={googlePosted}
            sx={{ mt: 1, minHeight: 48 }}
          >
            {googlePosted ? 'Thank you for posting on Google' : 'I posted it on Google'}
          </Button>
        </Paper>
      )}

      {secondary && (
        <Button
          variant="text"
          fullWidth
          href={secondary.url}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewIcon />}
          onClick={props.onSecondary}
          sx={{ minHeight: 48 }}
        >
          Also review us on {PLATFORM_LABEL[secondary.platform]}
        </Button>
      )}

      {text && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Your review
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', mt: 0.5, lineHeight: 1.5 }}>{text}</Typography>
        </Box>
      )}

      <Stack spacing={1} sx={{ mt: 3 }}>
        {props.onEdit && (
          <Button variant="outlined" startIcon={<EditIcon />} onClick={props.onEdit} sx={{ minHeight: 48 }}>
            Edit my review
          </Button>
        )}
        <Button variant="text" href="/reviews" sx={{ minHeight: 48 }}>
          See what other students say
        </Button>
      </Stack>
    </>
  );
}

function ConsentBox({
  checked,
  onChange,
  label,
  error,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  error?: string;
}) {
  return (
    <Box>
      <FormControlLabel
        control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} sx={{ p: 1.5 }} />}
        label={label}
        sx={{ alignItems: 'center', mr: 0, minHeight: 48, '& .MuiFormControlLabel-label': { fontSize: 15, lineHeight: 1.4 } }}
      />
      {error && (
        <Typography variant="caption" color="error" role="alert" sx={{ display: 'block', ml: 6 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; inputMode?: 'numeric' | 'text' }) {
  return (
    <TextField
      label={props.label}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      fullWidth
      inputProps={{ inputMode: props.inputMode, maxLength: 120 }}
      sx={{ '& .MuiInputBase-root': { minHeight: 48, fontSize: 16 }, '& .MuiInputBase-input': { fontSize: 16 } }}
    />
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outlined" onClick={onClick} disabled={disabled} startIcon={<ArrowBackIcon />} sx={{ minHeight: 52, flexShrink: 0 }}>
      Back
    </Button>
  );
}

/** The main action, pinned to the bottom of the screen on phones where the thumb is. */
function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        position: { xs: 'sticky', sm: 'static' },
        bottom: 0,
        mt: 3,
        mx: { xs: -2, sm: 0 },
        px: { xs: 2, sm: 0 },
        py: { xs: 1.5, sm: 0 },
        pb: { xs: 'max(12px, env(safe-area-inset-bottom))', sm: 0 },
        bgcolor: tk.surface,
        borderTop: { xs: `1px solid ${tk.line}`, sm: 0 },
        display: 'flex',
        gap: 1,
        zIndex: 10,
      }}
    >
      {children}
    </Box>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: { xs: tk.surface, sm: tk.ground }, color: tk.ink }}>
      <Container sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2, sm: 5 }, maxWidth: 560 }} maxWidth={false}>
        <Box
          component="header"
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}
        >
          <Typography component="p" sx={eyebrowSx}>
            Neram Classes
          </Typography>
        </Box>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 0, sm: 3 },
            bgcolor: tk.surface,
            borderRadius: { xs: 0, sm: `${tk.radius}px` },
            border: { xs: 0, sm: `1px solid ${tk.line}` },
            overflowWrap: 'anywhere',
          }}
        >
          {children}
        </Paper>
      </Container>
    </Box>
  );
}

function LoadingShell() {
  return (
    <Shell>
      <Box aria-busy="true" aria-label="Opening your review link">
        <Skeleton width="70%" height={36} />
        <Skeleton width="90%" height={22} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={104} />
        <Skeleton variant="rounded" height={52} sx={{ mt: 4 }} />
      </Box>
    </Shell>
  );
}

function RefusedShell({ message }: { message: string }) {
  const help = useMemo(() => buildWhatsAppLink({ text: 'Hi Neram, my review link is not working. Please send me a new one.' }), []);
  return (
    <Shell>
      <Box sx={{ textAlign: 'center' }}>
        <ErrorOutlineIcon color="warning" sx={{ fontSize: 48 }} />
        <Typography component="h1" variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
          This link cannot be opened
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }} role="alert">
          {message}
        </Typography>
        <Stack spacing={1}>
          <Button variant="contained" href={help.href} target="_blank" rel="noopener noreferrer" sx={{ minHeight: 48 }}>
            Message Neram on WhatsApp
          </Button>
          <Button variant="text" startIcon={<RefreshIcon />} onClick={() => window.location.reload()} sx={{ minHeight: 48 }}>
            Try again
          </Button>
        </Stack>
      </Box>
    </Shell>
  );
}
