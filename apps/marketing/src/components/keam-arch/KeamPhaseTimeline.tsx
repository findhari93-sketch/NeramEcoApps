import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { siteTokens as t } from '@neram/ui/site-tokens';
import type { AllotmentPhase } from '@/data/keam-arch-2026/schema';

interface KeamPhaseTimelineProps {
  phases: AllotmentPhase[];
}

/** Status pill: outlined, readable on white (green confirmed, gold800 tentative). */
function pillSx(confirmed: boolean) {
  const c = confirmed ? t.success : t.gold800;
  return {
    height: 'auto',
    py: '2px',
    bgcolor: 'transparent',
    color: c,
    border: `1px solid ${c}`,
    fontWeight: 700,
    fontSize: '0.75rem',
  } as const;
}

export default function KeamPhaseTimeline({ phases }: KeamPhaseTimelineProps) {
  return (
    <Stack spacing={0} sx={{ position: 'relative' }}>
      {phases.map((phase, i) => {
        const isLast = i === phases.length - 1;
        const isConfirmed = phase.status === 'confirmed';
        return (
          <Box key={phase.id} sx={{ display: 'flex', gap: 2, position: 'relative' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box
                aria-hidden
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  bgcolor: isConfirmed ? t.success : t.surface,
                  color: isConfirmed ? t.surface : t.gold800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                  border: '2px solid',
                  borderColor: isConfirmed ? t.success : t.lineStrong,
                }}
              >
                {isConfirmed ? (
                  <CheckCircleOutlineIcon fontSize="small" />
                ) : (
                  <HourglassEmptyIcon fontSize="small" />
                )}
              </Box>
              {!isLast && (
                <Box
                  sx={{
                    width: 2,
                    flex: 1,
                    minHeight: 24,
                    bgcolor: t.line,
                    my: 0.5,
                  }}
                />
              )}
            </Box>

            <Paper
              elevation={0}
              sx={{
                flex: 1,
                p: 2,
                mb: isLast ? 0 : 2,
                borderRadius: `${t.radius}px`,
                border: `1px solid ${t.line}`,
                bgcolor: t.surface,
              }}
            >
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {phase.name}
                </Typography>
                <Chip
                  label={isConfirmed ? 'Confirmed' : 'Tentative'}
                  size="small"
                  sx={pillSx(isConfirmed)}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {phase.description}
              </Typography>
            </Paper>
          </Box>
        );
      })}
    </Stack>
  );
}
