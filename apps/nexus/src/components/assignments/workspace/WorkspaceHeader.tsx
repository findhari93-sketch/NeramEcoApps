'use client';

/**
 * The row above the drawing: back, the assignment's name, and (from tablet up)
 * the trail to the Assignments list and the class date. The attempt switcher
 * sits at its right edge, beside the drawing it changes.
 */
import type { ReactNode } from 'react';
import NextLink from 'next/link';
import { Box, Breadcrumbs, IconButton, Link as MuiLink, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export default function WorkspaceHeader({
  title,
  meta,
  onBack,
  end,
}: {
  title: string;
  /** "Class 12 Sep · 1 to 5 stars". Shown from tablet width. */
  meta: string;
  onBack: () => void;
  end?: ReactNode;
}) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        pl: { xs: 0.5, md: 1 },
        pr: { xs: 1, md: 2 },
        py: { xs: 0.5, md: 1 },
        minHeight: { xs: 56, md: 64 },
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        flexShrink: 0,
      }}
    >
      <IconButton onClick={onBack} aria-label="Back" sx={{ width: 48, height: 48, flexShrink: 0 }}>
        <ArrowBackIcon />
      </IconButton>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Breadcrumbs
          separator={<NavigateNextIcon sx={{ fontSize: '0.9rem' }} />}
          sx={{ display: { xs: 'none', md: 'block' }, '& ol': { flexWrap: 'nowrap' } }}
        >
          <MuiLink
            component={NextLink}
            href="/student/assignments"
            underline="hover"
            color="text.secondary"
            variant="caption"
            sx={{ fontWeight: 500 }}
          >
            Assignments
          </MuiLink>
          <Typography variant="caption" color="text.secondary" noWrap>
            {meta}
          </Typography>
        </Breadcrumbs>
        <Typography
          component="h1"
          noWrap
          title={title}
          sx={{ fontWeight: 800, fontSize: { xs: '1rem', md: '1.125rem' }, lineHeight: 1.3 }}
        >
          {title}
        </Typography>
      </Box>

      {end}
    </Box>
  );
}
