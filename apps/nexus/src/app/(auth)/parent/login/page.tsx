'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * The parent front door.
 *
 * Kept as a separate page rather than a tab on the Microsoft login. A tabbed
 * sign-in invites students and teachers into the wrong tab, and every one of
 * those is a support call.
 *
 * Designed for the actual reader: a parent on a mid-range Android phone, often
 * reading in a second language, typing a code that was sent to them over
 * WhatsApp. Hence 17px inputs, 48px+ targets, a show-password toggle, and no
 * jargon anywhere in the copy.
 */
export default function ParentLoginPage() {
  const router = useRouter();
  const { parentLogin, parentSession } = useNexusAuthContext();

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: skip the form. Sends them wherever they actually belong,
  // which is the password screen if they still owe us a change.
  useEffect(() => {
    if (parentSession.active) {
      router.replace(parentSession.mustChangePassword ? '/parent/set-password' : '/parent/dashboard');
    }
  }, [parentSession.active, parentSession.mustChangePassword, router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const session = await parentLogin(loginId, password);
      router.replace(session.mustChangePassword ? '/parent/set-password' : '/parent/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
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
              <FamilyRestroomOutlinedIcon sx={{ fontSize: 40 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Parent sign in
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 15 }}>
              Use the login ID and password the Neram office gave you.
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
                label="Login ID"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                fullWidth
                required
                disabled={submitting}
                placeholder="e.g. arun.p4821"
                inputProps={{ style: { fontSize: 17 } }}
                sx={{ '& .MuiInputBase-root': { minHeight: 56 } }}
              />

              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                fullWidth
                required
                disabled={submitting}
                inputProps={{ style: { fontSize: 17 } }}
                sx={{ '& .MuiInputBase-root': { minHeight: 56 } }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((v) => !v)}
                        edge="end"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        sx={{ width: 48, height: 48 }}
                      >
                        {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />

              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={submitting || !loginId || !password}
                sx={{ minHeight: 52, fontSize: 16 }}
              >
                {submitting ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}
              </Button>
            </Stack>
          </Box>

          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 3, textAlign: 'center', fontSize: 14 }}
          >
            Forgot your password? Contact the Neram office and we will issue a new one.
          </Typography>

          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center', fontSize: 14 }}>
            <Link href="/login" style={{ color: 'inherit' }}>
              Student or teacher? Sign in with Microsoft
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
