'use client';

import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@neram/ui';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

/**
 * Link an old Google Classroom email to this person (moved here from the old
 * detail header). Hidden once the person has a Nexus enrollment, as before.
 */
export default function ClassroomLinkControl({
  userId,
  linkedEmail,
  adminId,
  onChanged,
}: {
  userId: string;
  linkedEmail: string | null;
  adminId: string;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const link = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/users/${userId}/classroom-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomEmail: email.trim(), adminId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Could not link the classroom email.');
      }
      setEmail('');
      setEditing(false);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/users/${userId}/classroom-link`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Could not unlink the classroom email.');
      }
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      {linkedEmail ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <CheckCircleOutlineIcon sx={{ fontSize: 18, color: 'success.main' }} aria-hidden />
          <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
            Linked to <strong>{linkedEmail}</strong>
          </Typography>
          <Button
            color="error"
            size="small"
            onClick={unlink}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={14} /> : <LinkOffIcon />}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Unlink
          </Button>
        </Box>
      ) : editing ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Classroom email"
            placeholder="student@classroom.neramclasses.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputProps={{ inputMode: 'email' }}
            sx={{ width: { xs: '100%', sm: 340 } }}
            autoFocus
          />
          <Button
            variant="contained"
            onClick={link}
            disabled={!email.trim() || busy}
            sx={{ textTransform: 'none', minHeight: 44, boxShadow: 'none' }}
          >
            {busy ? 'Linking...' : 'Link'}
          </Button>
          <Button
            onClick={() => {
              setEditing(false);
              setEmail('');
              setError('');
            }}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Cancel
          </Button>
        </Box>
      ) : (
        <Button
          variant="outlined"
          startIcon={<LinkIcon />}
          onClick={() => setEditing(true)}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Link to a classroom email
        </Button>
      )}
      {error && (
        <Alert severity="error" role="alert" sx={{ mt: 1 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}
