'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  Alert,
  CircularProgress,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Correct a parent's digest email or phone after the login was created.
 *
 * These details deliberately live on nexus_parent_credentials rather than on
 * users.email / users.phone, which are unique across all four apps and are
 * usually already taken by the lead row the parent themselves created on the
 * enquiry form. That fixed provisioning, but it also made creation the only
 * writer, so this dialog is what stops a typo being permanent.
 *
 * Changing contact details does NOT sign the parent out. Only regenerate and
 * revoke bump token_version.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  parentUserId: string;
  studentName: string;
  currentEmail: string | null;
  currentPhone: string | null;
  onDone: () => void;
}

export default function ParentContactDialog({
  open,
  onClose,
  parentUserId,
  studentName,
  currentEmail,
  currentPhone,
  onDone,
}: Props) {
  const { getToken } = useNexusAuthContext();

  const [email, setEmail] = useState(currentEmail || '');
  const [phone, setPhone] = useState(currentPhone || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reopening after a save elsewhere should show what is actually stored, not
  // whatever was last typed into a closed dialog.
  useEffect(() => {
    if (open) {
      setEmail(currentEmail || '');
      setPhone(currentPhone || '');
      setError(null);
    }
  }, [open, currentEmail, currentPhone]);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/parent/access/${parentUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'update_contact', email, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the contact details.');
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the contact details.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Contact details</DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
            How we reach {studentName.split(' ')[0]}&apos;s parent. This does not
            change how they sign in, and saving it will not sign them out.
          </Typography>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            helperText="Needed only if they should receive the weekly digest. Clear it to stop sending."
            fullWidth
          />
          <TextField
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            helperText="A 10-digit mobile is saved with +91."
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={submitting}
          sx={{ minHeight: 48 }}
        >
          {submitting ? <CircularProgress size={22} color="inherit" /> : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
