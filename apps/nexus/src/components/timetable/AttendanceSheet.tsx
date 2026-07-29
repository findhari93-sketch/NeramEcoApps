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
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DiagnosticsStepList, { type DiagnosticStep } from './DiagnosticsStepList';
import TeamsCsvImportDialog from './TeamsCsvImportDialog';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import { stageKeyOf } from '@/lib/student-stage';
import type { RosterCandidate } from '@/lib/teams-attendance-csv';

interface AttendanceRecord {
  id: string;
  student_id: string;
  attended: boolean;
  /** nexus_enrollments.current_standard, display only. */
  study_stage?: string | null;
  joined_at: string | null;
  left_at: string | null;
  duration_minutes: number | null;
  source: string;
  /** Every address this student might have joined Teams under, lowercased. */
  match_emails?: string[];
  student: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
  };
}

/** Why the last Teams sync did or did not produce anything. */
interface SyncState {
  synced_at: string | null;
  status: string | null;
  /** Human explanation, already resolved server-side from the status code. */
  message: string | null;
  has_meeting: boolean;
}

/** The shape /api/timetable/attendance-diagnostics returns. */
interface DiagnosticsResult {
  ok: boolean;
  blocking_step: string | null;
  steps: DiagnosticStep[];
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
  const [severity, setSeverity] = useState<'info' | 'warning' | 'success'>('info');
  const [sync, setSync] = useState<SyncState | null>(null);
  const [unmatched, setUnmatched] = useState(0);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [classAnchor, setClassAnchor] = useState<string | null>(null);

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
        setSync(data.sync ?? null);
        // The Teams report writes bare wall-clock times with no offset, so the
        // importer needs this class's start to anchor them against.
        setClassAnchor(
          data.class?.scheduled_date
            ? `${data.class.scheduled_date}T${String(data.class.start_time ?? '00:00').substring(0, 5)}:00+05:30`
            : null,
        );
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
      setUnmatched(0);
      setDiagnostics(null);
    }
  }, [open, classId]);

  /**
   * The roster in the shape the CSV importer matches against. Built from what
   * this dialog already fetched, so the import dialog makes no network call at
   * all until the teacher commits.
   */
  const importRoster: RosterCandidate[] = records.map((record) => ({
    student_id: record.student_id,
    name: record.student?.name ?? null,
    match_emails: record.match_emails ?? (record.student?.email ? [record.student.email.toLowerCase()] : []),
  }));

  /**
   * Ask the server which link in the Teams chain is broken.
   *
   * This exists because the endpoint requires a bearer token, so it could not be
   * opened in a browser, which is exactly why it went unused during the outage it
   * was built for. The dialog already holds a token, so the one place a teacher
   * sees the failure is also the place that can explain it.
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
      if (data?.steps) {
        setDiagnostics(data as DiagnosticsResult);
      } else {
        setSeverity('warning');
        setMessage(data?.error || 'Could not run diagnostics');
      }
    } catch {
      setSeverity('warning');
      setMessage('Could not run diagnostics');
    } finally {
      setDiagnosing(false);
    }
  };

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
        const count = data.synced ?? 0;
        setUnmatched(data.unmatched ?? 0);
        setSeverity(count > 0 ? 'success' : 'warning');
        setMessage(
          count > 0
            ? `Synced ${count} ${count === 1 ? 'student' : 'students'} from Teams.`
            : data.message || 'Teams returned no attendance for this class.',
        );
        fetchAttendance();
      } else {
        // The server maps each failure code to a specific explanation, so a
        // missing Azure grant no longer looks the same as a class that has not
        // happened yet. When it also knows who organized the meeting, say so:
        // that person's own account can read the attendance with no Teams policy
        // change at all, which is the fastest way out of this state.
        setSeverity('warning');
        const hint =
          data.organizer?.name && data.organizer.is_caller === false
            ? ` ${data.organizer.name} organized this meeting. If they sign into Nexus and press Sync from Teams, their own account can read it without any Teams policy change.`
            : '';
        setMessage(`${data.error || 'Sync failed'}${hint}`);
      }
    } catch (err) {
      setSeverity('warning');
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
          <Alert severity={severity} sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>
            {message}
            {unmatched > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                {unmatched} {unmatched === 1 ? 'person' : 'people'} joined who are not on this
                roster, so they were skipped.
              </Typography>
            )}
          </Alert>
        )}

        {/* Standing explanation from the last sync, so a teacher opening the sheet
            cold still learns why it is empty without pressing anything. */}
        {!message && sync?.status && sync.status !== 'ok' && sync.message && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {sync.message}
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

        {/* The recovery row. Only rendered once a sync has actually failed, so
            the normal path stays a two-button dialog, and it disappears on its
            own the day Teams starts answering. Two text buttons on their own
            row rather than a third and fourth button above, so they wrap to one
            column at 375px instead of crowding the primary actions. */}
        {teamsMeetingId && sync?.status && sync.status !== 'ok' && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            <Button
              variant="text"
              size="small"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => setImportOpen(true)}
              disabled={syncing || savingAll || loading}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              Upload Teams report
            </Button>
            <Button
              variant="text"
              size="small"
              startIcon={<TroubleshootIcon />}
              onClick={handleDiagnose}
              disabled={diagnosing || syncing}
              sx={{ textTransform: 'none', minHeight: 44 }}
            >
              {diagnosing ? 'Checking...' : 'Why not?'}
            </Button>
          </Box>
        )}

        {diagnostics && (
          <DiagnosticsStepList steps={diagnostics.steps} ok={diagnostics.ok} />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: sync?.synced_at ? 0.5 : 2 }}>
          Toggle any student to mark them present or absent, changes save instantly.
        </Typography>
        {sync?.synced_at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Synced from Teams on{' '}
            {new Date(sync.synced_at).toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Typography>
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
                    {record.source === 'teams' ? 'Teams' : record.source === 'manual' ? 'Marked by you' : 'Not marked'}
                    {record.joined_at && ` · Joined ${formatTime(record.joined_at)}`}
                    {record.left_at && `, left ${formatTime(record.left_at)}`}
                    {record.duration_minutes ? ` · ${formatDuration(record.duration_minutes)}` : ''}
                  </Typography>
                </Box>
                {/* Full-size switch, not small: this is the main repeated tap on a
                    phone and needs to clear the 44px touch-target floor. */}
                <Switch
                  checked={record.attended}
                  onChange={(e) => handleToggleAttendance(record.student_id, e.target.checked)}
                  color="success"
                  inputProps={{ 'aria-label': `Attendance for ${record.student?.name || 'student'}` }}
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

      <TeamsCsvImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        classId={classId}
        classroomId={classroomId}
        classAnchorIso={classAnchor}
        roster={importRoster}
        getToken={getToken}
        onImported={() => {
          setSeverity('success');
          setMessage('Imported the Teams attendance report.');
          fetchAttendance();
        }}
      />
    </Dialog>
  );
}
