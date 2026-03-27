// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Button,
  LinearProgress,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  IconButton,
  Skeleton,
  Snackbar,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import LaptopIcon from '@mui/icons-material/Laptop';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import AppleIcon from '@mui/icons-material/Apple';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import CelebrationIcon from '@mui/icons-material/Celebration';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import TimerIcon from '@mui/icons-material/Timer';
import LockIcon from '@mui/icons-material/Lock';
import EmailIcon from '@mui/icons-material/Email';
import KeyIcon from '@mui/icons-material/Key';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { getFirebaseAuth } from '@neram/auth';

// ─── Device Detection ───

function getDeviceType(): 'android' | 'ios' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}

// ─── Icon Map ───

const ICON_MAP: Record<string, React.ElementType> = {
  WhatsApp: WhatsAppIcon,
  Laptop: LaptopIcon,
  Groups: GroupsIcon,
  Person: PersonIcon,
};

const DEVICE_LABELS: Record<string, { icon: React.ElementType; label: string }> = {
  android: { icon: PhoneAndroidIcon, label: 'Android' },
  ios: { icon: AppleIcon, label: 'iPhone / iPad' },
  desktop: { icon: DesktopWindowsIcon, label: 'Desktop' },
};

// ─── Types ───

interface OnboardingStep {
  id: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_type: string | null;
  status: string;
  step_definition: {
    step_key: string;
    title: string;
    description: string | null;
    icon_name: string | null;
    action_type: 'link' | 'in_app' | 'manual';
    action_config: Record<string, any>;
    display_order: number;
    is_required: boolean;
  };
}

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'need_help';

interface CredentialData {
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

// ─── Status Colors ───

const STATUS_CONFIG: Record<StepStatus, { color: string; bgcolor: string; label: string }> = {
  pending: { color: 'text.secondary', bgcolor: 'grey.100', label: 'Not Started' },
  in_progress: { color: 'info.main', bgcolor: 'info.50', label: 'In Progress' },
  completed: { color: 'success.main', bgcolor: 'success.50', label: 'Done' },
  need_help: { color: 'warning.main', bgcolor: 'warning.50', label: 'Need Help' },
};

// ─── Countdown Helper ───

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

// ─── Credential Card ───

function CredentialCard({
  credential,
  credentialLoading,
  getIdToken,
  onCredentialChange,
}: {
  credential: CredentialData | null;
  credentialLoading: boolean;
  getIdToken: () => Promise<string | null>;
  onCredentialChange: () => void;
}) {
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

  // Loading state
  if (credentialLoading) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  // No credential data fetched yet
  if (!credential) return null;

  // Expired state
  if (!credential.hasCredentials && credential.expired) {
    return (
      <Box
        sx={{
          mt: 1.5,
          p: 2,
          borderRadius: 2,
          bgcolor: 'warning.50',
          border: '1px solid',
          borderColor: 'warning.light',
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
            borderRadius: 1,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
            minHeight: 48,
            bgcolor: '#25D366',
            '&:hover': { bgcolor: '#1DA851' },
          }}
        >
          Request New Credentials
        </Button>
      </Box>
    );
  }

  // Not published yet
  if (!credential.hasCredentials) {
    return (
      <Box
        sx={{
          mt: 1.5,
          p: 2,
          borderRadius: 2,
          bgcolor: 'grey.50',
          border: '1px dashed',
          borderColor: 'grey.300',
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

  // Active credentials — show the vault card
  const displayPassword = showPassword && revealedPassword ? revealedPassword : credential.maskedPassword;

  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        bgcolor: '#f0f7ff',
        border: '1px solid',
        borderColor: 'primary.light',
      }}
    >
      {/* Header with timer */}
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

      {/* Email row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1,
          p: 1.25,
          borderRadius: 1.5,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <EmailIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            wordBreak: 'break-all',
          }}
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

      {/* Password row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          p: 1.25,
          borderRadius: 1.5,
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <KeyIcon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: '0.85rem',
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

      {/* Action buttons */}
      <Box display="flex" gap={1} flexWrap="wrap">
        {!confirmDestroy ? (
          <Button
            size="small"
            variant="outlined"
            color="error"
            startIcon={<DeleteForeverIcon sx={{ fontSize: 16 }} />}
            onClick={handleDestroy}
            sx={{
              borderRadius: 1,
              textTransform: 'none',
              fontSize: '0.75rem',
              minHeight: 40,
            }}
          >
            Destroy Credentials
          </Button>
        ) : (
          <Box display="flex" gap={0.5} alignItems="center">
            <Typography variant="caption" color="error.main" fontWeight={600}>
              Are you sure?
            </Typography>
            <Button
              size="small"
              variant="contained"
              color="error"
              onClick={handleDestroy}
              disabled={destroying}
              sx={{
                borderRadius: 1,
                textTransform: 'none',
                fontSize: '0.75rem',
                minHeight: 40,
                minWidth: 64,
              }}
            >
              {destroying ? 'Destroying...' : 'Yes, Destroy'}
            </Button>
            <Button
              size="small"
              variant="text"
              onClick={() => setConfirmDestroy(false)}
              sx={{
                borderRadius: 1,
                textTransform: 'none',
                fontSize: '0.75rem',
                minHeight: 40,
              }}
            >
              Cancel
            </Button>
          </Box>
        )}
      </Box>

      {/* Security notice */}
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

// ─── Main Component ───

export default function OnboardingPage() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialData | null>(null);
  const [credentialLoading, setCredentialLoading] = useState(false);

  const deviceType = useMemo(() => getDeviceType(), []);

  const getIdToken = useCallback(async () => {
    const currentUser = getFirebaseAuth().currentUser;
    if (!currentUser) return null;
    return await currentUser.getIdToken();
  }, []);

  const fetchCredentials = useCallback(async () => {
    setCredentialLoading(true);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/credentials', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to fetch credentials');
      const data = await res.json();
      setCredential(data);
    } catch {
      // Silently fail — card will show nothing
    } finally {
      setCredentialLoading(false);
    }
  }, [getIdToken]);

  const fetchSteps = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/onboarding-steps', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSteps(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchSteps();
    fetchCredentials();
  }, [fetchSteps, fetchCredentials]);

  const updateStepStatus = async (progressId: string, status: StepStatus) => {
    setUpdating(progressId);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/onboarding-steps/${progressId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update');

      setSteps((prev) =>
        prev.map((s) =>
          s.id === progressId
            ? {
                ...s,
                status,
                is_completed: status === 'completed',
                completed_at: status === 'completed' ? new Date().toISOString() : s.completed_at,
                completed_by_type: status === 'completed' ? 'student' : s.completed_by_type,
              }
            : s
        )
      );
    } catch {
      // User can retry
    } finally {
      setUpdating(null);
    }
  };

  const getStepUrl = (step: OnboardingStep): string | null => {
    const config = step.step_definition?.action_config;
    if (!config) return null;

    // Device-specific URL
    if (config[deviceType]) return config[deviceType] as string;
    // Fallback to generic URL
    if (config.url) return config.url as string;
    return null;
  };

  const handleStepAction = (step: OnboardingStep) => {
    const def = step.step_definition;
    if (!def) return;

    const url = getStepUrl(step);
    if (def.action_type === 'link' && url) {
      window.open(url, '_blank');
    } else if (def.action_type === 'in_app' && def.action_config?.route) {
      window.location.href = def.action_config.route as string;
    }

    // Auto-mark as completed after action
    if (!step.is_completed && step.status !== 'completed') {
      updateStepStatus(step.id, 'completed');
    }
  };

  const completedCount = steps.filter((s) => s.is_completed || s.status === 'completed').length;
  const totalCount = steps.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // ─── Loading State ───

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Box textAlign="center" py={6}>
          <CircularProgress size={40} />
          <Typography variant="body2" color="text.secondary" mt={2}>
            Loading your onboarding steps...
          </Typography>
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (steps.length === 0) {
    return (
      <Container maxWidth="sm" sx={{ py: 4, textAlign: 'center' }}>
        <CelebrationIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
        <Typography variant="h5" fontWeight={700}>All set!</Typography>
        <Typography color="text.secondary" mb={3}>
          No onboarding steps pending. You&apos;re ready to start learning.
        </Typography>
        <Button variant="contained" href="/dashboard" sx={{ borderRadius: 1, fontWeight: 600 }}>
          Go to Dashboard
        </Button>
      </Container>
    );
  }

  // ─── Main Render ───

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Welcome to Neram Classes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Complete these steps to get started with your classes.
        </Typography>
      </Box>

      {/* Progress */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          borderRadius: 2,
          border: '1px solid',
          borderColor: allComplete ? 'success.light' : 'primary.light',
          bgcolor: allComplete ? 'success.50' : 'primary.50',
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="body2" fontWeight={700}>
            {allComplete ? 'All steps complete!' : 'Your Progress'}
          </Typography>
          <Chip
            label={`${completedCount}/${totalCount}`}
            size="small"
            color={allComplete ? 'success' : 'primary'}
            sx={{ fontWeight: 700, fontSize: '0.75rem' }}
          />
        </Box>
        <LinearProgress
          variant="determinate"
          value={progressPercent}
          color={allComplete ? 'success' : 'primary'}
          sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(0,0,0,0.08)' }}
        />
      </Paper>

      {/* All Complete Banner */}
      {allComplete && (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            borderRadius: 2,
            bgcolor: 'success.50',
            border: '1px solid',
            borderColor: 'success.light',
            textAlign: 'center',
          }}
        >
          <CelebrationIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
          <Typography variant="h6" fontWeight={700} color="success.dark" gutterBottom>
            You&apos;re all set!
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            You&apos;ve completed all onboarding steps. Head to the dashboard to start learning.
          </Typography>
          <Button
            variant="contained"
            color="success"
            href="/dashboard"
            sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none' }}
          >
            Go to Dashboard
          </Button>
        </Paper>
      )}

      {/* Steps */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {steps.map((step) => {
          const def = step.step_definition;
          if (!def) return null;

          const stepStatus = (step.status || (step.is_completed ? 'completed' : 'pending')) as StepStatus;
          const config = STATUS_CONFIG[stepStatus] || STATUS_CONFIG.pending;
          const IconComponent = def.icon_name ? ICON_MAP[def.icon_name] : null;
          const isUpdating = updating === step.id;
          const url = getStepUrl(step);
          const hasDeviceUrl = def.action_config?.[deviceType];
          const deviceInfo = DEVICE_LABELS[deviceType];

          return (
            <Paper
              key={step.id}
              elevation={0}
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: stepStatus === 'completed' ? 'success.light' : stepStatus === 'need_help' ? 'warning.light' : 'divider',
                bgcolor: stepStatus === 'completed' ? 'success.50' : stepStatus === 'need_help' ? 'warning.50' : 'background.paper',
                opacity: isUpdating ? 0.7 : 1,
                transition: 'all 0.2s',
              }}
            >
              {/* Step Header */}
              <Box display="flex" alignItems="flex-start" gap={1.5}>
                {/* Status Icon */}
                <Box
                  sx={{
                    mt: 0.25,
                    cursor: stepStatus !== 'completed' ? 'pointer' : 'default',
                    color: config.color,
                  }}
                  onClick={() => {
                    if (isUpdating) return;
                    if (stepStatus === 'completed') {
                      updateStepStatus(step.id, 'pending');
                    } else {
                      updateStepStatus(step.id, 'completed');
                    }
                  }}
                >
                  {stepStatus === 'completed' ? (
                    <CheckCircleIcon sx={{ fontSize: 24, color: 'success.main' }} />
                  ) : stepStatus === 'need_help' ? (
                    <HelpOutlineIcon sx={{ fontSize: 24, color: 'warning.main' }} />
                  ) : (
                    <RadioButtonUncheckedIcon sx={{ fontSize: 24, color: 'grey.400' }} />
                  )}
                </Box>

                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                    {IconComponent && (
                      <IconComponent sx={{ fontSize: 18, color: config.color }} />
                    )}
                    <Typography
                      variant="body1"
                      fontWeight={600}
                      sx={{
                        textDecoration: stepStatus === 'completed' ? 'line-through' : 'none',
                        color: stepStatus === 'completed' ? 'text.secondary' : 'text.primary',
                      }}
                    >
                      {def.title}
                    </Typography>
                  </Box>

                  {def.description && (
                    <Typography variant="body2" color="text.secondary" mb={1}>
                      {def.description}
                    </Typography>
                  )}

                  {/* Credential Card — inline for join_teams_class step */}
                  {def.step_key === 'join_teams_class' && (
                    <CredentialCard
                      credential={credential}
                      credentialLoading={credentialLoading}
                      getIdToken={getIdToken}
                      onCredentialChange={fetchCredentials}
                    />
                  )}

                  {/* Device-specific badge */}
                  {hasDeviceUrl && deviceInfo && stepStatus !== 'completed' && (
                    <Chip
                      icon={<deviceInfo.icon sx={{ fontSize: 14 }} />}
                      label={`For ${deviceInfo.label}`}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 22, mb: 1 }}
                    />
                  )}

                  {/* Action Buttons */}
                  {stepStatus !== 'completed' && (
                    <Box display="flex" gap={1} flexWrap="wrap" mt={0.5}>
                      {(def.action_type === 'link' || def.action_type === 'in_app') && url && (
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => handleStepAction(step)}
                          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                          disabled={isUpdating}
                          sx={{
                            borderRadius: 1,
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            minHeight: 36,
                          }}
                        >
                          {def.step_key === 'join_whatsapp' ? 'Join Group' :
                           def.step_key.startsWith('install_') ? 'Install' :
                           'Open'}
                        </Button>
                      )}

                      {stepStatus !== 'need_help' && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => updateStepStatus(step.id, 'need_help')}
                          disabled={isUpdating}
                          sx={{
                            borderRadius: 1,
                            textTransform: 'none',
                            fontSize: '0.75rem',
                            minHeight: 36,
                          }}
                        >
                          Need Help
                        </Button>
                      )}

                      {stepStatus === 'need_help' && (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<WhatsAppIcon sx={{ fontSize: 16 }} />}
                          href={`https://wa.me/916380194614?text=${encodeURIComponent(
                            `Hi, I need help with "${def.title}" during my onboarding at Neram Classes.`
                          )}`}
                          target="_blank"
                          sx={{
                            borderRadius: 1,
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            minHeight: 36,
                            bgcolor: '#25D366',
                            '&:hover': { bgcolor: '#1DA851' },
                          }}
                        >
                          Message Us
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Box>

      {/* Support Footer */}
      <Divider sx={{ my: 3 }} />
      <Box textAlign="center" pb={4}>
        <Typography variant="body2" color="text.secondary" mb={1}>
          Having trouble with any step?
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<WhatsAppIcon />}
          href="https://wa.me/916380194614?text=Hi%2C%20I%20need%20help%20with%20my%20onboarding%20at%20Neram%20Classes"
          target="_blank"
          sx={{
            borderRadius: 1,
            textTransform: 'none',
            fontWeight: 600,
            borderColor: '#25D366',
            color: '#25D366',
            '&:hover': { borderColor: '#1DA851', bgcolor: 'rgba(37,211,102,0.08)' },
          }}
        >
          Contact Support on WhatsApp
        </Button>
      </Box>
    </Container>
  );
}
