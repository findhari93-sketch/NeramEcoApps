'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, LinearProgress, Typography, alpha, useTheme } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PreworkReasonDialog, { type PreworkReasonPayload } from './PreworkReasonDialog';

/** The per-class `prep` entry the three student class routes now return. */
export interface ClassPrepSummaryClient {
  gated: boolean;
  open: boolean;
  via: string;
  blockers: string[];
  readiness: number | null;
  has_test: boolean;
  test_best_pct: number | null;
  test_passing_pct: number | null;
  test_attempts: number;
  assignments_required: number;
  assignments_submitted: number;
  reason_given: boolean;
  /** A Required test from the PREVIOUS class is still outstanding. */
  carried_over_test?: boolean;
}

interface PrepGateCardProps {
  classId: string;
  prep: ClassPrepSummaryClient;
  getToken: () => Promise<string | null>;
  /** Called after a reason is recorded, so the caller can refetch. */
  onChanged?: () => void;
}

/**
 * What a student sees instead of a Join button while the gate is shut.
 *
 * Renders ONLY when the door is closed. The alternative, a disabled Join button,
 * tells a student nothing about what to do next, and this screen's whole job is
 * to be actionable: here is what is missing, here is the button that fixes it,
 * and here is the way out if you genuinely cannot.
 *
 * The "I cannot do this" path is not a courtesy. Locking a student out of a class
 * over homework converts a homework problem into an attendance problem, so a
 * reason opens the door immediately. The teacher still sees both blockers.
 */
export default function PrepGateCard({ classId, prep, getToken, onChanged }: PrepGateCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!prep.gated || prep.open) return null;

  const testDone = !prep.blockers.includes('test_not_passed');
  const preworkDone = !prep.blockers.includes('prework_missing');
  const carriedOverDone = !prep.blockers.includes('class_test_pending');

  const submitReason = async ({ reasonCode, note }: PreworkReasonPayload) => {
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/student/class-prep/${classId}/reason`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason_code: reasonCode, reason_note: note }),
      });
      if (res.ok) {
        setReasonOpen(false);
        onChanged?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const line = (done: boolean, label: string, detail?: string) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minHeight: 32 }}>
      {done ? (
        <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main', mt: 0.25 }} />
      ) : (
        <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: 'text.disabled', mt: 0.25 }} />
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: '0.8438rem',
            fontWeight: done ? 600 : 700,
            color: done ? 'text.secondary' : 'text.primary',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {label}
        </Typography>
        {detail && (
          <Typography variant="caption" color="text.secondary">
            {detail}
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <Box
        sx={{
          borderRadius: 2,
          p: 2,
          bgcolor: alpha(theme.palette.warning.main, 0.08),
          border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <LockOutlinedIcon sx={{ fontSize: 20, color: 'warning.dark' }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.9375rem', color: 'warning.dark' }}>
            {prep.blockers.length > 2
              ? `${prep.blockers.length} things before you join`
              : prep.blockers.length > 1
                ? 'Two things before you join'
                : 'One thing before you join'}
          </Typography>
        </Box>

        {prep.readiness != null && prep.readiness > 0 && (
          <LinearProgress
            variant="determinate"
            value={prep.readiness * 100}
            color="warning"
            sx={{ height: 5, borderRadius: 3, mb: 1.5 }}
          />
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
          {prep.has_test &&
            line(
              testDone,
              'Pass the short test',
              // Naming the best score turns "you failed" into "you were close",
              // which is the difference between trying again and giving up.
              prep.test_best_pct != null
                ? `Your best is ${Math.round(prep.test_best_pct)}%, you need ${prep.test_passing_pct}%`
                : `You need ${prep.test_passing_pct}% to pass`,
            )}
          {prep.assignments_required > 0 &&
            line(
              preworkDone,
              'Hand in the pre-class work',
              `${prep.assignments_submitted} of ${prep.assignments_required} handed in`,
            )}
          {prep.carried_over_test &&
            line(
              carriedOverDone,
              'Finish the test from the last class',
              'Your teacher set it as required, so it carries over to tonight.',
            )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {!testDone && prep.has_test && (
            <Button
              variant="contained"
              color="warning"
              fullWidth
              onClick={() => router.push(`/student/class-prep/${classId}/test`)}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              {prep.test_attempts > 0 ? 'Try the test again' : 'Take the short test'}
            </Button>
          )}
          {!preworkDone && (
            <Button
              variant={testDone ? 'contained' : 'outlined'}
              color="warning"
              fullWidth
              onClick={() => router.push('/student/assignments')}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              Open the pre-class work
            </Button>
          )}
          {/* Sends them to their Tests list rather than straight into the paper.
              The card knows a test from the previous class is outstanding, not
              which one, and the list already shows it at the top with its
              deadline and the class it came from. */}
          {!carriedOverDone && (
            <Button
              variant="outlined"
              color="warning"
              fullWidth
              onClick={() => router.push('/student/tests')}
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }}
            >
              Open the last class's test
            </Button>
          )}
          {/* Never hidden, never buried behind a menu. A student who cannot do the
              work needs this in the same glance as the work itself. */}
          <Button
            fullWidth
            onClick={() => setReasonOpen(true)}
            disabled={busy}
            sx={{ minHeight: 44, textTransform: 'none', color: 'text.secondary' }}
          >
            I cannot do this, here is why
          </Button>
        </Box>
      </Box>

      {/* The existing dialog, reused rather than rebuilt: the same five reason
          codes, so the teacher's tally stays one vocabulary whether a student is
          explaining an assignment or the whole gate. */}
      <PreworkReasonDialog
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        assignmentTitle={prep.has_test && !testDone ? 'the short test' : 'the pre-class work'}
        contextLine="Your teacher will see this, and you can join the class."
        onSubmit={submitReason}
        submitting={busy}
      />
    </>
  );
}
