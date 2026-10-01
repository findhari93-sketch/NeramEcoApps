'use client';

import { Alert, Button } from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';

interface RetryAlertProps {
  message: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  severity?: 'error' | 'warning' | 'info';
  sx?: object;
}

/**
 * An error the student can recover from in place: the message plus a 44px
 * Retry button, so a flaky phone connection never leaves a tool stuck.
 */
export default function RetryAlert({ message, onRetry, retryLabel = 'Retry', severity = 'error', sx }: RetryAlertProps) {
  return (
    <Alert
      severity={severity}
      role="alert"
      sx={{ alignItems: 'center', '& .MuiAlert-action': { pt: 0, mr: 0, alignItems: 'center' }, ...sx }}
      action={
        onRetry ? (
          <Button
            color="inherit"
            onClick={onRetry}
            startIcon={<RefreshIcon aria-hidden="true" />}
            sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
          >
            {retryLabel}
          </Button>
        ) : undefined
      }
    >
      {message}
    </Alert>
  );
}
