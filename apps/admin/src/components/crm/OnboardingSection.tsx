'use client';

import { Box, Chip, LinearProgress, Paper, Typography } from '@neram/ui';
import QuizIcon from '@mui/icons-material/Quiz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import type { UserJourneyDetail } from '@neram/database';

interface OnboardingSectionProps {
  detail: UserJourneyDetail;
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  completed: { color: '#2E7D32', bgColor: '#2E7D3214', label: 'Completed' },
  in_progress: { color: '#F57C00', bgColor: '#F57C0014', label: 'In Progress' },
  pending: { color: '#1976D2', bgColor: '#1976D214', label: 'Pending' },
  skipped: { color: '#78909C', bgColor: '#78909C14', label: 'Skipped' },
};

export default function OnboardingSection({ detail }: OnboardingSectionProps) {
  const { onboardingSession, onboardingResponses } = detail;

  return (
    <Paper elevation={0} sx={{ mb: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <QuizIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Onboarding</Typography>
      </Box>

      <Box sx={{ p: 1.5 }}>
        {!onboardingSession ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <QuizIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">Onboarding not started.</Typography>
          </Box>
        ) : (
          <>
            {/* Status + Progress */}
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                {(() => {
                  const config = STATUS_CONFIG[onboardingSession.status] || STATUS_CONFIG.pending;
                  return (
                    <Chip
                      label={config.label}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: 10.5,
                        fontWeight: 700,
                        bgcolor: config.bgColor,
                        color: config.color,
                        borderRadius: 1,
                        border: `1px solid ${config.color}30`,
                      }}
                    />
                  );
                })()}
                {onboardingSession.completed_at && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CheckCircleIcon sx={{ fontSize: 14, color: '#2E7D32' }} />
                    <Typography variant="caption" sx={{ fontSize: 11, color: 'text.secondary' }}>
                      {new Date(onboardingSession.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Progress bar */}
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: 11.5, color: 'text.secondary' }}>
                    Progress
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, fontSize: 12, color: 'primary.main' }}>
                    {onboardingSession.questions_answered} / {onboardingSession.total_questions}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={onboardingSession.total_questions > 0 ? (onboardingSession.questions_answered / onboardingSession.total_questions) * 100 : 0}
                  sx={{
                    height: 6,
                    borderRadius: 1,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 1,
                      bgcolor: onboardingSession.status === 'completed' ? '#2E7D32' : 'primary.main',
                    },
                  }}
                />
              </Box>
            </Box>

            {/* Responses */}
            {onboardingResponses.length > 0 && (
              <Box>
                <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5, mb: 1, display: 'block' }}>
                  Responses
                </Typography>
                {onboardingResponses.map((resp, index) => {
                  const question = (resp as any).question;
                  const response = resp.response as any;
                  let displayValue = '--';

                  if ('value' in response) displayValue = response.value;
                  else if ('values' in response) displayValue = response.values.join(', ');
                  else if ('scale' in response) displayValue = `${response.scale}`;

                  return (
                    <Box
                      key={resp.id}
                      sx={{
                        display: 'flex',
                        py: 1,
                        px: 1.5,
                        borderRadius: 1,
                        borderBottom: index < onboardingResponses.length - 1 ? '1px solid' : 'none',
                        borderColor: 'grey.100',
                        '&:hover': { bgcolor: 'grey.50' },
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <Typography variant="body2" sx={{ width: 200, flexShrink: 0, color: 'text.secondary', fontSize: 12.5, fontWeight: 500 }}>
                        {question?.question_text || resp.question_id}
                      </Typography>
                      <Typography variant="body2" sx={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>
                        {displayValue}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </>
        )}
      </Box>
    </Paper>
  );
}
