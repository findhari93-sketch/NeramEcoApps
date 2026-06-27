'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, Alert, AlertTitle, CircularProgress, Chip } from '@neram/ui';
import WindowIcon from '@mui/icons-material/Window';
import BlockIcon from '@mui/icons-material/Block';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import { INK, MUTED, LINE } from './theme';

interface AlumniMsSectionProps {
  userId: string;
  /** Called after a successful offboard so the parent can refresh. */
  onChanged?: () => void;
  compact?: boolean;
}

/**
 * Microsoft offboarding status + one-click retry for an alumnus. Reads ms-status
 * (best-effort) and offers "Remove license & disable" which calls ms-offboard.
 * Used in both the alumni drawer and the full profile page.
 */
export default function AlumniMsSection({ userId, onChanged, compact }: AlumniMsSectionProps) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureNote, setCaptureNote] = useState('');
  const [result, setResult] = useState<any>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}/ms-status`);
      setStatus(await res.json());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const runOffboard = async () => {
    setRunning(true);
    setResult(null);
    setCaptureNote('');
    try {
      const res = await fetch(`/api/crm/alumni/${userId}/ms-offboard`, { method: 'POST' });
      const data = await res.json();
      setResult(data.ms || { error: data.error });
      await loadStatus();
      onChanged?.();
    } catch (e: any) {
      setResult({ configError: { message: e?.message || 'Failed' } });
    } finally {
      setRunning(false);
    }
  };

  const runCapture = async () => {
    setCapturing(true);
    setCaptureNote('');
    setResult(null);
    try {
      const res = await fetch(`/api/crm/alumni/${userId}/ms-capture`, { method: 'POST' });
      const data = await res.json();
      if (data.configError) {
        setCaptureNote(data.configError.message + (data.configError.fix ? ` ${data.configError.fix}` : ''));
      } else if (data.success) {
        const bits = [data.photoCaptured && 'photo', data.detailsCaptured && 'details'].filter(Boolean);
        setCaptureNote(bits.length ? `Captured ${bits.join(' + ')} from Microsoft.` : 'No photo/details found on Microsoft.');
        onChanged?.();
      } else {
        setCaptureNote(data.error || 'Capture failed.');
      }
    } catch (e: any) {
      setCaptureNote(e?.message || 'Capture failed.');
    } finally {
      setCapturing(false);
    }
  };

  // The stored ms_oid points at a Microsoft account that no longer exists, or the
  // student never had one. Either way there is nothing to offboard, so render a
  // neutral note instead of the alarming "status unavailable" warning.
  const accountRemoved = status?.accountRemoved === true || status?.error?.code === 'account_not_found';

  if (!loading && status && (status.hasMsAccount === false || accountRemoved)) {
    return (
      <Typography variant="body2" sx={{ color: MUTED }}>
        {accountRemoved ? 'Microsoft account already removed (nothing to revoke).' : 'No Microsoft account linked.'}
      </Typography>
    );
  }

  const hasDirect = (status?.directSkuIds?.length || 0) > 0;
  const signInDisabled = status?.accountEnabled === false;
  const fullyOffboarded = status && !status.error && !hasDirect && signInDisabled;
  const ms = result;

  return (
    <Box>
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <CircularProgress size={16} />
          <Typography variant="caption" sx={{ color: MUTED }}>
            Checking Microsoft status...
          </Typography>
        </Box>
      ) : status?.error ? (
        <Alert severity="warning" sx={{ mb: 1 }}>
          Microsoft status unavailable: {status.error.message}
          {status.error.fix ? ` ${status.error.fix}` : ''}
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1 }}>
          <Chip
            size="small"
            label={`License: ${hasDirect ? `active (${status.directSkuIds.length})` : 'removed'}`}
            color={hasDirect ? 'default' : 'success'}
            variant={hasDirect ? 'filled' : 'outlined'}
            sx={{ height: 22, fontSize: 11 }}
          />
          <Chip
            size="small"
            label={`Sign-in: ${status?.accountEnabled === false ? 'disabled' : status?.accountEnabled === true ? 'enabled' : 'unknown'}`}
            color={signInDisabled ? 'success' : 'default'}
            variant={signInDisabled ? 'outlined' : 'filled'}
            sx={{ height: 22, fontSize: 11 }}
          />
          {status?.groupSkuIds?.length > 0 && (
            <Chip size="small" label={`${status.groupSkuIds.length} group license`} color="warning" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
          )}
          {fullyOffboarded && <Chip size="small" label="Offboarded" color="success" sx={{ height: 22, fontSize: 11 }} />}
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {!fullyOffboarded && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={running ? <CircularProgress size={14} color="inherit" /> : <BlockIcon />}
            disabled={running}
            onClick={runOffboard}
            sx={{ textTransform: 'none', borderRadius: 1.5 }}
          >
            {running ? 'Running...' : 'Remove license & disable'}
          </Button>
        )}
        <Button
          size="small"
          variant="outlined"
          startIcon={capturing ? <CircularProgress size={14} /> : <PhotoCameraOutlinedIcon />}
          disabled={capturing}
          onClick={runCapture}
          sx={{ textTransform: 'none', borderRadius: 1.5, borderColor: LINE, color: INK }}
        >
          {capturing ? 'Capturing...' : 'Capture photo & details'}
        </Button>
      </Box>
      {captureNote && (
        <Typography variant="caption" sx={{ color: MUTED, display: 'block', mt: 1 }}>
          {captureNote}
        </Typography>
      )}

      {/* Offboard result */}
      {ms && (
        <Box sx={{ mt: 1.5 }}>
          {ms.configError ? (
            <Alert severity="warning">
              <AlertTitle>{ms.configError.message}</AlertTitle>
              {ms.configError.fix}
            </Alert>
          ) : ms.error ? (
            <Alert severity="error">{String(ms.error)}</Alert>
          ) : (
            <Alert severity={ms.failures?.length ? 'warning' : 'success'}>
              {ms.accountGone ? (
                'No active Microsoft account (it was already removed), so there was nothing to revoke.'
              ) : (
                <>
                  Disabled sign-in: {ms.disabled}. Licenses removed: {ms.licensesRemoved}.
                  {ms.photosCaptured || ms.detailsCaptured
                    ? ` Captured ${[ms.photosCaptured && 'photo', ms.detailsCaptured && 'details'].filter(Boolean).join(' + ')} from Microsoft.`
                    : ''}
                  {ms.groupAssigned?.length ? ` Group-assigned (manual): ${ms.groupAssigned.join(', ')}.` : ''}
                  {ms.failures?.length ? ` ${ms.failures.length} step(s) failed: ${ms.failures[0]?.message || ''}` : ''}
                </>
              )}
            </Alert>
          )}
        </Box>
      )}

      {!compact && (
        <Typography variant="caption" sx={{ color: MUTED, display: 'block', mt: 1 }}>
          <WindowIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5, color: LINE }} />
          Frees the paid M365 seat and blocks Microsoft sign-in. Reversible via Restore.
        </Typography>
      )}
    </Box>
  );
}
