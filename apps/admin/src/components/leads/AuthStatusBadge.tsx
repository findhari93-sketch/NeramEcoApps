'use client';

/**
 * AuthStatusBadge - Inline color badge showing auth completion status
 * Used in the leads data table for quick scanning.
 */

import { Chip, Tooltip } from '@mui/material';

interface AuthStatusBadgeProps {
  phoneVerified: boolean;
  emailVerified: boolean;
  lastEvent?: string | null;
  dropOffReason?: string | null;
}

const EVENT_LABELS: Record<string, string> = {
  'google_auth_started': 'Auth Started',
  'google_auth_completed': 'Google Auth Done',
  'email_auth_completed': 'Email Auth Done',
  'register_user_completed': 'Registered',
  'phone_screen_shown': 'Phone Screen',
  'phone_number_entered': 'Phone Entered',
  'otp_requested': 'OTP Sent',
  'otp_entered': 'OTP Entered',
  'otp_verified': 'Verified',
  'otp_failed': 'OTP Failed',
  'otp_request_failed': 'OTP Send Failed',
  'phone_already_exists': 'Phone Taken',
  'phone_skipped': 'Skipped Phone',
  'google_auth_failed': 'Auth Failed',
  'register_user_failed': 'Registration Failed',
};

export default function AuthStatusBadge({
  phoneVerified,
  emailVerified,
  lastEvent,
  dropOffReason,
}: AuthStatusBadgeProps) {
  // Determine badge
  if (phoneVerified) {
    return (
      <Chip
        label="Phone Verified"
        size="small"
        sx={{
          bgcolor: '#DCFCE7',
          color: '#166534',
          fontWeight: 600,
          fontSize: '0.7rem',
          height: 22,
        }}
      />
    );
  }

  if (!emailVerified && !lastEvent) {
    return (
      <Chip
        label="No Auth"
        size="small"
        sx={{
          bgcolor: '#F1F5F9',
          color: '#64748B',
          fontSize: '0.7rem',
          height: 22,
        }}
      />
    );
  }

  // Has some auth but not phone verified
  const isError = lastEvent?.includes('failed') || lastEvent === 'phone_already_exists';
  const lastStepLabel = lastEvent ? (EVENT_LABELS[lastEvent] || lastEvent) : 'Google Only';

  if (isError) {
    return (
      <Tooltip title={dropOffReason || 'An error occurred during auth'} arrow>
        <Chip
          label={lastStepLabel}
          size="small"
          sx={{
            bgcolor: '#FEE2E2',
            color: '#991B1B',
            fontWeight: 600,
            fontSize: '0.7rem',
            height: 22,
            cursor: 'pointer',
          }}
        />
      </Tooltip>
    );
  }

  // Partial completion (Google auth done, phone not verified)
  return (
    <Tooltip title={dropOffReason || `Last step: ${lastStepLabel}`} arrow>
      <Chip
        label={lastStepLabel}
        size="small"
        sx={{
          bgcolor: '#FEF3C7',
          color: '#92400E',
          fontWeight: 500,
          fontSize: '0.7rem',
          height: 22,
          cursor: 'pointer',
        }}
      />
    </Tooltip>
  );
}
