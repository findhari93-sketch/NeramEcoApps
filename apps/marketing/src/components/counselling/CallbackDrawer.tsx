'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  MenuItem,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HeadsetMicIcon from '@mui/icons-material/HeadsetMic';

export interface CallbackDrawerProps {
  ctaLabel?: string;
  drawerTitle?: string;
  drawerIntro?: string;
  successHeading?: string;
  successMessage?: string;
  context: string;
  queryType: string;
  courseInterest?: string;
  cutoffCalculatorUrl?: string;
  collegePredictorUrl?: string;
  prefillNotes?: string;
  variant?: 'sticky' | 'inline';
}

const PREFERRED_SLOTS = [
  { value: 'morning', label: 'Morning (9 AM to 12 PM)' },
  { value: 'afternoon', label: 'Afternoon (12 PM to 4 PM)' },
  { value: 'evening', label: 'Evening (4 PM to 7 PM)' },
] as const;

const CLASS_OPTIONS = ['Class 11', 'Class 12', 'Repeater (12 done)', 'Diploma', 'Other'];

export default function CallbackDrawer({
  ctaLabel = 'Get Counselling Guidance',
  drawerTitle = 'Free Counselling Call',
  drawerIntro = 'Talk to a counsellor about eligibility, college choice, and counselling rounds. Free, no obligation.',
  successHeading = 'Got it!',
  successMessage = 'Our counsellor will call you back within 24 hours.',
  context,
  queryType,
  courseInterest = 'nata',
  cutoffCalculatorUrl = 'https://app.neramclasses.com/tools/nata/cutoff-calculator',
  collegePredictorUrl = 'https://app.neramclasses.com/tools/counseling/college-predictor',
  prefillNotes,
  variant = 'sticky',
}: CallbackDrawerProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [classLevel, setClassLevel] = useState('');
  const [slot, setSlot] = useState<'' | 'morning' | 'afternoon' | 'evening'>('');
  const [notes, setNotes] = useState(prefillNotes || '');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stickyVisible, setStickyVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    if (variant !== 'sticky') return;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 200) {
        setStickyVisible(true);
      } else if (y > lastScrollY + 8) {
        setStickyVisible(false);
      } else if (y < lastScrollY - 8) {
        setStickyVisible(true);
      }
      setLastScrollY(y);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [lastScrollY, variant]);

  useEffect(() => {
    if (prefillNotes) setNotes(prefillNotes);
  }, [prefillNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fullNotes = [
        notes?.trim(),
        classLevel ? `Class: ${classLevel}` : '',
        `Source: ${context}`,
        typeof window !== 'undefined' ? `Page: ${window.location.pathname}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      const res = await fetch('/api/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          preferred_slot: slot || undefined,
          course_interest: courseInterest,
          query_type: queryType,
          notes: fullNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not submit. Please try again.');
        return;
      }
      setSuccess(true);
      setName('');
      setPhone('');
      setEmail('');
      setClassLevel('');
      setSlot('');
      setNotes(prefillNotes || '');
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const triggerStyles =
    variant === 'sticky'
      ? {
          position: 'fixed' as const,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1100,
          p: 1.5,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
          display: { xs: 'block', md: 'none' },
          transform: stickyVisible ? 'translateY(0)' : 'translateY(110%)',
          transition: 'transform 200ms ease',
        }
      : { display: 'block' };

  return (
    <>
      <Box sx={triggerStyles}>
        <Button
          fullWidth
          size="large"
          variant="contained"
          startIcon={<HeadsetMicIcon />}
          onClick={() => setOpen(true)}
          sx={{
            minHeight: 48,
            fontWeight: 700,
            borderRadius: 2,
          }}
        >
          {ctaLabel}
        </Button>
      </Box>

      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '90vh',
            mx: { xs: 0, md: 'auto' },
            width: { xs: '100%', md: 480 },
          },
        }}
      >
        <Box sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="h6" fontWeight={800}>
              {success ? successHeading : drawerTitle}
            </Typography>
            <IconButton onClick={() => setOpen(false)} size="small" aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Stack>

          {success ? (
            <Stack spacing={2}>
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                {successMessage}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                In the meantime, try our free tools to estimate your cutoff and find matching colleges.
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  variant="outlined"
                  href={cutoffCalculatorUrl}
                  target="_blank"
                  rel="noopener"
                >
                  Cutoff Calculator
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  href={collegePredictorUrl}
                  target="_blank"
                  rel="noopener"
                >
                  College Predictor
                </Button>
              </Stack>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </Stack>
          ) : (
            <Stack component="form" onSubmit={handleSubmit} spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                {drawerIntro}
              </Typography>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                fullWidth
                size="medium"
                inputProps={{ minLength: 2, maxLength: 80 }}
              />
              <TextField
                label="Mobile (10-digit Indian)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                fullWidth
                size="medium"
                type="tel"
                inputProps={{ inputMode: 'numeric', pattern: '[6-9][0-9]{9}' }}
                helperText="We will call from a Neram Classes counsellor."
              />
              <TextField
                label="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                size="medium"
                type="email"
              />
              <TextField
                label="Class"
                value={classLevel}
                onChange={(e) => setClassLevel(e.target.value)}
                select
                fullWidth
                size="medium"
              >
                {CLASS_OPTIONS.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Preferred call time (optional)"
                value={slot}
                onChange={(e) => setSlot(e.target.value as typeof slot)}
                select
                fullWidth
                size="medium"
              >
                <MenuItem value="">Anytime</MenuItem>
                {PREFERRED_SLOTS.map((s) => (
                  <MenuItem key={s.value} value={s.value}>
                    {s.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="What do you want help with? (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                maxRows={4}
                inputProps={{ maxLength: 400 }}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
                sx={{ minHeight: 48, fontWeight: 700, borderRadius: 2 }}
              >
                {submitting ? 'Sending...' : 'Request Callback'}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                By submitting, you agree to be contacted by Neram Classes.
              </Typography>
            </Stack>
          )}
        </Box>
      </Drawer>
    </>
  );
}
