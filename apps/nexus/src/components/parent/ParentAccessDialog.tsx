'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Typography,
  Box,
  Alert,
  IconButton,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  alpha,
} from '@neram/ui';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Create or regenerate a parent login, and reveal the one-time password.
 *
 * The reveal is the whole point of this component. The password is never stored
 * in plaintext and cannot be recovered, so the UI has to make staff copy it
 * before they can close the dialog, and has to explain WHY it is unrecoverable.
 * Without that explanation, the first lost password becomes a support call
 * asking us to look it up.
 */

export interface ParentAccessResult {
  loginId: string;
  tempPassword: string;
  parent?: { id: string; name: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Null when regenerating (the parent already exists). */
  studentId: string | null;
  studentName: string;
  /** Set to regenerate an existing parent's password instead of creating one. */
  regenerateParentUserId?: string | null;
  onDone: () => void;
}

export default function ParentAccessDialog({
  open,
  onClose,
  studentId,
  studentName,
  regenerateParentUserId,
  onDone,
}: Props) {
  const { getToken } = useNexusAuthContext();
  const isRegenerate = !!regenerateParentUserId;

  const [relationship, setRelationship] = useState('parent');
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParentAccessResult | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  function reset() {
    setRelationship('parent');
    setParentName('');
    setEmail('');
    setPhone('');
    setError(null);
    setResult(null);
    setAcknowledged(false);
    setCopied(false);
    setSubmitting(false);
  }

  function handleClose() {
    // Once a password has been revealed, closing is gated on the acknowledgement
    // so it cannot be dismissed by a stray tap before anyone has written it down.
    if (result && !acknowledged) return;
    reset();
    onClose();
    if (result) onDone();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getToken();
      const res = isRegenerate
        ? await fetch(`/api/parent/access/${regenerateParentUserId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'regenerate' }),
          })
        : await fetch('/api/parent/access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ studentId, relationship, parentName, email, phone }),
          });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create parent access.');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create parent access.');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyBoth() {
    if (!result) return;
    const text = `Neram parent login\nLogin ID: ${result.loginId}\nPassword: ${result.tempPassword}\nSign in at: ${window.location.origin}/parent/login`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        {result
          ? 'Copy these details now'
          : isRegenerate
            ? 'Regenerate password'
            : `Create parent access`}
        {(!result || acknowledged) && (
          <IconButton
            onClick={handleClose}
            sx={{ position: 'absolute', right: 8, top: 8, width: 48, height: 48 }}
            aria-label="Close"
          >
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {result ? (
          <Stack spacing={2}>
            <Alert severity="warning" sx={{ fontSize: 14 }}>
              This password is shown once and is never stored. We cannot look it
              up later. Copy it now, and if it is lost use Regenerate.
            </Alert>

            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: (t) => alpha(t.palette.primary.main, 0.07),
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                Login ID
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700, mb: 1.5 }}>
                {result.loginId}
              </Typography>

              <Typography variant="caption" color="text.secondary" display="block">
                Temporary password
              </Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 700 }}>
                {result.tempPassword}
              </Typography>
            </Box>

            <Button
              variant="outlined"
              startIcon={<ContentCopyOutlinedIcon />}
              onClick={copyBoth}
              fullWidth
              sx={{ minHeight: 48 }}
            >
              {copied ? 'Copied' : 'Copy login ID and password'}
            </Button>

            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 14 }}>
              The parent will be asked to choose their own password the first
              time they sign in.
            </Typography>

            <FormControlLabel
              control={
                <Checkbox
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
              }
              label="I have saved these details"
            />
          </Stack>
        ) : isRegenerate ? (
          <Typography sx={{ fontSize: 15 }}>
            This issues a new temporary password for {studentName}&apos;s parent and
            signs them out of any device they are currently using. Their login ID
            does not change.
          </Typography>
        ) : (
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              label="Parent name"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder={`${studentName.split(' ')[0]}'s parent`}
              helperText="Leave blank to use the placeholder shown."
              fullWidth
            />
            <TextField
              select
              label="Relationship"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              fullWidth
            >
              <MenuItem value="parent">Parent</MenuItem>
              <MenuItem value="guardian">Guardian</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
            <TextField
              label="Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              helperText="Needed only if they should receive the weekly digest. Safe to reuse an address already on file for the family."
              fullWidth
            />
            <TextField
              label="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              helperText="A 10-digit mobile is saved with +91."
              fullWidth
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        {result ? (
          <Button
            variant="contained"
            onClick={handleClose}
            disabled={!acknowledged}
            fullWidth
            sx={{ minHeight: 48 }}
          >
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} sx={{ minHeight: 48 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting}
              sx={{ minHeight: 48 }}
            >
              {submitting ? (
                <CircularProgress size={22} color="inherit" />
              ) : isRegenerate ? (
                'Regenerate'
              ) : (
                'Create access'
              )}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
