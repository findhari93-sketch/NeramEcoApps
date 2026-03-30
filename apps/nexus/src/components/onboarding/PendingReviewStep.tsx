'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  CircularProgress,
  Divider,
} from '@neram/ui';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';

interface PendingReviewStepProps {
  getToken: () => Promise<string | null>;
  onboardingStatus: string | null;
  onApproved: () => void;
}

const APP_ONBOARDING_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com'}/onboarding`;

export default function PendingReviewStep({
  getToken,
  onboardingStatus,
  onApproved,
}: PendingReviewStepProps) {
  const router = useRouter();
  const [nudging, setNudging] = useState(false);
  const [fromAppOnboarding, setFromAppOnboarding] = useState(false);
  const redirectedRef = useRef(false);

  // Check if user came from student app onboarding
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFromAppOnboarding(sessionStorage.getItem('nexus_from') === 'app-onboarding');
    }
  }, []);
  const [nudgeResult, setNudgeResult] = useState<{
    teamsLink?: string;
    whatsappLink?: string;
    error?: string;
    nextNudgeAt?: string;
  } | null>(null);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);

  // Calculate hours since submission
  const hoursSinceSubmission = submittedAt
    ? (Date.now() - submittedAt.getTime()) / (1000 * 60 * 60)
    : 0;

  const canNudge = hoursSinceSubmission >= 24;
  const showWhatsApp = hoursSinceSubmission >= 48;

  // Poll for approval every 30 seconds, redirect when approved
  useEffect(() => {
    if (onboardingStatus === 'approved') {
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        // Brief delay to show success message before redirecting
        const timer = setTimeout(() => {
          router.replace('/student/dashboard');
        }, 1500);
        return () => clearTimeout(timer);
      }
      return;
    }

    const interval = setInterval(() => {
      onApproved(); // This triggers a re-fetch of auth state
    }, 30000);

    return () => clearInterval(interval);
  }, [onboardingStatus, onApproved, router]);

  // Fetch submission time
  useEffect(() => {
    async function fetchDetails() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/onboarding`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.onboarding?.submitted_at) {
            setSubmittedAt(new Date(data.onboarding.submitted_at));
          }
        }
      } catch {
        // ignore
      }
    }
    fetchDetails();
  }, [getToken]);

  const handleNudge = async () => {
    setNudging(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/onboarding/nudge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.status === 429) {
        setNudgeResult({ error: 'Cooldown active', nextNudgeAt: data.nextNudgeAt });
      } else if (res.ok) {
        setNudgeResult({ teamsLink: data.teamsLink, whatsappLink: data.whatsappLink });
        // Open Teams chat
        if (data.teamsLink) {
          window.open(data.teamsLink, '_blank');
        }
      } else {
        setNudgeResult({ error: data.error || 'Failed to send reminder' });
      }
    } catch {
      setNudgeResult({ error: 'Failed to send reminder' });
    } finally {
      setNudging(false);
    }
  };

  if (onboardingStatus === 'approved') {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <CheckCircleOutlinedIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          You&apos;re All Set!
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Your documents have been verified. Redirecting to Nexus...
        </Typography>
        <CircularProgress size={24} />

        {fromAppOnboarding && (
          <Button
            variant="outlined"
            color="primary"
            href={APP_ONBOARDING_URL}
            startIcon={<ArrowBackOutlinedIcon />}
            sx={{
              mt: 3,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Return to Student App
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 2 }}>
      {/* Header */}
      <Box sx={{ textAlign: 'center' }}>
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            bgcolor: 'warning.50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <HourglassEmptyOutlinedIcon sx={{ fontSize: 40, color: 'warning.main' }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Under Review
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Your documents are being reviewed. You&apos;ll get full access once approved.
        </Typography>
        {submittedAt && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
            Submitted {submittedAt.toLocaleDateString()} at {submittedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        )}
      </Box>

      {/* Status card */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          textAlign: 'center',
        }}
      >
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          Need it reviewed faster?
        </Typography>

        {/* Nudge button */}
        <Button
          variant="contained"
          fullWidth
          disabled={!canNudge || nudging}
          onClick={handleNudge}
          startIcon={nudging ? <CircularProgress size={18} /> : <ChatOutlinedIcon />}
          sx={{
            py: 1.5,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
            mb: 1,
          }}
        >
          {nudging
            ? 'Sending...'
            : canNudge
              ? 'Send Reminder via Teams'
              : `Reminder available in ${Math.ceil(24 - hoursSinceSubmission)}h`}
        </Button>

        {!canNudge && (
          <Typography variant="caption" color="text.disabled">
            Automated notification was sent to reviewers. You can send a reminder after 24 hours.
          </Typography>
        )}

        {nudgeResult?.error && (
          <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 1 }}>
            {nudgeResult.error}
            {nudgeResult.nextNudgeAt && (
              <>
                {' '}— Next available: {new Date(nudgeResult.nextNudgeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </>
            )}
          </Typography>
        )}

        {/* WhatsApp fallback */}
        {showWhatsApp && (
          <>
            <Divider sx={{ my: 2 }}>
              <Typography variant="caption" color="text.disabled">or</Typography>
            </Divider>
            <Button
              variant="outlined"
              fullWidth
              color="success"
              startIcon={<WhatsAppIcon />}
              onClick={() => {
                const link = nudgeResult?.whatsappLink || 'https://wa.me/919176137043?text=' +
                  encodeURIComponent('Hi, I uploaded my documents on Nexus and am waiting for review. Could you please check?');
                window.open(link, '_blank');
              }}
              sx={{
                py: 1.5,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                borderColor: 'success.main',
              }}
            >
              Contact via WhatsApp
            </Button>
          </>
        )}
      </Paper>

      {/* Auto-refresh note */}
      <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center' }}>
        This page auto-refreshes. You&apos;ll be redirected once approved.
      </Typography>

      {/* Return to Student App button (when coming from app onboarding) */}
      {fromAppOnboarding && (
        <Button
          variant="outlined"
          color="primary"
          href={APP_ONBOARDING_URL}
          fullWidth
          startIcon={<ArrowBackOutlinedIcon />}
          sx={{
            py: 1.5,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 600,
          }}
        >
          Return to Student App
        </Button>
      )}
    </Box>
  );
}
