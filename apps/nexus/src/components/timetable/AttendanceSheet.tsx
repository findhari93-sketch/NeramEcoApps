'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  UserAvatar,
  Chip,
  Skeleton,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@neram/ui';
import SyncIcon from '@mui/icons-material/Sync';
import DoneAllIcon from '@mui/icons-material/DoneAll';

interface AttendanceRecord {
  id: string;
  student_id: string;
  attended: boolean;
  joined_at: string | null;
  left_at: string | null;
  duration_minutes: number | null;
  source: string;
  student: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
}

interface AttendanceSheetProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  classTitle: string;
  classroomId: string;
  teamsMeetingId: string | null;
  getToken: () => Promise<string | null>;
}

export default function AttendanceSheet({
  open,
  onClose,
  classId,
  classTitle,
  classroomId,
  teamsMeetingId,
  getToken,
}: AttendanceSheetProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState({ present: 0, absent: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable/attendance-report?class_id=${classId}&classroom_id=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setRecords(data.attendance || []);
        setSummary(data.summary || { present: 0, absent: 0, total: 0 });
      }
    } catch (err) {
      console.error('Failed to load attendance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchAttendance();
      setMessage(null);
    }
  }, [open, classId]);

  const handleSyncTeams = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable/attendance-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: classroomId,
          action: 'sync_teams',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMessage(`Synced ${data.synced} records from Teams`);
        fetchAttendance();
      } else {
        setMessage(data.error || 'Sync failed');
      }
    } catch (err) {
      setMessage('Failed to sync from Teams');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAttendance = async (studentId: string, attended: boolean) => {
    try {
      const token = await getToken();
      if (!token) return;

      await fetch('/api/timetable/attendance-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: classroomId,
          action: 'manual_mark',
          records: [{ student_id: studentId, attended }],
        }),
      });

      // Update local state
      setRecords((prev) =>
        prev.map((r) => (r.student_id === studentId ? { ...r, attended, source: 'manual' } : r))
      );
      setSummary((prev) => ({
        ...prev,
        present: prev.present + (attended ? 1 : -1),
        absent: prev.absent + (attended ? -1 : 1),
      }));
    } catch (err) {
      console.error('Failed to toggle attendance:', err);
    }
  };

  // Bulk fallback: mark every enrolled student present in one go. Handy when the
  // whole class showed up but Teams could not report it (imported/group meetings).
  const handleMarkAllPresent = async () => {
    if (records.length === 0) return;
    setSavingAll(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/timetable/attendance-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          class_id: classId,
          classroom_id: classroomId,
          action: 'manual_mark',
          records: records.map((r) => ({ student_id: r.student_id, attended: true })),
        }),
      });
      if (res.ok) {
        setRecords((prev) => prev.map((r) => ({ ...r, attended: true, source: 'manual' })));
        setSummary((prev) => ({ ...prev, present: prev.total, absent: 0 }));
        setMessage('Marked everyone present.');
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage(data.error || 'Could not save attendance');
      }
    } catch {
      setMessage('Could not save attendance');
    } finally {
      setSavingAll(false);
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '-';
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '-';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={false}>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Attendance
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {classTitle}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {message && (
          <Alert severity="info" sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>
            {message}
          </Alert>
        )}

        {/* Summary */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Chip label={`Present: ${summary.present}`} color="success" size="small" />
          <Chip label={`Absent: ${summary.absent}`} color="error" size="small" />
          <Chip label={`Total: ${summary.total}`} size="small" />
        </Box>

        {/* Actions: pull from Teams if we can, and always allow marking by hand.
            For imported/channel classes Teams often can't report attendance, so
            manual marking is the reliable fallback, hence it's always offered. */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {teamsMeetingId && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<SyncIcon />}
              onClick={handleSyncTeams}
              disabled={syncing || savingAll}
              sx={{ textTransform: 'none', minHeight: 40 }}
            >
              {syncing ? 'Syncing...' : 'Sync from Teams'}
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            color="success"
            startIcon={<DoneAllIcon />}
            onClick={handleMarkAllPresent}
            disabled={savingAll || loading || records.length === 0}
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            {savingAll ? 'Saving...' : 'Mark all present'}
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Toggle any student to mark them present or absent, changes save instantly.
        </Typography>

        {/* Attendance list */}
        {loading ? (
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
                <UserAvatar
                  src={record.student?.avatar_url}
                  name={record.student?.name}
                  size={32}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                    {record.student?.name || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {record.source === 'teams' ? 'Teams' : record.source === 'manual' ? 'Marked by you' : 'Not marked'}
                    {record.joined_at && ` · Joined ${formatTime(record.joined_at)}`}
                    {record.duration_minutes ? ` · ${formatDuration(record.duration_minutes)}` : ''}
                  </Typography>
                </Box>
                <Switch
                  checked={record.attended}
                  onChange={(e) => handleToggleAttendance(record.student_id, e.target.checked)}
                  size="small"
                  color="success"
                />
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
