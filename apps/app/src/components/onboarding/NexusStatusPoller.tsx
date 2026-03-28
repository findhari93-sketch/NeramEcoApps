// @ts-nocheck
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Button, CircularProgress, Chip } from '@neram/ui';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

type NexusStatus = 'not_started' | 'in_progress' | 'submitted' | 'approved' | 'rejected';

const NEXUS_URL = process.env.NEXT_PUBLIC_NEXUS_URL || 'https://nexus.neramclasses.com';

const STATUS_DISPLAY: Record<NexusStatus, { label: string; color: string; icon: React.ElementType }> = {
  not_started: { label: 'Not started', color: 'text.secondary', icon: HourglassEmptyIcon },
  in_progress: { label: 'In progress', color: 'info.main', icon: CircularProgress },
  submitted: { label: 'Submitted — waiting for review', color: 'warning.main', icon: HourglassEmptyIcon },
  approved: { label: 'Approved', color: 'success.main', icon: CheckCircleIcon },
  rejected: { label: 'Rejected — please fix issues in Nexus', color: 'error.main', icon: ErrorOutlineIcon },
};

interface NexusStatusPollerProps {
  initialStatus: NexusStatus;
  getIdToken: () => Promise<string | null>;
  onApproved: () => void;
  isActive: boolean;
}

export default function NexusStatusPoller({
  initialStatus,
  getIdToken,
  onApproved,
  isActive,
}: NexusStatusPollerProps) {
  const [status, setStatus] = useState<NexusStatus>(initialStatus);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const pollStatus = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch('/api/nexus-status', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      const newStatus = (data.status || 'not_started') as NexusStatus;
      setStatus(newStatus);

      if (newStatus === 'approved') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setPolling(false);
        onApproved();
      }
    } catch {
      // Silently continue polling
    }
  }, [getIdToken, onApproved]);

  useEffect(() => {
    if (!isActive || status === 'approved') return;

    setPolling(true);
    intervalRef.current = setInterval(pollStatus, 10_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPolling(false);
    };
  }, [isActive, status, pollStatus]);

  useEffect(() => {
    setStatus(initialStatus);
    if (initialStatus === 'approved') {
      onApproved();
    }
  }, [initialStatus, onApproved]);

  const display = STATUS_DISPLAY[status] || STATUS_DISPLAY.not_started;
  const StatusIcon = display.icon;

  return (
    <Box sx={{ mt: 1.5 }}>
      {/* Status indicator */}
      <Box display="flex" alignItems="center" gap={1} mb={1.5}>
        {status === 'in_progress' ? (
          <CircularProgress size={18} />
        ) : (
          <StatusIcon sx={{ fontSize: 20, color: display.color }} />
        )}
        <Typography variant="body2" fontWeight={600} color={display.color}>
          {display.label}
        </Typography>
        {polling && status !== 'approved' && (
          <Chip label="Checking..." size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
        )}
      </Box>

      {/* Action button */}
      {status !== 'approved' && (
        <Button
          variant="contained"
          size="small"
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          onClick={() => window.open(`${NEXUS_URL}/login?from=app-onboarding`, '_blank')}
          disabled={!isActive}
          sx={{
            borderRadius: 1, textTransform: 'none', fontWeight: 600,
            fontSize: '0.85rem', minHeight: 44,
          }}
        >
          {status === 'not_started' ? 'Open Nexus' :
           status === 'rejected' ? 'Fix in Nexus' :
           'Open Nexus'}
        </Button>
      )}

      {status === 'approved' && (
        <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'success.50', border: '1px solid', borderColor: 'success.light' }}>
          <Typography variant="body2" color="success.dark" fontWeight={600}>
            Nexus onboarding complete!
          </Typography>
        </Box>
      )}
    </Box>
  );
}
