'use client';

import { Box, Typography, alpha } from '@neram/ui';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import MilitaryTechOutlinedIcon from '@mui/icons-material/MilitaryTechOutlined';
import {
  neramTokens,
  neramFontFamilies,
  neramShadows,
} from '@neram/ui';

// ── StreakFlame mini component ──

function StreakFlame({ streak }: { streak: number }) {
  const isActive = streak > 0;
  const isHot = streak >= 7;

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LocalFireDepartmentIcon
        sx={{
          fontSize: '1.5rem',
          color: isHot
            ? '#ff6b35'
            : isActive
              ? neramTokens.gold[500]
              : alpha('#8B9DAF', 0.3),
          filter: isHot ? 'drop-shadow(0 0 4px rgba(255,107,53,0.5))' : 'none',
          transition: 'color 300ms ease, filter 300ms ease',
        }}
      />
    </Box>
  );
}

// ── Single stat box ──

interface StatBoxProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  accentColor?: string;
}

function StatBox({ icon, value, label, accentColor }: StatBoxProps) {
  return (
    <Box
      sx={{
        bgcolor: alpha(neramTokens.navy[700], 0.6),
        border: `1px solid ${alpha(neramTokens.cream[100], 0.06)}`,
        borderRadius: 2,
        p: { xs: 1.25, sm: 1.5 },
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        transition: 'border-color 200ms ease',
        '&:hover': {
          borderColor: alpha(accentColor || neramTokens.cream[100], 0.15),
        },
      }}
    >
      {/* Icon */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </Box>

      {/* Value */}
      <Typography
        sx={{
          fontFamily: neramFontFamilies.serif,
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          fontWeight: 700,
          color: neramTokens.cream[100],
          lineHeight: 1,
        }}
      >
        {value}
      </Typography>

      {/* Label */}
      <Typography
        sx={{
          fontFamily: neramFontFamilies.body,
          fontSize: '0.6rem',
          fontWeight: 500,
          color: alpha(neramTokens.cream[100], 0.45),
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

// ── Props ──

interface StudentStatsRowProps {
  streak: number;
  attendancePct: number;
  tasksCompleted: number;
  badgeCount: number;
}

export default function StudentStatsRow({
  streak,
  attendancePct,
  tasksCompleted,
  badgeCount,
}: StudentStatsRowProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: 'repeat(2, 1fr)',
          sm: 'repeat(4, 1fr)',
        },
        gap: 1.5,
      }}
    >
      <StatBox
        icon={<StreakFlame streak={streak} />}
        value={streak}
        label="Day Streak"
        accentColor={neramTokens.gold[500]}
      />
      <StatBox
        icon={
          <EventAvailableOutlinedIcon
            sx={{ fontSize: '1.5rem', color: neramTokens.success }}
          />
        }
        value={`${attendancePct}%`}
        label="Attendance"
        accentColor={neramTokens.success}
      />
      <StatBox
        icon={
          <CheckCircleOutlineIcon
            sx={{ fontSize: '1.5rem', color: neramTokens.blue[500] }}
          />
        }
        value={tasksCompleted}
        label="Tasks Done"
        accentColor={neramTokens.blue[500]}
      />
      <StatBox
        icon={
          <MilitaryTechOutlinedIcon
            sx={{ fontSize: '1.5rem', color: neramTokens.gold[500] }}
          />
        }
        value={badgeCount}
        label="Badges"
        accentColor={neramTokens.gold[500]}
      />
    </Box>
  );
}
