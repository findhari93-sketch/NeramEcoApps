'use client';

import { useState } from 'react';
import { Box, Chip, Typography } from '@neram/ui';
import DemoGate from '@/components/tools/DemoGate';

export interface DemoMonth {
  month: string;
  sessions: Array<{ key: string; label: string; phase: 'phase_1' | 'phase_2' }>;
}

/**
 * Public demo: last year's NATA sessions by month; tap up to three to see how
 * a plan looks. Signed in: the new year's dates, a saved plan and reminders.
 */
export default function ExamPlannerDemo({ months, cycleYear, scheduleYear }: { months: DemoMonth[]; cycleYear: number; scheduleYear: number }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 3 ? [...p, k] : p));

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1.5, color: 'text.secondary' }}>
        {cycleYear > scheduleYear
          ? `NATA ${cycleYear} dates are not out yet. Here is how the ${scheduleYear} sessions ran; tap up to three to try a plan.`
          : `Tap up to three sessions to try a plan.`}
      </Typography>
      <Box sx={{ display: 'grid', gap: 2 }}>
        {months.map((m) => (
          <Box key={m.month}>
            <Typography component="h3" sx={{ fontWeight: 700, fontSize: '0.9375rem', mb: 0.75 }}>
              {m.month}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {m.sessions.map((s) => {
                const on = picked.includes(s.key);
                return (
                  <Chip
                    key={s.key}
                    label={s.label}
                    clickable
                    color={on ? 'primary' : 'default'}
                    variant={on ? 'filled' : 'outlined'}
                    onClick={() => toggle(s.key)}
                    aria-pressed={on}
                    sx={{ minHeight: 44, borderRadius: 2 }}
                  />
                );
              })}
            </Box>
          </Box>
        ))}
      </Box>
      <Typography aria-live="polite" sx={{ mt: 2, fontWeight: 600 }}>
        {picked.length === 0 ? 'No sessions picked yet.' : `${picked.length} session${picked.length === 1 ? '' : 's'} picked.`}
      </Typography>
      {picked.length > 0 && (
        <DemoGate
          toolId="nata-exam-planner"
          headline={`Get the NATA ${cycleYear} dates the day they are out`}
          benefits={['Your plan saved to your account', 'Reminders before registration and each attempt', 'Admit card and result dates in one place']}
          cta="Sign in free to save your plan"
          input={{ picked }}
        />
      )}
    </Box>
  );
}
