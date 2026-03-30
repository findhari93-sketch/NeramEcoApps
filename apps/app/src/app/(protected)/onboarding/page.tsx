// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Divider,
  Checkbox,
  FormControlLabel,
  Snackbar,
} from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CelebrationIcon from '@mui/icons-material/Celebration';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { getFirebaseAuth } from '@neram/auth';

import PhaseSection from '@/components/onboarding/PhaseSection';
import StepCard from '@/components/onboarding/StepCard';
import CredentialCard, { CredentialData } from '@/components/onboarding/CredentialCard';
import ConfirmLoginTermsStep from '@/components/onboarding/ConfirmLoginTermsStep';
import NexusStatusPoller from '@/components/onboarding/NexusStatusPoller';
import CongratulationsModal from '@/components/onboarding/CongratulationsModal';
import WhatsAppJoinStep from '@/components/onboarding/WhatsAppJoinStep';

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
    phase: string;
  };
}

type StepStatus = 'pending' | 'in_progress' | 'completed' | 'need_help';

interface CourseGroupLinks {
  whatsapp_group_url: string | null;
  teams_group_chat_url: string | null;
  teams_class_team_url: string | null;
  teams_class_team_id: string | null;
}

interface NexusTeamInfo {
  classroomId: string;
  classroomName: string;
  msTeamId: string;
}

type NexusStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

const PHASE_CONFIG = [
  { key: 'get_ready', title: 'Get Ready', number: 1 },
  { key: 'access_your_account', title: 'Access Your Account', number: 2 },
  { key: 'complete_nexus_setup', title: 'Complete Nexus Setup', number: 3 },
  { key: 'secure_your_account', title: 'Secure Your Account', number: 4 },
];

// ─── Delete Credentials Step ───

function DeleteCredentialsStep({
  onDelete,
  disabled,
  isCompleted,
}: {
  onDelete: () => void;
  disabled: boolean;
  isCompleted: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [confirmDestroy, setConfirmDestroy] = useState(false);
  const [destroying, setDestroying] = useState(false);

  if (isCompleted) {
    return (
      <Box sx={{ mt: 1, p: 1.5, borderRadius: 1.5, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.light' }}>
        <Typography variant="body2" color="success.dark" fontWeight={600}>
          Credentials securely deleted
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'warning.50', border: '1px solid', borderColor: 'warning.light', mb: 2 }}>
        <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
          <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
          <Typography variant="caption" fontWeight={700} color="warning.dark">
            Before You Delete
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Save your credentials securely in your notebook or notepad. Once deleted, they cannot be recovered or re-shared.
        </Typography>
      </Box>

      <FormControlLabel
        control={
          <Checkbox
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            disabled={disabled}
            sx={{ '& .MuiSvgIcon-root': { fontSize: 22 } }}
          />
        }
        label={
          <Typography variant="body2">I have saved my credentials securely</Typography>
        }
        sx={{ mb: 2, '& .MuiFormControlLabel-label': { pt: 0.25 } }}
      />

      {!confirmDestroy ? (
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<DeleteForeverIcon sx={{ fontSize: 16 }} />}
          onClick={() => setConfirmDestroy(true)}
          disabled={!saved || disabled}
          sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, fontSize: '0.85rem', minHeight: 44 }}
        >
          Delete Credentials
        </Button>
      ) : (
        <Box display="flex" gap={1} alignItems="center">
          <Typography variant="caption" color="error.main" fontWeight={600}>
            Are you sure? This cannot be undone.
          </Typography>
          <Button
            size="small" variant="contained" color="error"
            onClick={() => { setDestroying(true); onDelete(); }}
            disabled={destroying}
            sx={{ borderRadius: 1, textTransform: 'none', fontSize: '0.8rem', minHeight: 40 }}
          >
            {destroying ? 'Deleting...' : 'Yes, Delete'}
          </Button>
          <Button
            size="small" variant="text"
            onClick={() => setConfirmDestroy(false)}
            sx={{ borderRadius: 1, textTransform: 'none', fontSize: '0.8rem', minHeight: 40 }}
          >
            Cancel
          </Button>
        </Box>
      )}
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
  const [courseGroupLinks, setCourseGroupLinks] = useState<CourseGroupLinks | null>(null);
  const [nexusTeamIds, setNexusTeamIds] = useState<NexusTeamInfo[]>([]);
  const [nexusStatus, setNexusStatus] = useState<NexusStatus>('not_started');
  const [showCongrats, setShowCongrats] = useState(false);
  const [snackbar, setSnackbar] = useState('');

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
      if (!res.ok) throw new Error('Failed');
      setCredential(await res.json());
    } catch {
      // Silently fail
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
      const allSteps: OnboardingStep[] = data.data || [];

      // Auto-complete and hide "Join MS Teams Class" — this is now automated
      const teamsStep = allSteps.find((s) => s.step_definition?.step_key === 'join_teams_class');
      if (teamsStep && !teamsStep.is_completed && teamsStep.status !== 'completed') {
        // Mark completed in background so it doesn't block other phases
        fetch(`/api/onboarding-steps/${teamsStep.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        }).catch(() => {});
      }

      // Filter out the Teams step — students don't need to see it
      const visibleSteps = allSteps.filter((s) => s.step_definition?.step_key !== 'join_teams_class');
      setSteps(visibleSteps);
      if (data.courseGroupLinks) setCourseGroupLinks(data.courseGroupLinks);
      if (data.nexusTeamIds) setNexusTeamIds(data.nexusTeamIds);
      if (data.nexusStatus) setNexusStatus(data.nexusStatus as NexusStatus);
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
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
      setSnackbar('Failed to update step');
    } finally {
      setUpdating(null);
    }
  };

  const handleStepAction = (step: OnboardingStep) => {
    const def = step.step_definition;
    if (!def) return;

    const deviceType = typeof navigator !== 'undefined'
      ? /android/i.test(navigator.userAgent) ? 'android'
        : /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'desktop'
      : 'desktop';

    let url = def.action_config?.[deviceType] || def.action_config?.url;

    // Override WhatsApp URL from course group links
    if (def.step_key === 'join_whatsapp' && courseGroupLinks?.whatsapp_group_url) {
      url = courseGroupLinks.whatsapp_group_url;
    }
    // Override Teams class URL from course group links
    if (def.step_key === 'join_teams_class' && courseGroupLinks?.teams_class_team_url) {
      url = courseGroupLinks.teams_class_team_url;
    }

    if (url) {
      window.open(url, '_blank');
    }

    if (!step.is_completed && step.status !== 'completed') {
      updateStepStatus(step.id, 'completed');
    }
  };

  const resolveWhatsAppUrl = (step: OnboardingStep): string => {
    // Priority 1: Course-specific group link from DB
    if (courseGroupLinks?.whatsapp_group_url) return courseGroupLinks.whatsapp_group_url;
    // Priority 2: action_config.url
    const cfg = step.step_definition.action_config || {};
    if (cfg.url) return cfg.url as string;
    // Priority 3: URL-like key in action_config (handles malformed JSON)
    const urlKey = Object.keys(cfg).find((k) => k.startsWith('http'));
    if (urlKey) return urlKey;
    return '';
  };

  const handleWhatsAppJoin = (step: OnboardingStep) => {
    const url = resolveWhatsAppUrl(step);
    if (url) {
      window.open(url, '_blank');
    }
    if (!step.is_completed && step.status !== 'completed' && step.status !== 'in_progress') {
      updateStepStatus(step.id, 'in_progress');
    }
  };

  const handleTeamsAutoAdd = async (step: OnboardingStep) => {
    // Collect team IDs from nexus enrollments (primary) and course_group_links (fallback)
    const teamIds: string[] = [];
    if (nexusTeamIds.length > 0) {
      teamIds.push(...nexusTeamIds.map((t) => t.msTeamId));
    } else if (courseGroupLinks?.teams_class_team_id) {
      teamIds.push(courseGroupLinks.teams_class_team_id);
    }

    if (teamIds.length === 0) {
      setSnackbar('No Teams class assigned yet — contact your admin');
      return;
    }

    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/teams/add-member', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIds }),
      });
      const data = await res.json();

      if (data.success) {
        const count = nexusTeamIds.length || 1;
        setSnackbar(count > 1 ? `Added to ${count} Teams classes!` : 'Added to Teams class!');
        updateStepStatus(step.id, 'completed');
      } else if (data.reason === 'no_ms_account') {
        setSnackbar('Teams account not set up yet — complete the credentials step first');
      } else {
        setSnackbar('Auto-add failed — contact your admin for help');
      }
    } catch {
      setSnackbar('Failed to join Teams — please try again');
    }
  };

  const handleDeleteCredentials = async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/credentials', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: credential?.credentialId }),
      });
      if (!res.ok) throw new Error('Failed');

      // Mark step complete
      const deleteStep = steps.find((s) => s.step_definition?.step_key === 'delete_credentials');
      if (deleteStep) {
        await updateStepStatus(deleteStep.id, 'completed');
      }

      fetchCredentials();
      setShowCongrats(true);
    } catch {
      setSnackbar('Failed to delete credentials');
    }
  };

  // ─── Phase Logic ───

  const stepsByPhase = useMemo(() => {
    const grouped: Record<string, OnboardingStep[]> = {};
    for (const phase of PHASE_CONFIG) {
      grouped[phase.key] = steps
        .filter((s) => s.step_definition?.phase === phase.key)
        .sort((a, b) => (a.step_definition?.display_order ?? 0) - (b.step_definition?.display_order ?? 0));
    }
    return grouped;
  }, [steps]);

  const phaseCompletion = useMemo(() => {
    const result: Record<string, { completed: number; total: number; isComplete: boolean }> = {};
    for (const phase of PHASE_CONFIG) {
      const phaseSteps = stepsByPhase[phase.key] || [];
      const completed = phaseSteps.filter((s) => s.is_completed || s.status === 'completed').length;
      result[phase.key] = {
        completed,
        total: phaseSteps.length,
        isComplete: phaseSteps.length > 0 && completed === phaseSteps.length,
      };
    }
    return result;
  }, [stepsByPhase]);

  const isPhaseActive = (phaseKey: string): boolean => {
    const idx = PHASE_CONFIG.findIndex((p) => p.key === phaseKey);
    if (idx === 0) return true;
    // Active if all previous phases are complete
    for (let i = 0; i < idx; i++) {
      if (!phaseCompletion[PHASE_CONFIG[i].key]?.isComplete) return false;
    }
    return true;
  };

  const totalCompleted = steps.filter((s) => s.is_completed || s.status === 'completed').length;
  const allComplete = steps.length > 0 && totalCompleted === steps.length;

  // ─── Loading / Error States ───

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
    const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL || 'http://localhost:3010';
    const applyUrl = `${marketingUrl}/en/apply`;

    return (
      <Container maxWidth="sm" sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          You&apos;re not enrolled yet
        </Typography>
        <Typography color="text.secondary" mb={3}>
          To access onboarding, you need to enroll in a class first. Fill out the application form to get started.
        </Typography>
        <Button
          variant="contained"
          href={applyUrl}
          target="_blank"
          sx={{ borderRadius: 1, fontWeight: 600, minHeight: 48 }}
        >
          Apply Now
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

      {/* Phases */}
      {PHASE_CONFIG.map((phase) => {
        const phaseSteps = stepsByPhase[phase.key] || [];
        if (phaseSteps.length === 0) return null;

        const completion = phaseCompletion[phase.key];
        const active = isPhaseActive(phase.key);

        return (
          <PhaseSection
            key={phase.key}
            phaseNumber={phase.number}
            title={phase.title}
            isActive={active}
            isComplete={completion.isComplete}
            completedCount={completion.completed}
            totalCount={completion.total}
          >
            {phaseSteps.map((step) => {
              const stepKey = step.step_definition?.step_key;

              // View Credentials step
              if (stepKey === 'view_credentials') {
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    isUpdating={updating === step.id}
                    disabled={!active}
                    onToggle={updateStepStatus}
                    onAction={handleStepAction}
                  >
                    <CredentialCard
                      credential={credential}
                      credentialLoading={credentialLoading}
                      getIdToken={getIdToken}
                      onCredentialChange={() => {
                        fetchCredentials();
                        // Auto-complete view step when credentials are viewed
                        if (!step.is_completed && step.status !== 'completed' && credential?.hasCredentials) {
                          updateStepStatus(step.id, 'completed');
                        }
                      }}
                      showDestroyButton={false}
                    />
                  </StepCard>
                );
              }

              // Confirm Login & Terms step
              if (stepKey === 'confirm_login_terms') {
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    isUpdating={updating === step.id}
                    disabled={!active}
                    onToggle={updateStepStatus}
                    onAction={handleStepAction}
                  >
                    <ConfirmLoginTermsStep
                      onConfirm={() => updateStepStatus(step.id, 'completed')}
                      isCompleted={step.is_completed || step.status === 'completed'}
                      disabled={!active}
                    />
                  </StepCard>
                );
              }

              // Join Teams Class Group step (hybrid auto-add)
              if (stepKey === 'join_teams_class') {
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    isUpdating={updating === step.id}
                    disabled={!active}
                    onToggle={updateStepStatus}
                    onAction={() => handleTeamsAutoAdd(step)}
                  />
                );
              }

              // Nexus onboarding step
              if (stepKey === 'go_to_nexus') {
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    isUpdating={updating === step.id}
                    disabled={!active}
                    onToggle={updateStepStatus}
                    onAction={handleStepAction}
                  >
                    <NexusStatusPoller
                      initialStatus={nexusStatus}
                      getIdToken={getIdToken}
                      onApproved={() => {
                        if (!step.is_completed && step.status !== 'completed') {
                          updateStepStatus(step.id, 'completed');
                        }
                      }}
                      isActive={active}
                    />
                  </StepCard>
                );
              }

              // Delete Credentials step
              if (stepKey === 'delete_credentials') {
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    isUpdating={updating === step.id}
                    disabled={!active}
                    onToggle={updateStepStatus}
                    onAction={handleStepAction}
                  >
                    <DeleteCredentialsStep
                      onDelete={handleDeleteCredentials}
                      disabled={!active}
                      isCompleted={step.is_completed || step.status === 'completed'}
                    />
                  </StepCard>
                );
              }

              // Join WhatsApp Group step (approval-based)
              if (stepKey === 'join_whatsapp') {
                const groupUrl = resolveWhatsAppUrl(step);
                return (
                  <StepCard
                    key={step.id}
                    step={step}
                    isUpdating={updating === step.id}
                    disabled={!active}
                    onToggle={updateStepStatus}
                    onAction={() => handleWhatsAppJoin(step)}
                  >
                    <WhatsAppJoinStep
                      status={(step.status || 'pending') as any}
                      actionConfig={step.step_definition.action_config || {}}
                      groupUrl={groupUrl}
                      onJoinClicked={() => handleWhatsAppJoin(step)}
                      onApproved={() => updateStepStatus(step.id, 'completed')}
                      disabled={!active}
                    />
                  </StepCard>
                );
              }

              // Default step (Install Teams, Install Authenticator, etc.)
              return (
                <StepCard
                  key={step.id}
                  step={step}
                  isUpdating={updating === step.id}
                  disabled={!active}
                  onToggle={updateStepStatus}
                  onAction={handleStepAction}
                />
              );
            })}
          </PhaseSection>
        );
      })}

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
            borderRadius: 1, textTransform: 'none', fontWeight: 600,
            borderColor: '#25D366', color: '#25D366',
            '&:hover': { borderColor: '#1DA851', bgcolor: 'rgba(37,211,102,0.08)' },
          }}
        >
          Contact Support on WhatsApp
        </Button>
      </Box>

      {/* Congratulations Modal */}
      <CongratulationsModal
        open={showCongrats}
        onClose={() => setShowCongrats(false)}
      />

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  );
}
