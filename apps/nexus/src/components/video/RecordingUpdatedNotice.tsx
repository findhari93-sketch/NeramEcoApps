'use client';

import { Alert, Button } from '@neram/ui';

/**
 * Shown when a class recording was swapped for its trimmed copy (silent parts
 * removed) while this page was open. The page's times are on the old recording,
 * so saving has stopped; a reload picks up the new one with the student's place
 * already moved onto it.
 */
export default function RecordingUpdatedNotice() {
  return (
    <Alert
      severity="info"
      role="status"
      sx={{ mb: 2, alignItems: 'center' }}
      action={
        <Button
          color="inherit"
          variant="outlined"
          onClick={() => window.location.reload()}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
        >
          Reload
        </Button>
      }
    >
      This recording was just shortened to skip the silent parts. Reload to carry on from where you were.
    </Alert>
  );
}
