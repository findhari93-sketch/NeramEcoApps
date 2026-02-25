'use client';

import { Box, Typography } from '@neram/ui';
import type { ReactNode } from 'react';

interface InfoRowProps {
  label: string;
  value: string | number | null | undefined;
  icon?: ReactNode;
}

export default function InfoRow({ label, value, icon }: InfoRowProps) {
  if (value === null || value === undefined || value === '') return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        py: 1,
        '&:not(:last-child)': {
          borderBottom: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      {icon && (
        <Box sx={{ mr: 1.5, mt: 0.25, color: 'text.secondary', flexShrink: 0 }}>
          {icon}
        </Box>
      )}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: { xs: '40%', md: '35%' }, flexShrink: 0 }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Box>
  );
}
