// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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

// ─── Status Colors ───

const STATUS_CONFIG: Record<StepStatus, { color: string; bgcolor: string; label: string }> = {
  pending: { color: 'text.secondary', bgcolor: 'grey.100', label: 'Not Started' },
  in_progress: { color: 'info.main', bgcolor: 'info.50', label: 'In Progress' },
  completed: { color: 'success.main', bgcolor: 'success.50', label: 'Done' },
  need_help: { color: 'warning.main', bgcolor: 'warning.50', label: 'Need Help' },
};

// ─── Main Component ───

export default function OnboardingPage() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const deviceType = useMemo(() => getDeviceType(), []);

  const getIdToken = useCallback(async () => {
    const currentUser = getFirebaseAuth().currentUser;
    if (!currentUser) return null;
    return await currentUser.getIdToken();
  }, []);

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
  }, [fetchSteps]);

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
