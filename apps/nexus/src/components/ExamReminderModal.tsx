'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogContent,
  TextField,
  Chip,
  Divider,
  CircularProgress,
} from '@neram/ui';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import SnoozeOutlinedIcon from '@mui/icons-material/SnoozeOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ExamPlan {
  id: string;
  exam_type: string;
  state: string;
}

/**
 * Weekly blocking modal for students with exam plans in planning state.
 * Checks on mount; shows modal if any plans need prompting.
 * Insert this in the student layout to trigger on every page load.
 */
export default function ExamReminderModal() {
  const { activeClassroom, getToken, isStudent, isOnboardingComplete } = useNexusAuthContext();
  const [plans, setPlans] = useState<ExamPlan[]>([]);
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [applicationNumber, setApplicationNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmNotWriting, setConfirmNotWriting] = useState(false);

  const currentPlan = plans[currentPlanIndex];

  // Check for plans needing prompt on mount
  useEffect(() => {
    if (!isStudent || !isOnboardingComplete || !activeClassroom) return;

    // Check if we already prompted today (localStorage)
    const lastPromptKey = `exam_prompt_${activeClassroom.id}`;
    const lastPrompt = localStorage.getItem(lastPromptKey);
    if (lastPrompt) {
      const lastDate = new Date(lastPrompt).toDateString();
      const today = new Date().toDateString();
      if (lastDate === today) return; // Already prompted today
    }

    async function checkPrompts() {
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/onboarding/exam-prompt?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) return;
        const data = await res.json();

        if (data.plans && data.plans.length > 0) {
          setPlans(data.plans);
          setCurrentPlanIndex(0);
          setOpen(true);
        }
      } catch {
        // Silently fail — don't block the app
      }
    }

    checkPrompts();
  }, [isStudent, isOnboardingComplete, activeClassroom, getToken]);

  const handleResponse = useCallback(
    async (responseAction: 'applied' | 'planning' | 'snooze' | 'not_writing') => {
      if (!currentPlan) return;
      setSaving(true);

      try {
        const token = await getToken();
        if (!token) return;

        const body: Record<string, unknown> = {
          plan_id: currentPlan.id,
          action: responseAction,
        };

        if (responseAction === 'applied' && applicationNumber.trim()) {
          body.application_number = applicationNumber.trim();
        }

        await fetch('/api/onboarding/exam-prompt', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        // Mark as prompted today
        if (activeClassroom) {
          localStorage.setItem(
            `exam_prompt_${activeClassroom.id}`,
            new Date().toISOString()
          );
        }

        // Move to next plan or close
        if (currentPlanIndex < plans.length - 1) {
          setCurrentPlanIndex((i) => i + 1);
          setAction(null);
          setApplicationNumber('');
          setConfirmNotWriting(false);
        } else {
          setOpen(false);
        }
      } catch {
        // ignore
      } finally {
        setSaving(false);
      }
    },
    [currentPlan, currentPlanIndex, plans.length, applicationNumber, getToken, activeClassroom]
  );

  if (!open || !currentPlan) return null;

  const examLabel = currentPlan.exam_type === 'nata' ? 'NATA 2026' : 'JEE Main 2026';

  return (
    <Dialog
      open={open}
      maxWidth="xs"
      fullWidth
      disableEscapeKeyDown
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: 3,
          m: { xs: 2, sm: 3 },
        },
      }}
    >
      <DialogContent sx={{ p: { xs: 2.5, sm: 3 }, textAlign: 'center' }}>
        {/* Header */}
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: 'primary.50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mx: 'auto',
            mb: 2,
          }}
        >
          <EventOutlinedIcon sx={{ fontSize: 28, color: 'primary.main' }} />
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {examLabel} Update
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          What&apos;s your current status for {examLabel}?
        </Typography>

        {/* Expanded form for "I've applied" */}
        {action === 'applied' ? (
          <Box sx={{ textAlign: 'left', mb: 2 }}>
            <TextField
              label="Application Number"
              value={applicationNumber}
              onChange={(e) => setApplicationNumber(e.target.value)}
              fullWidth
              size="small"
              placeholder="e.g., NATA2026XXXXX"
              sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => setAction(null)}
                sx={{ borderRadius: 2, textTransform: 'none' }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                fullWidth
                disabled={saving}
                onClick={() => handleResponse('applied')}
                startIcon={saving ? <CircularProgress size={16} /> : <CheckCircleOutlinedIcon />}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                Confirm
              </Button>
            </Box>
          </Box>
        ) : confirmNotWriting ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="error.main" sx={{ mb: 2 }}>
              Are you sure? This will remove {examLabel} from your exam tracker.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => setConfirmNotWriting(false)}
                sx={{ borderRadius: 2, textTransform: 'none' }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="error"
                fullWidth
                disabled={saving}
                onClick={() => handleResponse('not_writing')}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                Yes, Remove
              </Button>
            </Box>
          </Box>
        ) : (
          /* Default action buttons */
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={() => setAction('applied')}
              startIcon={<CheckCircleOutlinedIcon />}
              sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              I&apos;ve Applied
            </Button>

            <Button
              variant="outlined"
              fullWidth
              disabled={saving}
              onClick={() => handleResponse('planning')}
              startIcon={<EventOutlinedIcon />}
              sx={{ py: 1.5, borderRadius: 2, textTransform: 'none' }}
            >
              I&apos;m Planning to Apply
            </Button>

            <Button
              variant="outlined"
              fullWidth
              disabled={saving}
              onClick={() => handleResponse('snooze')}
              startIcon={<SnoozeOutlinedIcon />}
              color="inherit"
              sx={{ py: 1.5, borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
            >
              Remind Me Later (3 days)
            </Button>

            <Divider sx={{ my: 0.5 }} />

            <Button
              variant="text"
              fullWidth
              color="error"
              onClick={() => setConfirmNotWriting(true)}
              startIcon={<CancelOutlinedIcon />}
              sx={{ py: 1, textTransform: 'none', fontSize: '0.85rem' }}
            >
              I&apos;ve Decided Not to Write
            </Button>
          </Box>
        )}

        {/* Plan counter */}
        {plans.length > 1 && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
            {currentPlanIndex + 1} of {plans.length} exams
          </Typography>
        )}
      </DialogContent>
    </Dialog>
  );
}
