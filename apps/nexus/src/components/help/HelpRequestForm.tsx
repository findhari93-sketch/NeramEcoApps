'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  ImageUploadField,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { collectDeviceInfo } from '@/lib/device-collector';
import { getRecentErrors } from '@/lib/error-buffer';
import { compressForUpload } from '@/lib/issue-screenshot-upload';
import { HELP_PROBLEMS, isHelpProblem, normalizePhone, type HelpProblem } from '@/lib/support-contact';
import SupportContactButtons, { currentDeviceSummary } from './SupportContactButtons';

const TAP = 48;

type FieldErrors = Partial<Record<'name' | 'phone' | 'email' | 'problem' | 'screenshot', string>>;

interface HelpRequestFormProps {
  /** Where Back and Done go. Already checked to be a path inside Nexus. */
  returnTo: string;
  initialProblem: string | null;
}

async function uploadHelpScreenshot(file: File): Promise<{ url: string; path: string }> {
  const compressed = await compressForUpload(file);
  const form = new FormData();
  form.append('file', compressed, 'screenshot.jpg');
  const res = await fetch('/api/help/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.path !== 'string') {
    throw new Error(typeof data.error === 'string' ? data.error : 'The screenshot did not upload. You can still send your request.');
  }
  return { url: data.url, path: data.path };
}

/**
 * /help: the one way to reach staff from inside Nexus that does not need a
 * Microsoft sign-in. It lands in Admin's Support tickets and in the staff Help
 * Desk chat in Teams (see lib/help-request.ts).
 */
export default function HelpRequestForm({ returnTo, initialProblem }: HelpRequestFormProps) {
  const { user, getToken } = useNexusAuthContext();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<HelpProblem | null>(isHelpProblem(initialProblem) ? initialProblem : null);
  const [details, setDetails] = useState('');
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [shotPath, setShotPath] = useState<string | null>(null);
  const [website, setWebsite] = useState('');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ticketNumber: string | null; phone: string } | null>(null);

  const successRef = useRef<HTMLHeadingElement>(null);

  // Fill in what we already know about a signed-in student, once, without
  // overwriting anything they have typed.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!user || prefilled.current) return;
    prefilled.current = true;
    setName((v) => v || user.name || '');
    setPhone((v) => v || user.phone || '');
    setEmail((v) => v || user.email || '');
  }, [user]);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (name.trim().length < 2) next.name = 'Please enter your name.';
    if (!normalizePhone(phone)) next.phone = 'Please enter a 10 digit mobile number we can call.';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'That email address does not look right.';
    if (!problem) next.problem = 'Please choose what is wrong.';
    return next;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setFormError('Your phone is offline, so this cannot be sent. WhatsApp or call us instead.');
      return;
    }

    setSending(true);
    try {
      let authHeader: Record<string, string> = {};
      if (user) {
        const token = await getToken().catch(() => null);
        if (token) authHeader = { Authorization: `Bearer ${token}` };
      }
      let deviceInfo: Record<string, unknown> | undefined;
      try {
        deviceInfo = collectDeviceInfo() as unknown as Record<string, unknown>;
      } catch {
        deviceInfo = undefined;
      }

      const res = await fetch('/api/help', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          problem,
          details: details || undefined,
          screenshotPath: shotPath || undefined,
          pageUrl: returnTo,
          device: currentDeviceSummary(),
          appVersion: process.env.NEXT_PUBLIC_BUILD_STAMP,
          online: navigator.onLine,
          deviceInfo,
          consoleLogs: getRecentErrors(),
          website,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSent({ ticketNumber: data.ticketNumber ?? null, phone: normalizePhone(phone) ?? phone });
        return;
      }
      if (res.status === 400 && typeof data.field === 'string') {
        setErrors({ [data.field]: data.error } as FieldErrors);
        return;
      }
      setFormError(typeof data.error === 'string' ? data.error : 'We could not send that. Please WhatsApp or call us instead.');
    } catch {
      setFormError('We could not send that. Please WhatsApp or call us instead.');
    } finally {
      setSending(false);
    }
  };

  const backLink = (
    <IconButton component="a" href={returnTo} aria-label="Back" sx={{ width: TAP, height: TAP, ml: -1.5 }}>
      <ArrowBackIcon />
    </IconButton>
  );

  if (sent) {
    return (
      <Box sx={{ textAlign: 'center' }}>
        <CheckCircleOutlineIcon aria-hidden sx={{ fontSize: 56, color: 'success.main', mb: 1 }} />
        <Typography ref={successRef} tabIndex={-1} variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1, outline: 'none' }}>
          Sent to the Neram team
        </Typography>
        {sent.ticketNumber && (
          <Typography variant="body1" sx={{ mb: 1 }}>
            Your ticket number is <strong>{sent.ticketNumber}</strong>.
          </Typography>
        )}
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
          A person from the team will call or WhatsApp you on {sent.phone}. Keep your phone nearby.
        </Typography>
        <Button
          component="a"
          href={returnTo}
          variant="contained"
          fullWidth
          sx={{ minHeight: TAP, textTransform: 'none', fontSize: '1rem' }}
        >
          Done
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 3, mb: 1 }}>
          Need it sooner?
        </Typography>
        <SupportContactButtons problem={problem ?? 'other'} showNumber={false} />
      </Box>
    );
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit} sx={{ textAlign: 'left' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        {backLink}
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Get help
        </Typography>
      </Box>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.6 }}>
        Tell us what happened. A person from the Neram team will call or WhatsApp you. You do not need to be signed in.
      </Typography>

      <Stack spacing={2.5}>
        <TextField
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={!!errors.name}
          helperText={errors.name}
          autoComplete="name"
          required
          fullWidth
          inputProps={{ maxLength: 80 }}
        />
        <TextField
          label="Mobile number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={!!errors.phone}
          helperText={errors.phone || 'We will call or WhatsApp this number.'}
          type="tel"
          autoComplete="tel"
          required
          fullWidth
          inputProps={{ inputMode: 'tel', maxLength: 20 }}
        />
        <TextField
          label="Email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!errors.email}
          helperText={errors.email}
          type="email"
          autoComplete="email"
          fullWidth
          inputProps={{ inputMode: 'email', maxLength: 200 }}
        />

        <Box>
          <Typography id="help-problem-label" variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
            What is wrong?
          </Typography>
          <Box role="radiogroup" aria-labelledby="help-problem-label" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {HELP_PROBLEMS.map((p) => {
              const selected = problem === p.value;
              return (
                <Chip
                  key={p.value}
                  role="radio"
                  aria-checked={selected}
                  label={p.label}
                  clickable
                  // A tick as well as the fill, so the choice never rests on colour alone.
                  icon={selected ? <CheckIcon /> : undefined}
                  variant={selected ? 'filled' : 'outlined'}
                  onClick={() => {
                    setProblem(p.value);
                    setErrors((e) => ({ ...e, problem: undefined }));
                  }}
                  sx={{
                    minHeight: TAP,
                    borderRadius: 6,
                    fontSize: '0.95rem',
                    px: 0.5,
                    ...(selected && {
                      bgcolor: 'primary.main',
                      color: 'primary.contrastText',
                      '& .MuiChip-icon': { color: 'inherit' },
                      '&:hover, &.Mui-focusVisible': { bgcolor: 'primary.dark' },
                    }),
                  }}
                />
              );
            })}
          </Box>
          {errors.problem && (
            <Typography role="alert" variant="body2" color="error" sx={{ mt: 1 }}>
              {errors.problem}
            </Typography>
          )}
        </Box>

        <TextField
          label="What happened? (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          multiline
          minRows={3}
          fullWidth
          inputProps={{ maxLength: 2000 }}
          placeholder="For example: the app shows Can't connect to the site when I open it."
        />

        <ImageUploadField
          label="Screenshot (optional)"
          helperText="A screenshot of the error helps us fix it faster."
          value={shotUrl}
          onChange={(url) => {
            setShotUrl(url);
            if (!url) setShotPath(null);
          }}
          upload={async (file) => {
            const result = await uploadHelpScreenshot(file);
            setShotPath(result.path);
            return result;
          }}
          maxSizeMB={10}
          camera
          error={errors.screenshot}
        />

        {/* For bots only. People never see or reach it. */}
        <Box aria-hidden sx={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} name="website" />
          </label>
        </Box>

        {formError && (
          <Alert severity="error" role="alert">
            {formError}
          </Alert>
        )}

        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={sending}
          startIcon={sending ? <CircularProgress size={18} color="inherit" aria-hidden /> : <SendOutlinedIcon />}
          sx={{ minHeight: TAP, textTransform: 'none', fontSize: '1rem' }}
        >
          {sending ? 'Sending' : 'Send request'}
        </Button>

        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1, textAlign: 'center' }}>
            {formError ? 'Or reach us directly' : 'Prefer to talk? Reach us directly'}
          </Typography>
          <SupportContactButtons problem={problem ?? 'other'} />
        </Box>
      </Stack>
    </Box>
  );
}
