'use client';

/**
 * The one next action, kept under a phone user's thumb.
 *
 * Phones and tablets only: from 900px the steps beside the video are all on
 * screen and carry the same button. Sits 72px up so it clears the 64px bottom
 * navigation, the same offset the feature settings save bar uses.
 */

import { Paper } from '@neram/ui';

export default function StickyActionBar({ children }: { children: React.ReactNode }) {
  return (
    <Paper
      elevation={3}
      sx={{
        position: 'sticky',
        bottom: { xs: 72, md: 16 },
        zIndex: (theme) => theme.zIndex.appBar - 1,
        display: { xs: 'flex', md: 'none' },
        alignItems: 'center',
        gap: 1,
        p: 1.25,
        mt: 2,
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        '& > .MuiButton-root': { flex: 1, minHeight: 48 },
      }}
    >
      {children}
    </Paper>
  );
}
