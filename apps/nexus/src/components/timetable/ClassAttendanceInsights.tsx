'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Skeleton,
  Typography,
  UserAvatar,
  alpha,
} from '@neram/ui';
import SyncIcon from '@mui/icons-material/Sync';
import CloseIcon from '@mui/icons-material/Close';
import { reasonShortLabel, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { type DurationDatum } from './AttendanceDurationChart';

// recharts is heavy; keep it out of the initial bundle and off the server.
const AttendanceDurationChart = dynamic(() => import('./AttendanceDurationChart'), {
  ssr: false,
  loading: () => <Skeleton variant="rectangular" height={160} sx={{ borderRadius: 1 }} />,
});

interface StudentInsight {
  id: string;
  name: string;
  avatar_url: string | null;
  rsvp: 'attending' | 'not_attending';
  reason: string | null;
  attended: boolean;
  duration_minutes: number | null;
  joinedLate: boolean;
  leftEarly: boolean;
  droppedMidClass: boolean;
}

interface Insights {
  class: {
    id: string;
    title: string;
    attendance_synced_at: string | null;
    attendance_sync_status?: string | null;
    /** Human explanation of the last sync failure, resolved server-side. */
    attendance_sync_message?: string | null;
    has_meeting: boolean;
  };
  summary: {
    rosterSize: number;
    present: number;
    absent: number;
    attendanceRate: number;
    avgDuration: number;
    lateCount: number;
    leftEarlyCount: number;
    droppedCount: number;
  };
  buckets: { attendingAttended: number; attendingAbsent: number; declinedAbsent: number; declinedAttended: number };
  reasonTally: Record<RsvpReasonCode, number>;
  students: StudentInsight[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  classId: string;
  classroomId: string;
  classTitle: string;
  getToken: () => Promise<string | null>;
}

function Kpi({ label, value, sub, tone = 'default' }: { label: string; value: string | number; sub?: string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const toneColor = { default: 'text.primary', good: 'success.main', warn: 'warning.main', bad: 'error.main' }[tone];
  return (
    <Box sx={{ flex: '1 1 120px', minWidth: 110, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, color: toneColor, lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{sub}</Typography>}
    </Box>
  );
}

function MatrixCell({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'muted' | 'info' }) {
  return (
    <Box
      sx={{
        flex: '1 1 45%',
        minWidth: 130,
        p: 1.5,
        borderRadius: 2,
        bgcolor: (t) =>
          alpha(
            tone === 'good' ? t.palette.success.main
              : tone === 'bad' ? t.palette.error.main
              : tone === 'info' ? t.palette.info.main
              : t.palette.text.disabled,
            0.12,
          ),
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 800 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

/**
 * Post-class analytics: RSVP (who was expected) vs the actual Teams attendance.
 * Teacher-only. Reads /api/timetable/class-insights; "Sync from Teams" reuses the
 * existing attendance-report sync so the numbers reflect the latest report.
 */
export default function ClassAttendanceInsights({ open, onClose, classId, classroomId, classTitle, getToken }: Props) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/class-insights?class_id=${classId}&classroom_id=${classroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch {
      // Non-fatal; the empty state shows.
    } finally {
      setLoading(false);
    }
  }, [classId, classroomId, getToken]);

  useEffect(() => {
    if (open) {
      setMessage(null);
      load();
    }
  }, [open, load]);

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/timetable/attendance-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ class_id: classId, classroom_id: classroomId, action: 'sync_teams' }),
      });
      const body = await res.json().catch(() => ({}));
      setMessage(res.ok ? `Synced ${body.synced ?? 0} from Teams` : (body.error || 'Sync failed'));
      if (res.ok) await load();
    } catch {
      setMessage('Failed to sync from Teams');
    } finally {
      setSyncing(false);
    }
  };

  const chartData: DurationDatum[] = (data?.students || [])
    .filter((s) => s.attended)
    .map((s) => ({
      name: s.name.split(' ')[0],
      minutes: s.duration_minutes ?? 0,
      flag: s.droppedMidClass ? 'dropped' : s.leftEarly ? 'leftEarly' : s.joinedLate ? 'late' : 'ok',
    }));

  const reasons = data ? (Object.entries(data.reasonTally) as [RsvpReasonCode, number][]).filter(([, n]) => n > 0) : [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <span>Attendance insights</span>
        <Button size="small" onClick={onClose} sx={{ minWidth: 40 }}><CloseIcon fontSize="small" /></Button>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{classTitle}</Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
            onClick={handleSync}
            disabled={syncing}
            sx={{ minHeight: 40 }}
          >
            Sync from Teams
          </Button>
          {data?.class.attendance_synced_at && (
            <Typography variant="caption" color="text.secondary">
              Last synced {new Date(data.class.attendance_synced_at).toLocaleString('en-IN')}
            </Typography>
          )}
        </Box>
        {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}
        {/* Why the last sync produced nothing, resolved server-side from the
            persisted status code. Without this an empty sheet is unexplained. */}
        {!message && data?.class.attendance_sync_message && (
          <Alert severity="warning" sx={{ mb: 2 }}>{data.class.attendance_sync_message}</Alert>
        )}

        {loading ? (
          <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} />
        ) : !data ? (
          <Alert severity="info">Could not load insights.</Alert>
        ) : (
          <>
            {/* KPIs */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Kpi label="Attended" value={`${data.summary.present}/${data.summary.rosterSize}`} sub={`${data.summary.attendanceRate}% present`} tone="good" />
              <Kpi label="Avg time" value={`${data.summary.avgDuration}m`} />
              <Kpi label="Joined late" value={data.summary.lateCount} tone={data.summary.lateCount ? 'warn' : 'default'} />
              <Kpi label="Left early" value={data.summary.leftEarlyCount} tone={data.summary.leftEarlyCount ? 'warn' : 'default'} />
              <Kpi label="Dropped mid-class" value={data.summary.droppedCount} tone={data.summary.droppedCount ? 'bad' : 'default'} />
            </Box>

            {/* RSVP vs actual */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>RSVP said vs what happened</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
              <MatrixCell label="Said attending, came" value={data.buckets.attendingAttended} tone="good" />
              <MatrixCell label="Said attending, absent" value={data.buckets.attendingAbsent} tone="bad" />
              <MatrixCell label="Said can't make it, absent" value={data.buckets.declinedAbsent} tone="muted" />
              <MatrixCell label="Said can't make it, came" value={data.buckets.declinedAttended} tone="info" />
            </Box>

            {/* Duration chart */}
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>How long each student stayed</Typography>
            <AttendanceDurationChart data={chartData} />

            {/* No-show reasons */}
            {reasons.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Reasons given for not attending</Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
                  {reasons.map(([code, n]) => (
                    <Chip key={code} size="small" label={`${reasonShortLabel(code)}: ${n}`} />
                  ))}
                </Box>
              </>
            )}

            {/* Per-student list */}
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Students</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {data.students.map((s) => (
                <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75 }}>
                  <UserAvatar name={s.name} src={s.avatar_url} size={32} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.attended ? `${s.duration_minutes ?? 0} min` : 'Did not attend'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {s.attended
                      ? <Chip size="small" color="success" variant="outlined" label="Attended" />
                      : <Chip size="small" variant="outlined" label={s.rsvp === 'not_attending' ? `Declined: ${reasonShortLabel(s.reason)}` : 'Absent'} />}
                    {s.joinedLate && <Chip size="small" color="warning" variant="outlined" label="Late" />}
                    {s.leftEarly && <Chip size="small" color="warning" variant="outlined" label="Left early" />}
                    {s.droppedMidClass && <Chip size="small" color="error" variant="outlined" label="Dropped" />}
                    {s.rsvp === 'not_attending' && s.attended && <Chip size="small" color="info" variant="outlined" label="Came anyway" />}
                  </Box>
                </Box>
              ))}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
