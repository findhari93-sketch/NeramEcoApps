'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Skeleton,
  Tab,
  Tabs,
  Typography,
} from '@neram/ui';
import SyncIcon from '@mui/icons-material/Sync';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CampaignIcon from '@mui/icons-material/Campaign';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TeamsCsvImportDialog from '../TeamsCsvImportDialog';
import MissedTab from './MissedTab';
import NudgeDialog, { type NudgeOutcome } from './NudgeDialog';
import { buildMissedList } from './attendance-copy';
import type {
  AttendanceRecord,
  AttendanceSummary,
  AttendanceTabKey,
  AttendanceTabProps,
  Insights,
  SyncState,
} from './types';
import type { RosterCandidate } from '@/lib/teams-attendance-csv';

// Lazy: a teacher who opens this to see who to chase never pays for the ranked
// list's code or the register's, and the register is the rarest of the three.
const AttendedTab = dynamic(() => import('./AttendedTab'), {
  loading: () => <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 1 }} />,
});
const RegisterTab = dynamic(() => import('./RegisterTab'), {
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

export interface ClassAttendancePanelProps {
  classId: string;
  classTitle: string;
  /**
   * The class's OWN classroom_id, not the teacher's active classroom. Every
   * route behind this panel guards on class-in-classroom and 404s on a
   * mismatch, so a Common class scheduled against another classroom used to
   * open onto an empty register with no explanation.
   */
  classroomId: string;
  /** Null means Teams has nothing to sync from, so no Sync control anywhere. */
  teamsMeetingId: string | null;
  getToken: () => Promise<string | null>;
  initialTab?: AttendanceTabKey;
  /** Fired after every write, so the caller's cached summary stays honest. */
  onChanged?: () => void;
  /** Walk the schedule without closing: the caller supplies the order. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Shown between the arrows. The caller formats it; only it knows the class. */
  navLabel?: string;
}

/**
 * One surface for a class's attendance: who to chase, who came, and the register.
 *
 * These were three screens (an attendance sheet, an insights dialog and the RSVP
 * dashboard) over the same roster, reached from three places, fetching the same
 * rows through three routes and going stale against each other. Merging them is
 * mostly about where the state lives, which is here, once.
 *
 * The tab order is the teacher's order. Missed opens first for a past class
 * because "who do I chase" is the question they came with; Attended answers "how
 * did it actually go"; Register is the repair bench and is only opened when
 * Teams got something wrong, which is why its data is not even fetched until
 * then.
 *
 * The body, not a dialog. The timetable wraps it in one and the catch-up page
 * wraps it in a drawer, so the same panel serves both without either owning it.
 */
export default function ClassAttendancePanel({
  classId,
  classTitle,
  classroomId,
  teamsMeetingId,
  getToken,
  initialTab,
  onChanged,
  onPrev,
  onNext,
  navLabel,
}: ClassAttendancePanelProps) {
  const [tab, setTab] = useState<AttendanceTabKey>(initialTab ?? 'missed');

  const [insights, setInsights] = useState<Insights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [summary, setSummary] = useState<AttendanceSummary>(EMPTY_SUMMARY);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [classAnchor, setClassAnchor] = useState<string | null>(null);
  // The register is fetched on first open of that tab and refetched only when a
  // write has invalidated it. Without the flag, syncing from Teams and then
  // opening Register would show the roster from before the sync.
  const recordsStale = useRef(true);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [nudging, setNudging] = useState(false);
  const [nudgeOutcome, setNudgeOutcome] = useState<NudgeOutcome | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [severity, setSeverity] = useState<'info' | 'warning' | 'success'>('info');
  const [unmatched, setUnmatched] = useState(0);

  const notify = useCallback((text: string, tone: 'info' | 'warning' | 'success') => {
    setSeverity(tone);
    setMessage(text);
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/timetable/class-insights?class_id=${classId}&classroom_id=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) setInsights(await res.json());
      else setInsights(null);
    } catch {
      setInsights(null);
    } finally {
      setInsightsLoading(false);
    }
  }, [classId, classroomId, getToken]);

  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true);
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
        recordsStale.current = false;
      }
    } catch (err) {
      console.error('Failed to load the register:', err);
    } finally {
      setRecordsLoading(false);
    }
  }, [classId, classroomId, getToken]);

  /** A write happened: both reads are now suspect. */
  const invalidate = useCallback(() => {
    recordsStale.current = true;
    onChanged?.();
  }, [onChanged]);

  // Changing class resets everything, including the selection: carrying ticks
  // from Friday's class into Tuesday's would send a message about the wrong one.
  useEffect(() => {
    setMessage(null);
    setUnmatched(0);
    setSelected(new Set());
    setInsights(null);
    setRecords([]);
    setSummary(EMPTY_SUMMARY);
    recordsStale.current = true;
    fetchInsights();
  }, [classId, classroomId, fetchInsights]);

  useEffect(() => {
    if (tab === 'register' && recordsStale.current && !recordsLoading) fetchRecords();
  }, [tab, recordsLoading, fetchRecords]);

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
        // One sync refreshes whatever is on screen. It used to refresh whichever
        // dialog the teacher happened to have open and leave the other lying.
        await fetchInsights();
        if (tab === 'register') await fetchRecords();
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
        await fetchRecords();
        return;
      }
      invalidate();
      // The other two tabs read from insights, so a correction here has to reach
      // them or the missed list keeps chasing somebody just marked present.
      await fetchInsights();
    } catch {
      notify('Could not save that change', 'warning');
      await fetchRecords();
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
        await fetchInsights();
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

  const onSelect = useCallback((studentId: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(studentId);
      else copy.delete(studentId);
      return copy;
    });
  }, []);

  const onSelectMany = useCallback((ids: string[], next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      for (const id of ids) {
        if (next) copy.add(id);
        else copy.delete(id);
      }
      return copy;
    });
  }, []);

  const selectedStudents = useMemo(
    () => (insights?.students ?? []).filter((s) => selected.has(s.id)),
    [insights, selected],
  );

  const handleCopy = () => {
    if (!insights) return;
    const text = buildMissedList(insights, selected);
    // The .catch matters: iOS Safari rejects writeText outside a tightly bound
    // gesture, and clipboard is undefined altogether on an insecure origin.
    // Both fail in total silence otherwise, leaving the teacher to paste nothing.
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify('Copied the list.', 'success'))
      .catch(() => notify('Your browser blocked the clipboard.', 'warning'));
  };

  const handleNudge = async ({ message: text, postToTeams }: { message: string; postToTeams: boolean }) => {
    setNudging(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/timetable/${classId}/catchup-nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroom_id: classroomId,
          studentIds: [...selected],
          message: text || undefined,
          postToTeams: postToTeams ? 'both' : 'none',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.error || 'Could not send that', 'warning');
        setNudgeOpen(false);
        return;
      }
      setNudgeOutcome({
        counts: data.counts,
        parents: data.parents,
        teamsPost: data.teamsPost,
      });
      // followup_sent_at just changed on every recipient, and that is what the
      // missed list shows as "last nudged".
      await fetchInsights();
      onChanged?.();
    } catch {
      notify('Could not send that', 'warning');
      setNudgeOpen(false);
    } finally {
      setNudging(false);
    }
  };

  /**
   * The roster in the shape the CSV importer matches against. Built from what
   * the register already fetched, so the import dialog makes no network call at
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
    loading: insightsLoading,
    busy: syncing || savingAll,
    records,
    recordsLoading,
    summary,
    sync,
    insights,
    insightsLoading,
    selected,
    onSelect,
    onSelectMany,
    onToggle: handleToggle,
    onMarkAllPresent: handleMarkAllPresent,
    onOpenImport: () => setImportOpen(true),
    onNotify: notify,
  };

  const syncFailed = !!sync?.status && sync.status !== 'ok';
  const missedCount = insights ? insights.summary.notCaughtUp : 0;
  const dateLabel = insights?.class.scheduled_date
    ? new Date(`${insights.class.scheduled_date}T00:00:00`).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
      {/* Walking the schedule without closing is the whole point of the catch-up
          mount: a teacher reviewing the week should not have to shut this,
          find the next class and open it again. */}
      {(onPrev || onNext) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, pb: 0.5 }}>
          <IconButton onClick={onPrev} disabled={!onPrev} aria-label="Previous class" sx={{ minWidth: 44, minHeight: 44 }}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: 'center' }} noWrap>
            {navLabel || dateLabel}
          </Typography>
          <IconButton onClick={onNext} disabled={!onNext} aria-label="Next class" sx={{ minWidth: 44, minHeight: 44 }}>
            <ChevronRightIcon />
          </IconButton>
        </Box>
      )}

      {/* Sync sits above the tabs, not inside one. It refreshes all three, so
          putting it on a tab made it look like it only refreshed that tab, and
          it used to be offered even for a class with no meeting to sync. */}
      {teamsMeetingId && (
        <Box sx={{ px: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
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
          {insights?.class.attendance_synced_at && (
            <Typography variant="caption" color="text.secondary">
              Last synced{' '}
              {new Date(insights.class.attendance_synced_at).toLocaleString('en-IN', {
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
        sx={{
          px: 1,
          borderBottom: 1,
          borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 600 },
        }}
      >
        <Tab value="missed" label={missedCount > 0 ? `Missed ${missedCount}` : 'Missed'} />
        <Tab
          value="attended"
          label={insights ? `Attended ${insights.summary.present}` : 'Attended'}
        />
        <Tab value="register" label="Register" />
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 2 }}>
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
            cold still learns why it is empty without pressing anything. The
            register carries it; before that tab is opened the insights payload
            has its own copy of the same message. */}
        {!message && (syncFailed || insights?.class.attendance_sync_message) && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {sync?.message || insights?.class.attendance_sync_message}
          </Alert>
        )}

        {tab === 'missed' && <MissedTab {...tabProps} />}
        {tab === 'attended' && <AttendedTab {...tabProps} />}
        {tab === 'register' && <RegisterTab {...tabProps} />}
      </Box>

      {/* The action bar appears only with a selection, so the panel is a reading
          surface until the teacher decides to do something. Sticky at the foot
          of the body and clear of the iOS home indicator. */}
      {selected.size > 0 && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 1.25,
            pb: 'calc(10px + env(safe-area-inset-bottom))',
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, mr: 'auto' }}>
            {selected.size} selected
          </Typography>
          <Button
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Copy
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<CampaignIcon />}
            onClick={() => {
              setNudgeOutcome(null);
              setNudgeOpen(true);
            }}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Nudge
          </Button>
        </Box>
      )}

      <NudgeDialog
        open={nudgeOpen}
        onClose={() => {
          setNudgeOpen(false);
          // Clearing on a successful send stops the same names being messaged
          // twice by a teacher who did not notice the ticks survived.
          if (nudgeOutcome) setSelected(new Set());
        }}
        classTitle={classTitle}
        classDateLabel={dateLabel}
        names={selectedStudents.map((s) => s.name)}
        sending={nudging}
        outcome={nudgeOutcome}
        onSend={handleNudge}
      />

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
          fetchRecords();
          fetchInsights();
        }}
      />
    </Box>
  );
}
