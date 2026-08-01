'use client';

import { useState } from 'react';
import { Box, Typography, Button, Chip, Skeleton, Switch } from '@neram/ui';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DiagnosticsStepList from '../DiagnosticsStepList';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import { stageKeyOf } from '@/lib/student-stage';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import type { AttendanceTabProps, DiagnosticsResult } from './types';

function formatDuration(minutes: number | null) {
  if (!minutes) return '-';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatTime(iso: string | null) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

/**
 * The register: who was here, and the ways to correct it when Teams is wrong.
 *
 * Everything on this tab is a write or a repair, which is why it sits last and
 * why its data is fetched only when it is opened. The two tabs before it read
 * the register; this is the one that argues with it.
 */
export default function RegisterTab({
  classId,
  getToken,
  recordsLoading,
  busy,
  records,
  summary,
  sync,
  onToggle,
  onMarkAllPresent,
  onOpenImport,
  onNotify,
}: AttendanceTabProps) {
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);

  /**
   * Ask the server which link in the Teams chain is broken.
   *
   * This exists because the endpoint requires a bearer token, so it could not be
   * opened in a browser, which is exactly why it went unused during the outage
   * it was built for. The panel already holds a token, so the one place a
   * teacher sees the failure is also the place that can explain it.
   */
  const handleDiagnose = async () => {
    setDiagnosing(true);
    setDiagnostics(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/attendance-diagnostics?class_id=${classId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (data?.steps) setDiagnostics(data as DiagnosticsResult);
      else onNotify(data?.error || 'Could not run diagnostics', 'warning');
    } catch {
      onNotify('Could not run diagnostics', 'warning');
    } finally {
      setDiagnosing(false);
    }
  };

  const syncFailed = !!sync?.status && sync.status !== 'ok';

  return (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Chip label={`Present: ${summary.present}`} color="success" size="small" />
        <Chip label={`Absent: ${summary.absent}`} color="error" size="small" />
        <Chip label={`Total: ${summary.total}`} size="small" />
      </Box>

      {/* Marking by hand is always offered: for imported and channel classes
          Teams often cannot report attendance at all, so this is the reliable
          fallback. Sync itself lives in the header, above the tabs, because it
          refreshes all three of them. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
        <Button
          variant="outlined"
          size="small"
          color="success"
          startIcon={<DoneAllIcon />}
          onClick={onMarkAllPresent}
          disabled={busy || recordsLoading || records.length === 0}
          sx={{ textTransform: 'none', minHeight: 44 }}
        >
          Mark all present
        </Button>
      </Box>

      {/* The recovery row. Only once a sync has actually failed, so the normal
          path stays a one-button tab, and it disappears on its own the day
          Teams starts answering. */}
      {sync?.has_meeting && syncFailed && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          <Button
            variant="text"
            size="small"
            startIcon={<UploadFileOutlinedIcon />}
            onClick={onOpenImport}
            disabled={busy || recordsLoading}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Upload Teams report
          </Button>
          <Button
            variant="text"
            size="small"
            startIcon={<TroubleshootIcon />}
            onClick={handleDiagnose}
            disabled={diagnosing || busy}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {diagnosing ? 'Checking...' : 'Why not?'}
          </Button>
        </Box>
      )}

      {diagnostics && <DiagnosticsStepList steps={diagnostics.steps} ok={diagnostics.ok} />}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Toggle any student to mark them present or absent, changes save instantly.
      </Typography>

      {recordsLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : records.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
          No students enrolled in this classroom yet
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {records.map((record) => (
            <Box
              key={record.student_id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                py: 1,
                px: 1,
                borderRadius: 1,
                // Green when present, red only when explicitly marked absent,
                // neutral while still unmarked so a fresh roster isn't all red.
                bgcolor: record.attended ? 'success.50' : record.source ? 'error.50' : 'action.hover',
              }}
            >
              <StudentStageAvatar
                stage={stageKeyOf(record.study_stage)}
                src={record.student?.avatar_url}
                name={record.student?.name}
                size={32}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                  {record.student?.name || 'Unknown'}
                </Typography>
                {/* Teams telemetry sits under the name so it wraps instead of
                    pushing the toggle off a 375px screen. */}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {record.source === 'teams'
                    ? 'Teams'
                    : record.source === 'manual'
                      ? 'Marked by you'
                      : 'Not marked'}
                  {record.joined_at && ` · Joined ${formatTime(record.joined_at)}`}
                  {record.left_at && `, left ${formatTime(record.left_at)}`}
                  {record.duration_minutes ? ` · ${formatDuration(record.duration_minutes)}` : ''}
                </Typography>
                {/* Why they were away, on the screen where the teacher is already
                    looking at them. Without this, someone who had explained
                    themselves and watched the recording looked identical to
                    someone who had gone silent. */}
                {!record.attended && record.absence && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
                    {record.absence.reason_code
                      ? reasonShortLabel(record.absence.reason_code)
                      : 'No reason given'}
                    {record.absence.reason_source === 'parent' && ', said by a parent'}
                    {record.absence.reason_note && (
                      <Box component="span" sx={{ fontStyle: 'italic', color: 'text.primary' }}>
                        {' '}
                        &ldquo;{record.absence.reason_note}&rdquo;
                      </Box>
                    )}
                    {record.absence.caught_up_at
                      ? ' · caught up'
                      : record.absence.recording_watched_at
                        ? ' · watched the recording'
                        : ''}
                  </Typography>
                )}
              </Box>
              {/* Full-size switch, not small: this is the main repeated tap on a
                  phone and needs to clear the 44px touch-target floor. */}
              <Switch
                checked={record.attended}
                onChange={(e) => onToggle(record.student_id, e.target.checked)}
                color="success"
                inputProps={{ 'aria-label': `Attendance for ${record.student?.name || 'student'}` }}
              />
            </Box>
          ))}
        </Box>
      )}
    </>
  );
}
