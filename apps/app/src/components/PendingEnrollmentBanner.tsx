'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  IconButton,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import SchoolIcon from '@mui/icons-material/School';
import { useFirebaseAuth, getCurrentUser } from '@neram/auth';

interface PendingEnrollment {
  hasPending: boolean;
  enrollmentUrl?: string;
  courseName?: string;
  expiresAt?: string;
  studentName?: string;
}

function getDaysUntil(dateStr: string): number {
  const now = new Date();
  const expires = new Date(dateStr);
  return Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export default function PendingEnrollmentBanner() {
  const { user } = useFirebaseAuth();
  const [pending, setPending] = useState<PendingEnrollment | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check sessionStorage for dismissal
    const dismissedKey = 'dismissed_enrollment_banner';
    if (sessionStorage.getItem(dismissedKey)) {
      setDismissed(true);
      return;
    }

    const checkPending = async () => {
      try {
        const firebaseUser = getCurrentUser();
        const idToken = await firebaseUser?.getIdToken();
        if (!idToken) return;

        const res = await fetch('/api/enrollment/pending', {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (data.hasPending) {
          setPending(data);
        }
      } catch {
        // Silently fail - not critical
      }
    };

    checkPending();
  }, [user]);

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('dismissed_enrollment_banner', 'true');
  };

  if (!pending?.hasPending || dismissed) {
    return null;
  }

  const daysLeft = pending.expiresAt ? getDaysUntil(pending.expiresAt) : null;

  return (
    <Alert
      severity="warning"
      icon={<SchoolIcon />}
      action={
        <IconButton
          aria-label="dismiss"
          color="inherit"
          size="small"
          onClick={handleDismiss}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      }
      sx={{
        mb: 2,
        mx: { xs: 2, md: 0 },
        borderRadius: 1.5,
        alignItems: 'center',
        '& .MuiAlert-message': { flex: 1 },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: { xs: 1, sm: 2 }, width: '100%' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" fontWeight={600}>
            You have a pending enrollment{pending.courseName ? ` for ${pending.courseName}` : ''}.
          </Typography>
          {daysLeft !== null && (
            <Typography variant="caption" color="text.secondary">
              {daysLeft === 0
                ? 'Expires today!'
                : daysLeft === 1
                  ? 'Expires tomorrow'
                  : `Expires in ${daysLeft} days`}
            </Typography>
          )}
        </Box>
        <Button
          variant="contained"
          size="small"
          href={pending.enrollmentUrl}
          sx={{
            borderRadius: 1,
            textTransform: 'none',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            alignSelf: { xs: 'flex-start', sm: 'center' },
          }}
        >
          Complete Enrollment
        </Button>
      </Box>
    </Alert>
  );
}
