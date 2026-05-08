import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import type { AllotmentPhase } from '@/data/keam-arch-2026/schema';

interface KeamPhaseTimelineProps {
  phases: AllotmentPhase[];
}

const PRIMARY_GREEN = '#0d7a4a';

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
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  bgcolor: isConfirmed ? PRIMARY_GREEN : '#fef3c7',
                  color: isConfirmed ? 'white' : '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  flexShrink: 0,
                  border: '2px solid',
                  borderColor: isConfirmed ? PRIMARY_GREEN : '#fde68a',
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
                    bgcolor: 'divider',
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
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {phase.name}
                </Typography>
                <Chip
                  label={isConfirmed ? 'Confirmed' : 'Tentative'}
                  size="small"
                  sx={{
                    bgcolor: isConfirmed ? '#dcfce7' : '#fef3c7',
                    color: isConfirmed ? '#15803d' : '#92400e',
                    fontWeight: 600,
                  }}
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
