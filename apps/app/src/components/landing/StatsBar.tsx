'use client';

import { useRef, useState, useEffect } from 'react';
import { Box, Typography, Grid } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import { useInView } from 'framer-motion';
import { STATS } from '@/lib/landing-data';

function AnimatedStat({ stat, isInView }: { stat: typeof STATS[number]; isInView: boolean }) {
  return (
    <Box sx={{ textAlign: 'center', py: { xs: 2, md: 3 } }}>
      <Typography
        sx={{
          fontFamily: 'var(--font-space-mono), "Space Mono", monospace',
          fontSize: { xs: '1.5rem', md: '2rem' },
          fontWeight: 700,
          color: neramTokens.gold[500],
          transition: 'all 0.5s ease',
          opacity: isInView ? 1 : 0,
          transform: isInView ? 'scale(1)' : 'scale(0.8)',
        }}
      >
        {stat.value}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: '0.7rem', md: '0.8rem' },
          color: neramTokens.cream[300],
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          mt: 0.5,
        }}
      >
        {stat.label}
      </Typography>
    </Box>
  );
}

export default function StatsBar() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <Box
      component="section"
      ref={ref}
      sx={{
        bgcolor: neramTokens.navy[800],
        borderTop: `1px solid ${neramTokens.navy[600]}30`,
        borderBottom: `1px solid ${neramTokens.navy[600]}30`,
        py: { xs: 2, md: 3 },
        px: { xs: 2, md: 4 },
      }}
    >
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        <Grid container spacing={0}>
          {STATS.map((stat, i) => (
            <Grid
              item
              xs={6}
              md={3}
              key={stat.label}
              sx={{
                borderRight: {
                  xs: i % 2 === 0 ? `1px solid ${neramTokens.navy[600]}30` : 'none',
                  md: i < STATS.length - 1 ? `1px solid ${neramTokens.navy[600]}30` : 'none',
                },
                borderBottom: {
                  xs: i < 2 ? `1px solid ${neramTokens.navy[600]}30` : 'none',
                  md: 'none',
                },
              }}
            >
              <AnimatedStat stat={stat} isInView={isInView} />
            </Grid>
          ))}
        </Grid>
      </Box>
    </Box>
  );
}
