'use client';

import { Box, Paper, Typography, Skeleton, Tooltip, useMediaQuery, useTheme } from '@neram/ui';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import VideocamIcon from '@mui/icons-material/Videocam';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import DescriptionIcon from '@mui/icons-material/Description';
import VerifiedIcon from '@mui/icons-material/Verified';
import SchoolIcon from '@mui/icons-material/School';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
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
  payment_complete: SchoolIcon,
  enrolled: SchoolIcon,
};

// Merged: payment_complete and enrolled are the same in this flow
const STAGES: PipelineStage[] = [
  'new_lead',
  'demo_requested',
  'demo_attended',
  'phone_verified',
  'application_submitted',
  'admin_approved',
  'enrolled',
];

export default function PipelineFunnel({
  counts,
  activeStage,
  onStageClick,
  loading,
}: PipelineFunnelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (loading || !counts) {
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${STAGES.length}, 1fr)`,
          gap: isMobile ? 1 : 1.5,
        }}
      >
        {STAGES.map((stage) => (
          <Skeleton
            key={stage}
            variant="rounded"
            sx={{ height: isMobile ? 48 : 100, borderRadius: 1.5 }}
          />
        ))}
      </Box>
    );
  }

  // Combine payment_complete + enrolled counts for the merged "Enrolled" card
  const getStageCount = (stage: PipelineStage) => {
    if (stage === 'enrolled') {
      return (counts.enrolled || 0) + (counts.payment_complete || 0);
    }
    return counts[stage] || 0;
  };

  return (
    <Box>
      {/* Total users badge */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          px: 0.5,
        }}
      >
        <PeopleAltIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
          {counts.total} total users
        </Typography>
        <Tooltip title="Users can appear in multiple stages. Counts below are per-stage, not unique." arrow>
          <Typography
            variant="caption"
            sx={{
              color: 'text.disabled',
              cursor: 'help',
              borderBottom: '1px dashed',
              borderColor: 'text.disabled',
              fontSize: 11,
            }}
          >
            (stage counts)
          </Typography>
        </Tooltip>
      </Box>

      {/* Stage cards */}
      <Box
        sx={
          isMobile
            ? {
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 0.75,
              }
            : {
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
              }
        }
      >
        {STAGES.map((stage) => {
          const config = PIPELINE_STAGE_CONFIG[stage];
          const count = getStageCount(stage);
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
                minWidth: isMobile ? 0 : 130,
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
                  transform: isMobile ? 'none' : 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${config.color}22`,
                },
                ...(isActive && {
                  boxShadow: `0 0 0 1px ${config.color}, 0 4px 16px ${config.color}28`,
                }),
              }}
            >
              {/* Top gradient accent (desktop only) */}
              {!isMobile && (
                <Box
                  sx={{
                    height: 3,
                    background: `linear-gradient(90deg, ${config.color}, ${config.color}88)`,
                    opacity: isActive ? 1 : 0.6,
                  }}
                />
              )}

              <Box sx={{ p: isMobile ? 0.75 : 2, pt: isMobile ? 0.75 : 1.5 }}>
                {isMobile ? (
                  <>
                    {/* Mobile: Icon + Count + Percentage inline */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Box
                        sx={{
                          width: 22,
                          height: 22,
                          borderRadius: 0.75,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: `${config.color}14`,
                          flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 12, color: config.color }} />
                      </Box>
                      <Typography
                        sx={{
                          fontWeight: 800,
                          fontSize: 17,
                          lineHeight: 1,
                          color: count > 0 ? config.color : 'text.disabled',
                          fontFamily: '"Inter", "Roboto", sans-serif',
                        }}
                      >
                        {count}
                      </Typography>
                      {count > 0 && (
                        <Typography
                          variant="caption"
                          sx={{
                            ml: 'auto',
                            color: 'text.disabled',
                            fontSize: 9,
                            fontWeight: 600,
                          }}
                        >
                          {percentage}%
                        </Typography>
                      )}
                    </Box>
                    {/* Label */}
                    <Typography
                      sx={{
                        color: 'text.secondary',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                        fontSize: 10,
                        letterSpacing: 0.15,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {config.label}
                    </Typography>
                  </>
                ) : (
                  <>
                    {/* Desktop: Original layout */}
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
                    <Typography
                      sx={{
                        color: 'text.secondary',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                        fontSize: 11.5,
                        letterSpacing: 0.15,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {config.label}
                    </Typography>
                  </>
                )}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
