'use client';

import { Alert, Button } from '@neram/ui';

interface InsightsLoadErrorProps {
  /** The route's own words when it sent some, e.g. "Could not load the class". */
  message: string | null;
  /** True while a retry is in flight, so the button cannot stack requests. */
  retrying: boolean;
  onRetry: () => void;
}

/**
 * The Attended and Missed tabs when the class's attendance could not be loaded.
 *
 * Before this, both tabs showed skeletons for as long as SWR kept retrying and
 * then an info note with no way forward, so a failed load looked like a slow one
 * and the only escape was closing the drawer. An error Alert carries role="alert",
 * so the failure is announced, and the retry is a real 48px target.
 */
export default function InsightsLoadError({ message, retrying, onRetry }: InsightsLoadErrorProps) {
  return (
    <Alert
      severity="error"
      action={
        <Button
          color="inherit"
          onClick={onRetry}
          disabled={retrying}
          sx={{ minHeight: 48, minWidth: 48, textTransform: 'none', fontWeight: 700 }}
        >
          {retrying ? 'Trying again' : 'Try again'}
        </Button>
      }
      sx={{ alignItems: 'center' }}
    >
      {message || 'Could not load attendance for this class.'}
    </Alert>
  );
}
