'use client';

import { useState, useEffect } from 'react';
import {
  Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Stack, Alert, CircularProgress, Typography, Checkbox,
  FormControlLabel, Box,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';

interface LeadCaptureButtonProps {
  collegeId: string;
  collegeName: string;
}

export default function LeadCaptureButton({ collegeId, collegeName }: LeadCaptureButtonProps) {
  const [windowActive, setWindowActive] = useState<boolean | null>(null); // null = loading
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nataScore, setNataScore] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/colleges/lead-window-status?college_id=${collegeId}`)
      .then((r) => r.json())
      .then((j) => setWindowActive(j.active === true))
      .catch(() => setWindowActive(false));
  }, [collegeId]);

  const handleSubmit = async () => {
    if (!name || !phone || !consent) {
      setError('Please fill in your name, phone number, and agree to share details.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/colleges/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          name, phone,
          email: email || null,
          nata_score: nataScore ? parseFloat(nataScore) : null,
          city: city || null,
          consent_given: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Still loading — show skeleton placeholder
  if (windowActive === null) {
    return (
      <Box
        sx={{
          height: 48, bgcolor: 'grey.100', borderRadius: 2,
          animation: 'pulse 1.5s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.4 },
          },
        }}
      />
    );
  }

  // Lead window not active — show informational notice instead
  if (!windowActive) {
    return (
      <Box
        sx={{
          p: 2, border: '1px solid', borderColor: 'divider',
          borderRadius: 2, bgcolor: 'grey.50', textAlign: 'center',
        }}
      >
        <NotificationsOffIcon sx={{ fontSize: 28, color: 'text.disabled', mb: 0.5 }} />
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          Lead inquiries open during admission season
        </Typography>
        <Typography variant="caption" color="text.secondary">
          (June to September each year)
        </Typography>
      </Box>
    );
  }

  if (success) {
    return (
      <Alert severity="success" icon={<SchoolIcon />}>
        Your interest has been registered. The college admissions team will contact you shortly.
      </Alert>
    );
  }

  return (
    <>
      <Button
        variant="contained"
        size="large"
        startIcon={<SchoolIcon />}
        onClick={() => setOpen(true)}
        sx={{
          bgcolor: '#16a34a', '&:hover': { bgcolor: '#15803d' },
          borderRadius: 2, px: 3, fontWeight: 700,
        }}
        fullWidth
      >
        I&apos;m Interested — Get Admission Info
      </Button>

      <Dialog open={open} onClose={() => !submitting && setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Typography variant="h6" fontWeight={700}>Apply to {collegeName}</Typography>
          <Typography variant="body2" color="text.secondary">
            Share your details and the college will contact you.
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <TextField
              label="Your Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label="Mobile Number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'numeric' }}
              helperText="10-digit Indian mobile number"
            />
            <TextField
              label="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              size="small"
              type="email"
            />
            <TextField
              label="NATA Score (optional)"
              value={nataScore}
              onChange={(e) => setNataScore(e.target.value)}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'decimal' }}
              helperText="Out of 200"
            />
            <TextField
              label="Your City (optional)"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              fullWidth
              size="small"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="caption">
                  I agree to share my name, phone, and score with {collegeName} for admission inquiries.
                </Typography>
              }
            />
            {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !consent}
            sx={{ bgcolor: '#16a34a' }}
          >
            {submitting ? <CircularProgress size={16} /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
