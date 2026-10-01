'use client';

import { Box, Typography, Button } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import Link from 'next/link';
import ArchitectureIcon from '@mui/icons-material/Architecture';
import SquareFootIcon from '@mui/icons-material/SquareFoot';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import { TOOLS_HOME_HREF } from '@/lib/navigation-data';

interface ComingSoonPageProps {
  toolName: string;
  examType: 'NATA' | 'JEE Paper 2';
  description: string;
}

/** Placeholder for a tool that is announced but not built yet. Never a dead end. */
export default function ComingSoonPage({ toolName, examType, description }: ComingSoonPageProps) {
  const Icon = examType === 'NATA' ? ArchitectureIcon : SquareFootIcon;

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', textAlign: 'center', py: { xs: 4, md: 8 } }}>
      <Box
        aria-hidden="true"
        sx={{
          width: 72,
          height: 72,
          mx: 'auto',
          mb: 2.5,
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'primary.main',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
        }}
      >
        <Icon sx={{ fontSize: 36 }} />
      </Box>
      <Typography
        component="p"
        sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}
      >
        {examType} · Coming soon
      </Typography>
      <Typography variant="h1" sx={{ fontSize: { xs: '1.625rem', md: '2rem' }, mb: 1.5 }}>
        {toolName}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: '1rem', lineHeight: 1.6, mb: 4 }}>
        {description} We are building this now. Until then, the tools that are ready can help you plan ahead.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, justifyContent: 'center' }}>
        <Button component={Link} href={TOOLS_HOME_HREF} variant="contained" size="large" startIcon={<GridViewOutlinedIcon />}>
          Browse available tools
        </Button>
        <Button component={Link} href="/dashboard" variant="outlined" size="large">
          Go to home
        </Button>
      </Box>
    </Box>
  );
}
