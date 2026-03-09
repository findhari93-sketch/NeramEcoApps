// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  LinearProgress,
  Chip,
  IconButton,
  Skeleton,
  Alert,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import LaptopIcon from '@mui/icons-material/Laptop';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonIcon from '@mui/icons-material/Person';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import { getFirebaseAuth } from '@neram/auth';
import { useRouter } from 'next/navigation';
import type { StudentOnboardingStepWithDefinition } from '@neram/database';

const ICON_MAP: Record<string, React.ElementType> = {
  WhatsApp: WhatsAppIcon,
  Laptop: LaptopIcon,
  Groups: GroupsIcon,
  Person: PersonIcon,
};

export default function OnboardingChecklist() {
  const router = useRouter();
  const [steps, setSteps] = useState<StudentOnboardingStepWithDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState<string | null>(null);

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
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setSteps(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load onboarding steps');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  const handleMarkComplete = async (progressId: string) => {
    setCompleting(progressId);
    try {
      const token = await getIdToken();
      if (!token) return;

      const res = await fetch(`/api/onboarding-steps/${progressId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to update');

      // Update local state
      setSteps((prev) =>
        prev.map((s) =>
          s.id === progressId
            ? { ...s, is_completed: true, completed_at: new Date().toISOString(), completed_by_type: 'student' }
            : s
        )
      );
    } catch {
      // Silently fail, user can retry
    } finally {
      setCompleting(null);
    }
  };

  const handleStepAction = (step: StudentOnboardingStepWithDefinition) => {
    const def = step.step_definition;
    if (!def) return;

    if (def.action_type === 'link' && def.action_config?.url) {
      window.open(def.action_config.url as string, '_blank');
    } else if (def.action_type === 'in_app' && def.action_config?.route) {
      router.push(def.action_config.route as string);
    }

    // For all types, mark as complete after action
    if (!step.is_completed) {
      handleMarkComplete(step.id);
    }
  };

  // Don't render if no steps or all complete
  if (loading) {
    return (
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Skeleton variant="text" width="60%" height={24} />
        <Skeleton variant="rectangular" height={8} sx={{ mt: 1, borderRadius: 1 }} />
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={60} sx={{ borderRadius: 1.5 }} />
          ))}
        </Box>
      </Paper>
    );
  }

  if (error || steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.is_completed).length;
  const totalCount = steps.length;
  const allComplete = completedCount === totalCount;

  if (allComplete) return null;

  const progressPercent = (completedCount / totalCount) * 100;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'primary.light',
        bgcolor: (t) => t.palette.mode === 'dark' ? 'rgba(25,118,210,0.08)' : 'rgba(25,118,210,0.04)',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AssignmentTurnedInIcon sx={{ fontSize: 20, color: 'primary.main' }} />
        <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
          Complete Your Setup
        </Typography>
        <Chip
          label={`${completedCount}/${totalCount}`}
          size="small"
          color="primary"
          variant="outlined"
          sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }}
        />
      </Box>

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progressPercent}
        sx={{
          height: 6,
          borderRadius: 3,
          mb: 2,
          bgcolor: 'action.disabledBackground',
          '& .MuiLinearProgress-bar': { borderRadius: 3 },
        }}
      />

      {/* Steps list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {steps.map((step) => {
          const def = step.step_definition;
          if (!def) return null;
          const Icon = ICON_MAP[def.icon_name || ''] || AssignmentTurnedInIcon;
          const isCompleting = completing === step.id;
          const hasAction = (def.action_type === 'link' && def.action_config?.url) ||
                           (def.action_type === 'in_app' && def.action_config?.route);

          return (
            <Box
              key={step.id}
              onClick={() => {
                if (!step.is_completed) {
                  if (hasAction) {
                    handleStepAction(step);
                  } else {
                    handleMarkComplete(step.id);
                  }
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                p: 1.5,
                borderRadius: 1.5,
                bgcolor: step.is_completed ? 'action.hover' : 'background.paper',
                border: '1px solid',
                borderColor: 'divider',
                cursor: step.is_completed ? 'default' : 'pointer',
                opacity: step.is_completed ? 0.7 : 1,
                transition: 'all 0.2s',
                minHeight: 56,
                '&:active': !step.is_completed ? { transform: 'scale(0.98)' } : {},
              }}
            >
              {/* Completion icon */}
              {step.is_completed ? (
                <CheckCircleIcon sx={{ fontSize: 24, color: 'success.main', flexShrink: 0 }} />
              ) : isCompleting ? (
                <Box sx={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Box
                    sx={{
                      width: 18, height: 18, border: '2px solid', borderColor: 'primary.main',
                      borderRadius: '50%', borderTopColor: 'transparent',
                      animation: 'spin 0.8s linear infinite',
                      '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
                    }}
                  />
                </Box>
              ) : (
                <RadioButtonUncheckedIcon sx={{ fontSize: 24, color: 'grey.400', flexShrink: 0 }} />
              )}

              {/* Step icon */}
              <Icon
                sx={{
                  fontSize: 20,
                  color: step.is_completed ? 'grey.400' : 'primary.main',
                  flexShrink: 0,
                }}
              />

              {/* Text */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  sx={{
                    textDecoration: step.is_completed ? 'line-through' : 'none',
                    color: step.is_completed ? 'text.disabled' : 'text.primary',
                    fontSize: '0.85rem',
                  }}
                >
                  {def.title}
                </Typography>
                {def.description && !step.is_completed && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', lineHeight: 1.3, mt: 0.25 }}
                  >
                    {def.description}
                  </Typography>
                )}
              </Box>

              {/* Action indicator */}
              {!step.is_completed && hasAction && (
                <OpenInNewIcon sx={{ fontSize: 16, color: 'grey.400', flexShrink: 0 }} />
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
