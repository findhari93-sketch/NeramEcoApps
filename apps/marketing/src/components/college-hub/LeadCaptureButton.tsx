'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography,
} from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import PincodeField from './PincodeField';
import { useCollegeLead } from './useCollegeLead';

interface LeadCaptureButtonProps {
  collegeId: string;
  collegeName: string;
}

export default function LeadCaptureButton({ collegeId, collegeName }: LeadCaptureButtonProps) {
  const { user, name, setName, phone, setPhone, consent, setConsent, submitting, error, success, submit } =
    useCollegeLead(collegeId);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [nataScore, setNataScore] = useState('');
  const [pincode, setPincode] = useState('');
  const [resolvedCity, setResolvedCity] = useState('');
  const [manualCity, setManualCity] = useState('');
  const [message, setMessage] = useState('');

  // Prefill the email from the Firebase profile (name and phone come from the hook).
  useEffect(() => {
    if (user?.email) setEmail((v) => v || user.email || '');
  }, [user]);

  const handleSubmit = () =>
    submit({ email, nataScore, city: resolvedCity || manualCity || null, message });

  if (success) {
    return (
      <Alert severity="success" icon={<SchoolIcon />}>
        Thanks for your interest in {collegeName}. The admissions team will be in touch soon.
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
          bgcolor: '#16a34a',
          '&:hover': { bgcolor: '#15803d' },
          borderRadius: 2,
          px: 3,
          fontWeight: 700,
          minHeight: 48,
        }}
        fullWidth
      >
        I&apos;m Interested, Get Admission Info
      </Button>

      <Dialog
        open={open}
        onClose={() => !submitting && setOpen(false)}
        maxWidth="xs"
        fullWidth
        fullScreen={typeof window !== 'undefined' && window.innerWidth < 600}
      >
        <DialogTitle>
          <Typography variant="h6" fontWeight={700} component="div">
            Apply to {collegeName}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Share your details and the college will contact you.
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            <TextField
              label="Your name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              size="small"
              autoFocus={!user?.name}
            />
            <TextField
              label="Mobile number *"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'numeric' }}
              helperText="10-digit Indian mobile number"
              autoFocus={Boolean(user?.name) && !phone}
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
              label="NATA score (optional)"
              value={nataScore}
              onChange={(e) => setNataScore(e.target.value)}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'decimal' }}
              helperText="Out of 200"
            />
            <PincodeField
              value={pincode}
              onChange={setPincode}
              onResolve={(resolved) => {
                setResolvedCity(resolved ? resolved.city : '');
              }}
              manualCityFallback={manualCity}
              onManualCityChange={setManualCity}
            />
            <TextField
              label="Anything to share? (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              size="small"
              multiline
              minRows={2}
              maxRows={4}
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
            {user && (
              <Typography variant="caption" color="text.secondary">
                Submitting as <strong>{user.email || user.name}</strong>. You can edit any field above.
              </Typography>
            )}
            {error && <Alert severity="error" sx={{ py: 0.5 }}>{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !consent}
            sx={{ bgcolor: '#16a34a', minHeight: 40, '&:hover': { bgcolor: '#15803d' } }}
          >
            {submitting ? <CircularProgress size={16} color="inherit" /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
