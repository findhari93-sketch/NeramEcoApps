'use client';

/**
 * LeadDiagnosticsDrawer - Slide-out panel with auth event timeline
 * Shows: user info, auth timeline, drop-off diagnosis, error logs, actions
 */

import { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Divider,
  Chip,
  Alert,
  CircularProgress,
  Skeleton,
  Button,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DevicesIcon from '@mui/icons-material/Devices';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import TabletIcon from '@mui/icons-material/Tablet';
import type { UserFunnelEvent } from '@neram/database';
import CopyablePhone from '@/components/CopyablePhone';

interface UserErrorLog {
  id: string;
  error_type: string | null;
  error_message: string | null;
  page_url: string | null;
  created_at: string;
}

interface LeadDiagnosticsDrawerProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  userPhone: string | null;
  phoneVerified: boolean;
  createdAt: string;
}

const EVENT_LABELS: Record<string, string> = {
  'google_auth_started': 'Google Sign-in Started',
  'google_auth_popup_opened': 'Google Popup Opened',
  'google_auth_completed': 'Google Auth Completed',
  'google_auth_failed': 'Google Auth Failed',
  'email_auth_started': 'Email Auth Started',
  'email_auth_completed': 'Email Auth Completed',
  'email_auth_failed': 'Email Auth Failed',
  'register_user_started': 'Registration Started',
  'register_user_completed': 'User Registered',
  'register_user_failed': 'Registration Failed',
  'phone_screen_shown': 'Phone Screen Shown',
  'phone_number_entered': 'Phone Number Entered',
  'otp_requested': 'OTP Requested',
  'otp_request_failed': 'OTP Request Failed',
  'otp_entered': 'OTP Entered',
  'otp_verified': 'Phone Verified',
  'otp_failed': 'OTP Verification Failed',
  'phone_already_exists': 'Phone Already Registered',
  'phone_skipped': 'Phone Verification Skipped',
  'onboarding_started': 'Onboarding Started',
  'onboarding_question_answered': 'Question Answered',
  'onboarding_completed': 'Onboarding Completed',
  'onboarding_skipped': 'Onboarding Skipped',
  'application_step_started': 'Application Step Started',
  'application_step_completed': 'Application Step Completed',
  'application_submitted': 'Application Submitted',
};

function DeviceIcon({ type }: { type: string | null }) {
  if (type === 'mobile') return <PhoneAndroidIcon sx={{ fontSize: 16, color: '#64748B' }} />;
  if (type === 'tablet') return <TabletIcon sx={{ fontSize: 16, color: '#64748B' }} />;
  if (type === 'desktop') return <DesktopWindowsIcon sx={{ fontSize: 16, color: '#64748B' }} />;
  return <DevicesIcon sx={{ fontSize: 16, color: '#64748B' }} />;
}

function EventStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircleIcon sx={{ fontSize: 18, color: '#22C55E' }} />;
  if (status === 'failed') return <CancelIcon sx={{ fontSize: 18, color: '#EF4444' }} />;
  if (status === 'skipped') return <WarningAmberIcon sx={{ fontSize: 18, color: '#F59E0B' }} />;
  return <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: '#94A3B8' }} />;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LeadDiagnosticsDrawer({
  open,
  onClose,
  userId,
  userName,
  userEmail,
  userPhone,
  phoneVerified,
  createdAt,
}: LeadDiagnosticsDrawerProps) {
  const [events, setEvents] = useState<UserFunnelEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [errorLogs, setErrorLogs] = useState<UserErrorLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;

    async function fetchData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/crm/funnel-events/${userId}`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data.events || []);
          setDiagnostics(data.diagnostics);
          setErrorLogs(data.errorLogs || []);
        }
      } catch (err) {
        console.error('Failed to fetch diagnostics:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [open, userId]);

  // Group events by funnel
  const authEvents = events.filter(e => e.funnel === 'auth');
  const onboardingEvents = events.filter(e => e.funnel === 'onboarding');
  const applicationEvents = events.filter(e => e.funnel === 'application');

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 420,
          maxWidth: '100vw',
        },
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0' }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {userName || 'Unknown User'}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {userEmail || 'No email'}
          </Typography>
          {userPhone && (
            <CopyablePhone phone={userPhone} variant="caption" textSx={{ color: 'text.secondary' }} />
          )}
          <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
            Joined {formatRelative(createdAt)}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Device info from diagnostics */}
      {diagnostics && (
        <Box sx={{ px: 2, py: 1, bgcolor: '#F8FAFC', display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #E2E8F0' }}>
          <DeviceIcon type={diagnostics.deviceType} />
          <Typography variant="caption" color="text.secondary">
            {[diagnostics.browser, diagnostics.os].filter(Boolean).join(' / ') || 'Unknown device'}
          </Typography>
          {phoneVerified ? (
            <Chip label="Phone Verified" size="small" sx={{ bgcolor: '#DCFCE7', color: '#166534', fontSize: '0.65rem', height: 20, ml: 'auto' }} />
          ) : (
            <Chip label="Phone Not Verified" size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontSize: '0.65rem', height: 20, ml: 'auto' }} />
          )}
        </Box>
      )}

      {/* Drop-off diagnosis */}
      {diagnostics?.dropOffReason && (
        <Alert
          severity="warning"
          sx={{ mx: 2, mt: 1.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}
        >
          <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.25 }}>
            Drop-off Diagnosis
          </Typography>
          {diagnostics.dropOffReason}
        </Alert>
      )}

      {/* Content */}
      <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
        {loading ? (
          <Box>
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="rectangular" height={200} sx={{ mt: 2 }} />
          </Box>
        ) : events.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No funnel events recorded for this user.
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: 'block' }}>
              Events will appear once the tracking system is live and this user goes through the auth flow.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Auth Timeline */}
            {authEvents.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem', letterSpacing: 1 }}>
                  Auth Flow
                </Typography>
                <Box sx={{ mt: 1 }}>
                  {authEvents.map((evt, idx) => (
                    <Box
                      key={evt.id}
                      sx={{
                        display: 'flex',
                        gap: 1.5,
                        position: 'relative',
                        pb: idx < authEvents.length - 1 ? 1.5 : 0,
                        '&::before': idx < authEvents.length - 1 ? {
                          content: '""',
                          position: 'absolute',
                          left: 8,
                          top: 22,
                          bottom: 0,
                          width: 1.5,
                          bgcolor: '#E2E8F0',
                        } : undefined,
                      }}
                    >
                      <Box sx={{ pt: 0.25 }}>
                        <EventStatusIcon status={evt.status} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.8rem' }}>
                            {EVENT_LABELS[evt.event] || evt.event}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem', flexShrink: 0, ml: 1 }}>
                            {formatTime(evt.created_at)}
                          </Typography>
                        </Box>
                        {evt.error_message && (
                          <Typography variant="caption" color="error" sx={{ fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                            {evt.error_code ? `[${evt.error_code}] ` : ''}{evt.error_message}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Onboarding Timeline */}
            {onboardingEvents.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem', letterSpacing: 1 }}>
                  Onboarding
                </Typography>
                <Box sx={{ mt: 1 }}>
                  {onboardingEvents.map((evt, idx) => (
                    <Box
                      key={evt.id}
                      sx={{
                        display: 'flex',
                        gap: 1.5,
                        position: 'relative',
                        pb: idx < onboardingEvents.length - 1 ? 1 : 0,
                        '&::before': idx < onboardingEvents.length - 1 ? {
                          content: '""',
                          position: 'absolute',
                          left: 8,
                          top: 22,
                          bottom: 0,
                          width: 1.5,
                          bgcolor: '#E2E8F0',
                        } : undefined,
                      }}
                    >
                      <Box sx={{ pt: 0.25 }}>
                        <EventStatusIcon status={evt.status} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.8rem' }}>
                            {EVENT_LABELS[evt.event] || evt.event}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                            {formatTime(evt.created_at)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Application Timeline */}
            {applicationEvents.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem', letterSpacing: 1 }}>
                  Application
                </Typography>
                <Box sx={{ mt: 1 }}>
                  {applicationEvents.map((evt, idx) => (
                    <Box
                      key={evt.id}
                      sx={{
                        display: 'flex',
                        gap: 1.5,
                        position: 'relative',
                        pb: idx < applicationEvents.length - 1 ? 1 : 0,
                        '&::before': idx < applicationEvents.length - 1 ? {
                          content: '""',
                          position: 'absolute',
                          left: 8,
                          top: 22,
                          bottom: 0,
                          width: 1.5,
                          bgcolor: '#E2E8F0',
                        } : undefined,
                      }}
                    >
                      <Box sx={{ pt: 0.25 }}>
                        <EventStatusIcon status={evt.status} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.8rem' }}>
                            {EVENT_LABELS[evt.event] || evt.event}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                            {formatTime(evt.created_at)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Error Logs */}
            {errorLogs.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.65rem', letterSpacing: 1 }}>
                  Error Log ({errorLogs.length})
                </Typography>
                <Box sx={{ mt: 1 }}>
                  {errorLogs.slice(0, 5).map((log) => (
                    <Box key={log.id} sx={{ mb: 1, p: 1, bgcolor: '#FEF2F2', borderRadius: 0.5 }}>
                      <Typography variant="caption" fontWeight={600} color="error" sx={{ fontSize: '0.7rem' }}>
                        {log.error_type || 'Error'}
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ fontSize: '0.7rem', color: '#7F1D1D', mt: 0.25 }}>
                        {log.error_message || 'Unknown error'}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                        {log.page_url} &middot; {formatTime(log.created_at)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
