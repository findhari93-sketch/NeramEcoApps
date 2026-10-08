'use client';

import { Box, Typography } from '@neram/ui';

interface StepHeadingProps {
  title: string;
  subtitle?: string;
  /** Extra lines under the subtitle, such as the application number on the pay step. */
  children?: React.ReactNode;
}

/** The serif step title and its one-line subtitle, shared by every step. */
export default function StepHeading({ title, subtitle, children }: StepHeadingProps) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="h2"
        component="h1"
        sx={{ fontSize: { xs: 32, md: 42 }, lineHeight: 1.05, letterSpacing: '-0.01em', fontWeight: 700, mb: subtitle || children ? 1 : 0 }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body1" color="text.secondary">
          {subtitle}
        </Typography>
      )}
      {children}
    </Box>
  );
}
