'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SyncIcon from '@mui/icons-material/Sync';
import TeamsCsvImportDialog from '../TeamsCsvImportDialog';
import WhoCameTab from './WhoCameTab';
import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceTabKey,
  AttendanceTabProps,
  Insights,
  SyncState,
} from './types';
import type { RosterCandidate } from '@/lib/teams-attendance-csv';

// Lazy: a teacher who only marks the register never pays for the analytics tab
// or the recharts bundle it pulls in behind it.
const HowItWentTab = dynamic(() => import('./HowItWentTab'), {
  loading: () => <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} />,
});

const EMPTY_SUMMARY: AttendanceSummary = {
  present: 0,
  absent: 0,
  total: 0,
  missed: 0,
  explained: 0,
  caughtUp: 0,
};

interface ClassAttendanceDialogProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  classTitle: string;
  /**
   * The class's OWN classroom_id, not the teacher's active classroom. Both
   * routes behind this dialog guard on class-in-classroom and 404 on a
   * mismatch, so a Common class scheduled against another classroom used to
   * open onto an empty register with no explanation.
   */
  classroomId: string;
  /** Null means Teams has nothing to sync from, so no Sync button anywhere. */
  teamsMeetingId: string | null;
  getToken: () => Promise<string | null>;
  /** Which tab to open on. Defaults to the register. */
  initialTab?: AttendanceTabKey;
  /** Fired after every write, so the caller's cached summary stays honest. */
  onChanged?: () => void;
}

/**
 * One surface for a class's attendance: the register and what it adds up to.
 *
 * These were two dialogs behind two buttons. They fetched the same roster and
 * the same nexus_attendance rows through two different routes, rendered the
 * same students twice, and went stale against each other: syncing in one left
 * the other showing the old numbers, and marking someone present by hand left
 * the KPIs describing a class that no longer existed. Merging them is mostly
 * about where the state lives, which is here, once.
 */
export default function ClassAttendanceDialog({
  open,
  onClose,
  classId,
  classTitle,
  classroomId,
  teamsMeetingId,
  getToken,
  initialTab = 'who',
  onChanged,
}: ClassAttendanceDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [tab, setTab] = useState<AttendanceTabKey>(initialTab);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>(EMPTY_SUMMARY);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [classAnchor, setClassAnchor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  // Insights are fetched on first open of that tab and refetched only when a
  // write has invalidated them. Without the stale flag, marking a student
  // present and switching tabs would show the KPIs from before the correction.
  const insightsStale = useRef(true);

  const [syncing, setSyncing] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'info' | 'warning' | 'success'>('info');
  const [unmatched, setUnmatched] = useState(0);

  const notify = useCallback((text: string, tone: 'info' | 'warning' | 'success') => {
    setSeverity(tone);
    setMessage(text);
  }, []);

  /** A write happened: the register is refreshed here, the analytics on demand. */
  const invalidate = useCallback(() => {
    insightsStale.current = true;
    onChanged?.();
  }, [onChanged]);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/timetable/attendance-report?class_id=${classId}&classroom_id=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setRecords(data.attendance || []);
        setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
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
  }, [classId, classroomId, getToken]);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/timetable/class-insights?class_id=${classId}&classroom_id=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        setInsights(await res.json());
        insightsStale.current = false;
      }
    } catch {
      // Non-fatal; the tab shows its own empty state.
    } finally {
      setInsightsLoading(false);
    }
  }, [classId, classroomId, getToken]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setMessage(null);
    setUnmatched(0);
    setInsights(null);
    insightsStale.current = true;
    fetchAttendance();
    // initialTab is deliberately not a dependency: changing which tab the caller
    // would open on must not yank a teacher off the tab they are reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, classroomId, fetchAttendance]);

  useEffect(() => {
    if (open && tab === 'how' && insightsStale.current && !insightsLoading) fetchInsights();
  }, [open, tab, insightsLoading, fetchInsights]);

  const handleSyncTeams = async () => {
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const count = data.synced ?? 0;
        setUnmatched(data.unmatched ?? 0);
        notify(
          count > 0
            ? `Synced ${count} ${count === 1 ? 'student' : 'students'} from Teams.`
            : data.message || 'Teams returned no attendance for this class.',
          count > 0 ? 'success' : 'warning',
        );
        invalidate();
        await fetchAttendance();
        // One sync now refreshes both tabs. It used to refresh whichever dialog
        // the teacher happened to have open and leave the other one lying.
        if (tab === 'how') await fetchInsights();
      } else {
        // The server maps each failure code to a specific explanation, so a
        // missing Azure grant no longer looks the same as a class that has not
        // happened yet. When it also knows who organized the meeting, say so:
        // that person's own account can read the attendance with no Teams policy
        // change at all, which is the fastest way out of this state.
        const hint =
          data.organizer?.name && data.organizer.is_caller === false
            ? ` ${data.organizer.name} organized this meeting. If they sign into Nexus and press Sync from Teams, their own account can read it without any Teams policy change.`
            : '';
        notify(`${data.error || 'Sync failed'}${hint}`, 'warning');
      }
    } catch {
      notify('Failed to sync from Teams', 'warning');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (studentId: string, attended: boolean) => {
    // Optimistic: the switch must not lag the tap. A failure re-reads the truth.
    setRecords((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, attended, source: 'manual' } : r)),
    );
    setSummary((prev) => ({
      ...prev,
      present: prev.present + (attended ? 1 : -1),
      absent: prev.absent + (attended ? -1 : 1),
    }));
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
          records: [{ student_id: studentId, attended }],
        }),
      });
      if (!res.ok) {
        notify('Could not save that change', 'warning');
        await fetchAttendance();
        return;
      }
      invalidate();
    } catch {
      notify('Could not save that change', 'warning');
      await fetchAttendance();
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
        notify('Marked everyone present.', 'success');
        invalidate();
      } else {
        const data = await res.json().catch(() => ({}));
        notify(data.error || 'Could not save attendance', 'warning');
      }
    } catch {
      notify('Could not save attendance', 'warning');
    } finally {
      setSavingAll(false);
    }
  };

  /**
   * The roster in the shape the CSV importer matches against. Built from what
   * this dialog already fetched, so the import dialog makes no network call at
   * all until the teacher commits.
   */
  const importRoster: RosterCandidate[] = records.map((record) => ({
    student_id: record.student_id,
    name: record.student?.name ?? null,
    match_emails:
      record.match_emails ?? (record.student?.email ? [record.student.email.toLowerCase()] : []),
  }));

  const tabProps: AttendanceTabProps = {
    classId,
    classroomId,
    getToken,
    loading,
    busy: syncing || savingAll,
    records,
    summary,
    sync,
    insights,
    insightsLoading,
    onToggle: handleToggle,
    onMarkAllPresent: handleMarkAllPresent,
    onOpenImport: () => setImportOpen(true),
    onNotify: notify,
  };

  const syncFailed = !!sync?.status && sync.status !== 'ok';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={fullScreen}>
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Attendance
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {classTitle}
        </Typography>
      </DialogTitle>

      {/* Sync sits above the tabs, not inside one. It refreshes both, so putting
          it on a tab made it look like it only refreshed that tab, and the
          insights copy offered it even for a class with no meeting to sync. */}
      {teamsMeetingId && (
        <Box sx={{ px: 3, pb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
            onClick={handleSyncTeams}
            disabled={syncing || savingAll}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {syncing ? 'Syncing...' : 'Sync from Teams'}
          </Button>
          {sync?.synced_at && (
            <Typography variant="caption" color="text.secondary">
              Last synced{' '}
              {new Date(sync.synced_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Typography>
          )}
        </Box>
      )}

      <Tabs
        value={tab}
        onChange={(_, next) => setTab(next as AttendanceTabKey)}
        variant="fullWidth"
        sx={{ px: 1, borderBottom: 1, borderColor: 'divider', '& .MuiTab-root': { minHeight: 48, textTransform: 'none' } }}
      >
        <Tab value="who" label="Who came" />
        <Tab value="how" label="How it went" />
      </Tabs>

      <DialogContent>
        {message && (
          <Alert severity={severity} sx={{ mb: 1.5 }} onClose={() => setMessage(null)}>
            {message}
            {unmatched > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                {unmatched} {unmatched === 1 ? 'person' : 'people'} joined who are not on this roster,
                so they were skipped.
              </Typography>
            )}
          </Alert>
        )}

        {/* Standing explanation from the last sync, so a teacher opening this
            cold still learns why it is empty without pressing anything. */}
        {!message && syncFailed && sync?.message && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {sync.message}
          </Alert>
        )}

        {tab === 'who' ? <WhoCameTab {...tabProps} /> : <HowItWentTab {...tabProps} />}
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
          notify('Imported the Teams attendance report.', 'success');
          invalidate();
          fetchAttendance();
        }}
      />
    </Dialog>
  );
}
