'use client';

import { Box, Paper, Typography, Skeleton } from '@neram/ui';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import VideocamIcon from '@mui/icons-material/Videocam';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import DescriptionIcon from '@mui/icons-material/Description';
import VerifiedIcon from '@mui/icons-material/Verified';
import PaidIcon from '@mui/icons-material/Paid';
import SchoolIcon from '@mui/icons-material/School';
import type { PipelineStageCounts, PipelineStage } from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';

interface PipelineFunnelProps {
  counts: PipelineStageCounts | null;
  activeStage: PipelineStage | null;
  onStageClick: (stage: PipelineStage | null) => void;
  loading?: boolean;
}

const STAGE_ICONS: Record<PipelineStage, React.ElementType> = {
  new_lead: FiberNewIcon,
  demo_requested: VideocamIcon,
  demo_attended: HowToRegIcon,
  phone_verified: PhoneAndroidIcon,
  application_submitted: DescriptionIcon,
  admin_approved: VerifiedIcon,
  payment_complete: PaidIcon,
  enrolled: SchoolIcon,
};

const STAGES: PipelineStage[] = [
  'new_lead',
  'demo_requested',
  'demo_attended',
  'phone_verified',
  'application_submitted',
  'admin_approved',
  'payment_complete',
  'enrolled',
];

export default function PipelineFunnel({
  counts,
  activeStage,
  onStageClick,
  loading,
}: PipelineFunnelProps) {
  if (loading || !counts) {
    return (
      <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
        {STAGES.map((stage) => (
          <Skeleton
            key={stage}
            variant="rounded"
            sx={{ minWidth: 148, height: 100, flexShrink: 0, borderRadius: 1.5 }}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        overflowX: 'auto',
        pb: 1,
        '&::-webkit-scrollbar': { height: 5 },
        '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: 'grey.300',
          borderRadius: 1,
        },
      }}
    >
      {STAGES.map((stage) => {
        const config = PIPELINE_STAGE_CONFIG[stage];
        const count = counts[stage] || 0;
        const isActive = activeStage === stage;
        const Icon = STAGE_ICONS[stage];
        const percentage = counts.total > 0 ? Math.round((count / counts.total) * 100) : 0;

        return (
          <Paper
            key={stage}
            elevation={0}
            onClick={() => onStageClick(isActive ? null : stage)}
            sx={{
              position: 'relative',
              minWidth: 148,
              flexShrink: 0,
              cursor: 'pointer',
              borderRadius: 1,
              overflow: 'hidden',
              border: '1.5px solid',
              borderColor: isActive ? config.color : 'grey.200',
              bgcolor: isActive ? `${config.color}08` : 'background.paper',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              '&:hover': {
                borderColor: config.color,
                bgcolor: `${config.color}06`,
                transform: 'translateY(-2px)',
                boxShadow: `0 4px 12px ${config.color}22`,
              },
              ...(isActive && {
                boxShadow: `0 0 0 1px ${config.color}, 0 4px 16px ${config.color}28`,
              }),
            }}
          >
            {/* Top gradient accent */}
            <Box
              sx={{
                height: 3,
                background: `linear-gradient(90deg, ${config.color}, ${config.color}88)`,
                opacity: isActive ? 1 : 0.6,
              }}
            />

            <Box sx={{ p: 2, pt: 1.5 }}>
              {/* Icon + percentage row */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: `${config.color}14`,
                  }}
                >
                  <Icon sx={{ fontSize: 18, color: config.color }} />
                </Box>
                {count > 0 && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.disabled',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {percentage}%
                  </Typography>
                )}
              </Box>

              {/* Count */}
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 26,
                  lineHeight: 1.1,
                  color: count > 0 ? config.color : 'text.disabled',
                  mb: 0.25,
                  fontFamily: '"Inter", "Roboto", sans-serif',
                }}
              >
                {count}
              </Typography>

              {/* Label */}
              <Typography
                sx={{
                  color: 'text.secondary',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                  fontSize: 11.5,
                  letterSpacing: 0.15,
                }}
              >
                {config.label}
              </Typography>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
