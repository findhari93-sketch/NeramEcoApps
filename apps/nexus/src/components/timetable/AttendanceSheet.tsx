'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Avatar,
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

        {/* Sync from Teams button */}
        {teamsMeetingId && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<SyncIcon />}
            onClick={handleSyncTeams}
            disabled={syncing}
            sx={{ mb: 2, textTransform: 'none', minHeight: 36 }}
          >
            {syncing ? 'Syncing...' : 'Sync from Teams'}
          </Button>
        )}

        {/* Attendance list */}
        {loading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
            ))}
          </Box>
        ) : records.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
            No attendance records yet
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
                  bgcolor: record.attended ? 'success.50' : 'error.50',
                }}
              >
                <Avatar
                  src={record.student?.avatar_url || undefined}
                  sx={{ width: 32, height: 32, fontSize: '0.8rem' }}
                >
                  {record.student?.name?.[0] || '?'}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                    {record.student?.name || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {record.source === 'teams' ? 'Teams' : 'Manual'}
                    {record.joined_at && ` · Joined ${formatTime(record.joined_at)}`}
                    {record.duration_minutes && ` · ${formatDuration(record.duration_minutes)}`}
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
