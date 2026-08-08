'use client';

import type { ReactNode } from 'react';
import { Box, Button, CircularProgress, Paper, Typography } from '@neram/ui';

/**
 * The bar that carries the step forward.
 *
 * Pinned at `bottom: 64` on mobile, not 0. The bottom nav is 64px tall at
 * theme.zIndex.appBar, and the old builder pinned its selection bar at
 * `bottom: 0, zIndex: 30`, which put it UNDER the nav and overlapping it. Sit
 * above the nav and one below it in z-order, and neither can eat the other.
 */
export default function StickyWizardBar({
  primary,
  secondary,
  summary,
}: {
  primary: { label: string; onClick: () => void; disabled?: boolean; busy?: boolean };
  secondary?: { label: string; onClick: () => void };
  summary?: ReactNode;
}) {
  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: { xs: 64, md: 0 },
        zIndex: (t) => t.zIndex.appBar - 1,
        px: { xs: 2, md: 3 },
        py: 1.5,
        borderRadius: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {typeof summary === 'string' ? (
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {summary}
          </Typography>
        ) : (
          summary
        )}
      </Box>

      {secondary && (
        <Button
          onClick={secondary.onClick}
          sx={{ textTransform: 'none', minHeight: 48, flexShrink: 0 }}
        >
          {secondary.label}
        </Button>
      )}
      <Button
        variant="contained"
        onClick={primary.onClick}
        disabled={primary.disabled || primary.busy}
        startIcon={primary.busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        sx={{ textTransform: 'none', minHeight: 48, flexShrink: 0 }}
      >
        {primary.label}
      </Button>
    </Paper>
  );
}
