'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import type { ExamAttemptWithDate } from '@/types/unified-exams';
import AttemptNode from './AttemptNode';

interface AttemptTimelineProps {
  attempts: ExamAttemptWithDate[];
  onPickDate: () => void;
  onMarkCompleted: (id: string) => void;
  onEnterScores: (id: string) => void;
}

export default function AttemptTimeline({ attempts, onPickDate, onMarkCompleted, onEnterScores }: AttemptTimelineProps) {
  const theme = useTheme();

  const phase1 = attempts.filter(a => a.phase === 'phase_1');
  const phase2 = attempts.filter(a => a.phase === 'phase_2');
  const hasPhase1Active = phase1.length > 0;

  return (
    <Box>
      {/* Phase 1 */}
      <Typography variant="caption" fontWeight={700} color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5, display: 'block' }}>
        Phase 1 (Apr - Jun)
      </Typography>

      {phase1.length > 0 ? (
        phase1.map(a => (
          <AttemptNode
            key={a.id}
            attempt={a}
            onPickDate={onPickDate}
            onMarkCompleted={onMarkCompleted}
            onEnterScores={onEnterScores}
          />
        ))
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, pl: 3.5 }}>
          No attempts activated for Phase 1
        </Typography>
      )}

      {/* Phase 2 */}
      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Phase 2 (Aug 7-8)
          </Typography>
          {!hasPhase1Active && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 1, bgcolor: alpha(theme.palette.text.primary, 0.05) }}>
              <LockOutlinedIcon sx={{ fontSize: '0.75rem', color: 'text.disabled' }} />
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                Unlock by activating Phase 1
              </Typography>
            </Box>
          )}
        </Box>

        {hasPhase1Active && phase2.length > 0 ? (
          phase2.map(a => (
            <AttemptNode
              key={a.id}
              attempt={a}
              onPickDate={onPickDate}
              onMarkCompleted={onMarkCompleted}
              onEnterScores={onEnterScores}
            />
          ))
        ) : hasPhase1Active ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1.5, pl: 3.5 }}>
            No attempts activated for Phase 2
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
