'use client';

import { Box, Tooltip, Typography } from '@mui/material';
import { getArchIndexLabel, getArchIndexColor } from '@/lib/college-hub/archindex';

interface ArchIndexRingProps {
  score: number;
  size?: number;
  showLabel?: boolean;
  showScore?: boolean;
}

export default function ArchIndexRing({
  score,
  size = 80,
  showLabel = true,
  showScore = true,
}: ArchIndexRingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = getArchIndexColor(score);
  const label = getArchIndexLabel(score);

  return (
    <Tooltip
      title={`ArchIndex: ${score}/100 — ${label}. Neram's proprietary rating based on studio quality, faculty, placements, infrastructure, student satisfaction, and alumni strength.`}
      arrow
    >
      <Box
        sx={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.5,
          cursor: 'help',
        }}
      >
        <Box sx={{ position: 'relative', width: size, height: size }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            {/* Track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={6}
            />
            {/* Progress */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>
          {showScore && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  fontSize: size >= 80 ? '1.1rem' : '0.85rem',
                  lineHeight: 1,
                  color,
                }}
              >
                {score}
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontSize: '0.55rem', color: 'text.secondary', lineHeight: 1 }}
              >
                /100
              </Typography>
            </Box>
          )}
        </Box>
        {showLabel && (
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color, fontSize: '0.7rem', textAlign: 'center' }}
          >
            {label}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}
