'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Stack,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@neram/ui';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { writeParentSession, readParentSession } from '@/lib/parent-session';

/**
 * Copy only. Deliberately NOT imported from lib/parent-password, which pulls in
 * node:crypto and cannot be bundled into a client component. The server is the
 * one that enforces the rule, and its rejection message is what the parent
 * actually sees if they get it wrong, so this string is a hint and never a gate.
 */
const PASSWORD_HINT = 'At least 8 characters, with a letter and a number.';

/**
 * First-login password change.
 *
 * The office issues a one-time password over WhatsApp, so it has travelled
 * through a channel nobody controls. This screen is what turns that into
 * something only the parent knows.
 *
 * Enforcement is server-side (getParentUser refuses every other parent route
 * until must_change_password clears), so a parent who navigates away from this
 * page simply gets 403s rather than quietly keeping the shared password.
 */
export default function ParentSetPasswordPage() {
  const router = useRouter();
  const { parentSession, signOut } = useNexusAuthContext();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!parentSession.active) router.replace('/parent/login');
  }, [parentSession.active, router]);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (newPassword !== confirmPassword) {
      setError('The two new passwords do not match.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const stored = readParentSession();
      const res = await fetch('/api/auth/parent/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${stored?.token ?? ''}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not change the password.');

      // The server bumped token_version, so the old token is already dead.
      // Store the freshly minted one or the very next request would 401.
      if (stored) {
        writeParentSession({
          ...stored,
          token: data.token,
          expiresAt: data.expiresAt,
          mustChangePassword: false,
        });
      }

      // Full reload so the auth context picks up the new token and the cleared
      // must-change flag from a single clean /api/auth/me.
      window.location.href = '/parent/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.');
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        py: 6,
        bgcolor: (theme) => (theme.palette.mode === 'light' ? '#FAFAFA' : 'background.default'),
      }}
    >
      <Card sx={{ maxWidth: 420, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={1} sx={{ mb: 3, textAlign: 'center' }}>
            <Box sx={{ color: 'primary.main' }}>
              <LockOutlinedIcon sx={{ fontSize: 40 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Choose your own password
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 15 }}>
              The office gave you a temporary password. Please replace it with one
              only you know.
            </Typography>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.5}>
              <TextField
                label="Temporary password"
                type={showPasswords ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                fullWidth
                required
                disabled={submitting}
                inputProps={{ style: { fontSize: 17 } }}
                sx={{ '& .MuiInputBase-root': { minHeight: 56 } }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPasswords((v) => !v)}
                        edge="end"
                        aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
                        sx={{ width: 48, height: 48 }}
                      >
                        {showPasswords ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <TextField
                label="New password"
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                required
                disabled={submitting}
                helperText={PASSWORD_HINT}
                inputProps={{ style: { fontSize: 17 } }}
                sx={{ '& .MuiInputBase-root': { minHeight: 56 } }}
              />

              <TextField
                label="Repeat new password"
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                fullWidth
                required
                disabled={submitting}
                error={mismatch}
                helperText={mismatch ? 'These do not match yet.' : ' '}
                inputProps={{ style: { fontSize: 17 } }}
                sx={{ '& .MuiInputBase-root': { minHeight: 56 } }}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={submitting || !currentPassword || !newPassword || mismatch}
                sx={{ minHeight: 52, fontSize: 16 }}
              >
                {submitting ? <CircularProgress size={24} color="inherit" /> : 'Save and continue'}
              </Button>

              <Button
                variant="text"
                fullWidth
                disabled={submitting}
                onClick={() => signOut()}
                sx={{ minHeight: 48 }}
              >
                Sign out
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
