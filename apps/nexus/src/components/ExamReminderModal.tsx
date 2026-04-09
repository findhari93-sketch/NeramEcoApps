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
  const [selectedTargetYear, setSelectedTargetYear] = useState<string | null>(null);

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

  const TARGET_YEARS = ['2026-27', '2027-28', '2028-29'];

  const handleResponse = useCallback(
    async (responseAction: 'applied' | 'planning' | 'snooze' | 'not_this_year', targetYear?: string) => {
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
        if (responseAction === 'not_this_year' && targetYear) {
          body.target_year = targetYear;
        }

        await fetch('/api/onboarding/exam-prompt', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (activeClassroom) {
          localStorage.setItem(
            `exam_prompt_${activeClassroom.id}`,
            new Date().toISOString()
          );
        }

        if (currentPlanIndex < plans.length - 1) {
          setCurrentPlanIndex((i) => i + 1);
          setAction(null);
          setApplicationNumber('');
          setSelectedTargetYear(null);
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
        ) : action === 'not_this_year' ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Which year are you planning to write?
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mb: 2 }}>
              {TARGET_YEARS.map((year) => (
                <Chip
                  key={year}
                  label={year}
                  onClick={() => setSelectedTargetYear(year)}
                  color={selectedTargetYear === year ? 'primary' : 'default'}
                  variant={selectedTargetYear === year ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 600, minHeight: 36 }}
                />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => { setAction(null); setSelectedTargetYear(null); }}
                sx={{ borderRadius: 2, textTransform: 'none' }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                fullWidth
                disabled={saving || !selectedTargetYear}
                onClick={() => handleResponse('not_this_year', selectedTargetYear!)}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                {saving ? 'Saving...' : 'Confirm'}
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
              Writing 2025-26, haven&apos;t applied yet
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
              onClick={() => setAction('not_this_year')}
              startIcon={<CancelOutlinedIcon />}
              sx={{ py: 1, textTransform: 'none', fontSize: '0.85rem' }}
            >
              Not writing this year
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
