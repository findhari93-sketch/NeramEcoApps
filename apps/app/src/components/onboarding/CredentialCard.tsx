// @ts-nocheck
'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Skeleton,
  Snackbar,
} from '@neram/ui';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import TimerIcon from '@mui/icons-material/Timer';
import LockIcon from '@mui/icons-material/Lock';
import EmailIcon from '@mui/icons-material/Email';
import KeyIcon from '@mui/icons-material/Key';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

export interface CredentialData {
  hasCredentials: boolean;
  expired?: boolean;
  credentialId?: string;
  email?: string;
  maskedPassword?: string;
  viewedAt?: string;
  autoDestroyAt?: string;
  publishedAt?: string;
  credentialType?: string;
}

function useCountdown(targetDate: string | null | undefined) {
  const [timeLeft, setTimeLeft] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft('');
      return;
    }

    const update = () => {
      const now = Date.now();
      const target = new Date(targetDate).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft('Expired');
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m left`);
      } else if (minutes > 0) {
        setTimeLeft(`${minutes}m ${seconds}s left`);
      } else {
        setTimeLeft(`${seconds}s left`);
      }
    };

    update();
    intervalRef.current = setInterval(update, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetDate]);

  return timeLeft;
}

interface CredentialCardProps {
  credential: CredentialData | null;
  credentialLoading: boolean;
  getIdToken: () => Promise<string | null>;
  onCredentialChange: () => void;
  showDestroyButton?: boolean;
}

export default function CredentialCard({
  credential,
  credentialLoading,
  getIdToken,
  onCredentialChange,
  showDestroyButton = true,
}: CredentialCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [destroying, setDestroying] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  const countdown = useCountdown(credential?.autoDestroyAt);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar(`${label} copied`);
    } catch {
      setSnackbar('Copy failed');
    }
  };

  const handleReveal = async () => {
    if (showPassword && revealedPassword) {
      setShowPassword(false);
      return;
    }

    setRevealing(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/credentials', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'reveal',
          credentialId: credential?.credentialId,
        }),
      });
      if (!res.ok) throw new Error('Failed to reveal');
      const data = await res.json();
      setRevealedPassword(data.password);
      setShowPassword(true);
    } catch {
      setSnackbar('Failed to reveal password');
    } finally {
      setRevealing(false);
    }
  };

  const handleDestroy = async () => {
    if (!confirmDestroy) {
      setConfirmDestroy(true);
      return;
    }

    setDestroying(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/credentials', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ credentialId: credential?.credentialId }),
      });
      if (!res.ok) throw new Error('Failed to destroy');
      setSnackbar('Credentials destroyed');
      setConfirmDestroy(false);
      onCredentialChange();
    } catch {
      setSnackbar('Failed to destroy credentials');
    } finally {
      setDestroying(false);
    }
  };

  if (credentialLoading) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (!credential) return null;

  if (!credential.hasCredentials && credential.expired) {
    return (
      <Box
        sx={{
          mt: 1.5, p: 2, borderRadius: 2,
          bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.light',
        }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <TimerIcon sx={{ fontSize: 20, color: 'warning.main' }} />
          <Typography variant="body2" fontWeight={600} color="warning.dark">
            Credentials Expired
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" mb={1.5}>
          Your login credentials have expired for security. Contact support to request new ones.
        </Typography>
        <Button
          size="small"
          variant="contained"
          color="success"
          startIcon={<WhatsAppIcon sx={{ fontSize: 16 }} />}
          href={`https://wa.me/916380194614?text=${encodeURIComponent(
            'Hi, my Teams login credentials have expired. Could you please share new ones?'
          )}`}
          target="_blank"
          sx={{
            borderRadius: 1, textTransform: 'none', fontWeight: 600,
            fontSize: '0.8rem', minHeight: 48, bgcolor: '#25D366',
            '&:hover': { bgcolor: '#1DA851' },
          }}
        >
          Request New Credentials
        </Button>
      </Box>
    );
  }

  if (!credential.hasCredentials) {
    return (
      <Box
        sx={{
          mt: 1.5, p: 2, borderRadius: 2,
          bgcolor: 'grey.50', border: '1px dashed', borderColor: 'grey.300',
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <HourglassEmptyIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            Waiting for admin to share your login credentials...
          </Typography>
        </Box>
      </Box>
    );
  }

  const displayPassword = showPassword && revealedPassword ? revealedPassword : credential.maskedPassword;

  return (
    <Box
      sx={{
        mt: 1.5, p: 2, borderRadius: 2,
        bgcolor: '#f0f7ff', border: '1px solid', borderColor: 'primary.light',
      }}
    >
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
        <Box display="flex" alignItems="center" gap={0.75}>
          <LockIcon sx={{ fontSize: 18, color: 'primary.main' }} />
          <Typography variant="body2" fontWeight={700} color="primary.dark">
            Your Teams Login
          </Typography>
        </Box>
        {countdown && countdown !== 'Expired' && (
          <Chip
            icon={<TimerIcon sx={{ fontSize: 14 }} />}
            label={countdown}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ fontSize: '0.7rem', height: 24, fontWeight: 600 }}
          />
        )}
      </Box>

      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, mb: 1,
          p: 1.25, borderRadius: 1.5, bgcolor: 'background.paper',
          border: '1px solid', borderColor: 'divider',
        }}
      >
        <EmailIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography
          variant="body2"
          sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all' }}
        >
          {credential.email}
        </Typography>
        <IconButton
          size="small"
          onClick={() => copyToClipboard(credential.email || '', 'Email')}
          sx={{ minWidth: 40, minHeight: 40 }}
          aria-label="Copy email"
        >
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, mb: 1.5,
          p: 1.25, borderRadius: 1.5, bgcolor: 'background.paper',
          border: '1px solid', borderColor: 'divider',
        }}
      >
        <KeyIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography
          variant="body2"
          sx={{
            flex: 1, fontFamily: 'monospace', fontSize: '0.85rem',
            letterSpacing: showPassword ? 'normal' : '0.15em',
          }}
        >
          {displayPassword}
        </Typography>
        <IconButton
          size="small"
          onClick={handleReveal}
          disabled={revealing}
          sx={{ minWidth: 40, minHeight: 40 }}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {revealing ? (
            <CircularProgress size={16} />
          ) : showPassword ? (
            <VisibilityOffIcon sx={{ fontSize: 16 }} />
          ) : (
            <VisibilityIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
        {showPassword && revealedPassword && (
          <IconButton
            size="small"
            onClick={() => copyToClipboard(revealedPassword, 'Password')}
            sx={{ minWidth: 40, minHeight: 40 }}
            aria-label="Copy password"
          >
            <ContentCopyIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </Box>

      {showDestroyButton && (
        <Box display="flex" gap={1} flexWrap="wrap">
          {!confirmDestroy ? (
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteForeverIcon sx={{ fontSize: 16 }} />}
              onClick={handleDestroy}
              sx={{ borderRadius: 1, textTransform: 'none', fontSize: '0.75rem', minHeight: 40 }}
            >
              Destroy Credentials
            </Button>
          ) : (
            <Box display="flex" gap={0.5} alignItems="center">
              <Typography variant="caption" color="error.main" fontWeight={600}>
                Are you sure?
              </Typography>
              <Button
                size="small" variant="contained" color="error"
                onClick={handleDestroy} disabled={destroying}
                sx={{ borderRadius: 1, textTransform: 'none', fontSize: '0.75rem', minHeight: 40, minWidth: 64 }}
              >
                {destroying ? 'Destroying...' : 'Yes, Destroy'}
              </Button>
              <Button
                size="small" variant="text"
                onClick={() => setConfirmDestroy(false)}
                sx={{ borderRadius: 1, textTransform: 'none', fontSize: '0.75rem', minHeight: 40 }}
              >
                Cancel
              </Button>
            </Box>
          )}
        </Box>
      )}

      {credential.viewedAt && (
        <Typography variant="caption" color="text.disabled" display="block" mt={1}>
          First viewed {new Date(credential.viewedAt).toLocaleString()}. Credentials auto-destroy after 24 hours for security.
        </Typography>
      )}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2000}
        onClose={() => setSnackbar('')}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
