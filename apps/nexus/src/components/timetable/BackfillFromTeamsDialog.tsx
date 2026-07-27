'use client';

/**
 * "Backfill from Teams": import past classes from a Teams channel, attach their
 * recordings and pull their attendance, with a preview first.
 *
 * Mobile-first at 375px. The preview is a card list at every width rather than a
 * table, because each row carries four independent facts (what it is, whether it
 * already exists, whether a recording was found, what attendance did) and a
 * table of that on a phone is either unreadable or scrolls sideways.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Alert,
  Chip,
  Checkbox,
  Switch,
  FormControlLabel,
  TextField,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
  Divider,
  IconButton,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import DiagnosticsStepList, { type DiagnosticStep } from './DiagnosticsStepList';

interface BackfillRow {
  key: string;
  source: 'calendar' | 'recording';
  subject: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  duration_estimated: boolean;
  is_cancelled: boolean;
  action: string;
  matched_on: string | null;
  class_id: string | null;
  reconcile: {
    existing_status: string | null;
    status_fix: 'restore' | 'cancel_in_nexus' | null;
    fills: string[];
    result?: 'restored' | 'cancelled' | 'updated' | 'skipped' | 'error';
    error?: string;
  };
  result?: 'imported' | 'duplicate' | 'skipped' | 'error';
  error?: string;
  recording: { action: 'attach' | 'already_set' | 'none'; name: string | null; result?: string; error?: string };
  attendance: {
    status: string | null;
    attempts: number;
    synced_at: string | null;
    retryable: boolean;
    mode?: string;
    ok?: boolean;
    code?: string;
    detail?: string;
    synced?: number;
    no_shows?: number;
    unmatched?: number;
  };
}

interface BackfillResponse {
  mode: 'preview' | 'apply';
  classroom: { id: string; name: string; ms_channel_id: string | null; resolved_channel_id: string | null };
  window: { from: string; to: string };
  active_students: number;
  teacher_id: string | null;
  rows: BackfillRow[];
  orphans: Array<{
    class_id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
    status: string | null;
    has_recording: boolean;
    can_restore: boolean;
  }>;
  summary: Record<string, number>;
  recordings_error?: string | null;
  channel_linked?: boolean;
  restored_orphans?: Array<{ class_id: string; ok: boolean; error?: string }>;
  attendance_fallback?: { reason: string; options: string[] } | null;
}

interface TeacherOption {
  id: string;
  name: string;
  isSelf: boolean;
}

interface ProbeResponse {
  ok: boolean;
  steps: DiagnosticStep[];
  sample?: {
    verdict: string;
    caller_is_organizer: boolean;
    attempts: Array<{ key: string; label: string; status: number | null; ok: boolean; skipped?: string; body: string }>;
  } | null;
}

interface BackfillFromTeamsDialogProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  classroomName: string;
  getToken: () => Promise<string | null>;
  onApplied: () => void;
  onNotify: (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}

/** IST today as YYYY-MM-DD. Never toISOString on a local Date, it shifts to UTC. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().substring(0, 10);
}

function monthRange(offset: number): { from: string; to: string } {
  const today = istToday();
  const [y, m] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  return { from: start.toISOString().substring(0, 10), to: end.toISOString().substring(0, 10) };
}

function formatDay(date: string, start: string, end: string): string {
  const d = new Date(`${date}T00:00:00+05:30`);
  const label = d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  return `${label} · ${start.substring(0, 5)} to ${end.substring(0, 5)}`;
}

/** Column names are for the API; the chip has to read like English. */
const FIELD_LABELS: Record<string, string> = {
  teacher_id: 'teacher',
  organizer_ms_oid: 'organizer',
  organizer_name: 'organizer name',
  organizer_email: 'organizer email',
};

const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field;

const ACTION_CHIP: Record<string, { label: string; color: 'primary' | 'default' | 'warning' }> = {
  import: { label: 'New', color: 'primary' },
  exists_by_event_id: { label: 'Already in Nexus', color: 'default' },
  exists_by_join_url: { label: 'Already in Nexus', color: 'default' },
  exists_by_slot: { label: 'Same slot exists', color: 'warning' },
  skip_cancelled: { label: 'Cancelled in Teams', color: 'warning' },
};

export default function BackfillFromTeamsDialog({
  open,
  onClose,
  classroomId,
  classroomName,
  getToken,
  onApplied,
  onNotify,
}: BackfillFromTeamsDialogProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  const thisMonth = monthRange(0);
  const [preset, setPreset] = useState<'this' | 'last' | 'custom'>('this');
  const [from, setFrom] = useState(thisMonth.from);
  const [to, setTo] = useState(thisMonth.to);

  const [wantClasses, setWantClasses] = useState(true);
  const [wantRecordings, setWantRecordings] = useState(true);
  const [wantAttendance, setWantAttendance] = useState(true);
  const [wantReconcile, setWantReconcile] = useState(true);
  const [mirrorCancellations, setMirrorCancellations] = useState(false);
  const [resetAttempts, setResetAttempts] = useState(false);
  const [linkChannel, setLinkChannel] = useState(false);

  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [teacherId, setTeacherId] = useState('');
  const [restoreOrphans, setRestoreOrphans] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<BackfillResponse | null>(null);
  const [applied, setApplied] = useState<BackfillResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ProbeResponse | null>(null);

  const shown = applied ?? preview;
  const rows = useMemo(() => shown?.rows ?? [], [shown]);

  const anyBurnedAttempts = useMemo(
    () => rows.some((r) => selected.has(r.key) && !r.attendance.retryable),
    [rows, selected],
  );

  const anyTeamsCancellation = useMemo(
    () => rows.some((r) => r.reconcile.status_fix === 'cancel_in_nexus'),
    [rows],
  );

  const restoreCount = useMemo(
    () => rows.filter((r) => selected.has(r.key) && r.reconcile.status_fix === 'restore').length,
    [rows, selected],
  );

  // The tutor picker is only worth showing when it can change something: every
  // class that already names a teacher is left alone whatever is chosen here.
  const anyMissingTeacher = useMemo(
    () => rows.some((r) => r.action === 'import' || r.reconcile.fills.includes('teacher_id')),
    [rows],
  );

  useEffect(() => {
    if (!open || teachers.length) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const res = await fetch('/api/timetable/teachers', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!res?.ok || cancelled) return;
      const list = ((await res.json())?.teachers ?? []) as TeacherOption[];
      if (cancelled) return;
      setTeachers(list);
      setTeacherId((prev) => prev || list.find((t) => t.isSelf)?.id || '');
    })();
    return () => {
      cancelled = true;
    };
  }, [open, teachers.length, getToken]);

  const applyPreset = (next: 'this' | 'last' | 'custom') => {
    setPreset(next);
    if (next === 'this') {
      const r = monthRange(0);
      setFrom(r.from);
      setTo(r.to);
    } else if (next === 'last') {
      const r = monthRange(-1);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const reset = () => {
    setPreview(null);
    setApplied(null);
    setSelected(new Set());
    setRestoreOrphans(new Set());
    setProbe(null);
  };

  const runPreview = async () => {
    setLoading(true);
    reset();
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/timetable/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroom_id: classroomId,
          from,
          to,
          mode: 'preview',
          steps: {
            classes: wantClasses,
            recordings: wantRecordings,
            attendance: wantAttendance,
            reconcile: wantReconcile,
          },
          ...(teacherId && { teacher_id: teacherId }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data?.error || 'Could not read the Teams channel', 'error');
        return;
      }
      setPreview(data as BackfillResponse);
      // Ticked by default: everything genuinely new, and every class Nexus has
      // marked cancelled while Teams still lists it, because that second group is
      // a class the students lost and putting it back is the whole point. A row
      // that merely already exists is offered but not assumed, so a real second
      // class in one slot stays possible.
      setSelected(
        new Set(
          (data.rows as BackfillRow[])
            .filter((r) => r.action === 'import' || r.reconcile.status_fix === 'restore')
            .map((r) => r.key),
        ),
      );
    } catch {
      onNotify('Could not reach the backfill service', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runApply = async () => {
    setConfirmOpen(false);
    setApplying(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/timetable/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroom_id: classroomId,
          from,
          to,
          mode: 'apply',
          keys: Array.from(selected),
          restore_class_ids: Array.from(restoreOrphans),
          steps: {
            classes: wantClasses,
            recordings: wantRecordings,
            attendance: wantAttendance,
            reconcile: wantReconcile,
            mirror_cancellations: mirrorCancellations,
            link_channel: linkChannel,
          },
          ...(teacherId && { teacher_id: teacherId }),
          reset_attendance_attempts: resetAttempts,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data?.error || 'Backfill failed', 'error');
        return;
      }
      setApplied(data as BackfillResponse);
      onApplied();
      const s = data.summary || {};
      const restoredTotal =
        (s.restored ?? 0) + (data.restored_orphans ?? []).filter((r: { ok: boolean }) => r.ok).length;
      onNotify(
        [
          `Imported ${s.imported ?? 0}`,
          restoredTotal > 0 && `restored ${restoredTotal}`,
          `attached ${s.recordings_attached ?? 0} recording(s)`,
          `attendance for ${s.attendance_ok ?? 0}`,
        ]
          .filter(Boolean)
          .join(', ') + '.',
        (s.errors ?? 0) > 0 ? 'warning' : 'success',
      );
    } catch {
      onNotify('Backfill failed', 'error');
    } finally {
      setApplying(false);
    }
  };

  const runProbe = async () => {
    setProbing(true);
    setProbe(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/timetable/backfill/probe?classroom_id=${classroomId}&from=${from}&to=${to}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => null);
      if (data?.steps) setProbe(data as ProbeResponse);
      else onNotify(data?.error || 'Could not run diagnostics', 'warning');
    } catch {
      onNotify('Could not run diagnostics', 'warning');
    } finally {
      setProbing(false);
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectWhere = (fn: (r: BackfillRow) => boolean) =>
    setSelected(new Set(rows.filter(fn).map((r) => r.key)));

  const copyDiagnostics = () => {
    const payload = JSON.stringify({ result: shown, probe }, null, 2);
    navigator.clipboard?.writeText(payload).then(
      () => onNotify('Diagnostics copied', 'success'),
      () => onNotify('Could not copy', 'warning'),
    );
  };

  const selectedCount = selected.size;
  const importCount = rows.filter((r) => selected.has(r.key) && r.action === 'import').length;

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={!isDesktop}>
        <DialogTitle sx={{ pr: 6 }}>
          Backfill from Teams
          <Typography variant="body2" color="text.secondary">
            {classroomName}
          </Typography>
          <IconButton
            onClick={onClose}
            aria-label="Close"
            sx={{ position: 'absolute', right: 8, top: 8, width: 48, height: 48 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Compares the linked Teams channel with this timetable: imports classes that are missing,
            puts back any Nexus marked cancelled while Teams still lists them, and pulls their
            recordings and attendance. Nothing is written until you press Apply.
          </Typography>

          {/* Range */}
          <ToggleButtonGroup
            exclusive
            size="small"
            value={preset}
            onChange={(_e: unknown, v: 'this' | 'last' | 'custom' | null) => v && applyPreset(v)}
            sx={{ mb: 2, flexWrap: 'wrap', '& .MuiToggleButton-root': { minHeight: 44, textTransform: 'none' } }}
          >
            <ToggleButton value="this">This month</ToggleButton>
            <ToggleButton value="last">Last month</ToggleButton>
            <ToggleButton value="custom">Custom</ToggleButton>
          </ToggleButtonGroup>

          {preset === 'custom' && (
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
              <TextField
                type="date"
                label="From"
                size="small"
                value={from}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: '1 1 150px' }}
              />
              <TextField
                type="date"
                label="To"
                size="small"
                value={to}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: '1 1 150px' }}
              />
            </Box>
          )}

          {/* What to do */}
          <Box sx={{ mb: 1 }}>
            {[
              { label: 'Import missing classes', value: wantClasses, set: setWantClasses },
              { label: 'Put back wrongly cancelled classes', value: wantReconcile, set: setWantReconcile },
              { label: 'Attach recordings', value: wantRecordings, set: setWantRecordings },
              { label: 'Pull attendance', value: wantAttendance, set: setWantAttendance },
            ].map((opt) => (
              <FormControlLabel
                key={opt.label}
                sx={{ display: 'flex', minHeight: 48, m: 0 }}
                control={
                  <Switch
                    checked={opt.value}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => opt.set(e.target.checked)}
                  />
                }
                label={opt.label}
              />
            ))}
          </Box>

          {teachers.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Teacher for these classes"
                value={teacherId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTeacherId(e.target.value)}
              >
                <MenuItem value="" sx={{ minHeight: 44 }}>
                  <em>Leave blank</em>
                </MenuItem>
                {teachers.map((t) => (
                  <MenuItem key={t.id} value={t.id} sx={{ minHeight: 44 }}>
                    {t.name}
                    {t.isSelf ? ' (you)' : ''}
                  </MenuItem>
                ))}
              </TextField>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Only written where a class has no teacher yet. Anyone already named keeps their
                place{anyMissingTeacher ? '' : ', and nothing found here is missing one'}.
              </Typography>
            </Box>
          )}

          <Accordion disableGutters elevation={0} sx={{ mb: 2, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, px: 0 }}>
              <Typography variant="body2" color="text.secondary">
                Advanced
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              {anyTeamsCancellation && (
                <>
                  <FormControlLabel
                    sx={{ display: 'flex', minHeight: 48, m: 0 }}
                    control={
                      <Switch
                        checked={mirrorCancellations}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setMirrorCancellations(e.target.checked)
                        }
                      />
                    }
                    label="Cancel classes that Teams says were cancelled"
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Off by default. This hides the class from all {shown?.active_students ?? 0}{' '}
                    students, including any recording already attached to it.
                  </Typography>
                </>
              )}
              <FormControlLabel
                sx={{ display: 'flex', minHeight: 48, m: 0 }}
                control={
                  <Switch
                    checked={resetAttempts}
                    disabled={!anyBurnedAttempts}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResetAttempts(e.target.checked)}
                  />
                }
                label="Reset the attendance retry counter"
              />
              {anyBurnedAttempts && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Some selected classes have used all 6 tries, so Nexus has stopped retrying them.
                  Resetting hands them back to the nightly sync too.
                </Typography>
              )}
              {shown?.classroom && !shown.classroom.ms_channel_id && shown.classroom.resolved_channel_id && (
                <FormControlLabel
                  sx={{ display: 'flex', minHeight: 48, m: 0 }}
                  control={
                    <Switch
                      checked={linkChannel}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLinkChannel(e.target.checked)}
                    />
                  }
                  label="Link the General channel to this classroom"
                />
              )}
            </AccordionDetails>
          </Accordion>

          <Button
            variant="outlined"
            onClick={runPreview}
            disabled={loading || applying}
            sx={{ textTransform: 'none', minHeight: 44, mb: 2 }}
          >
            {loading ? 'Reading Teams...' : shown ? 'Refresh preview' : 'Preview'}
          </Button>

          {loading && (
            <Box sx={{ mb: 2 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={76} sx={{ mb: 1 }} />
              ))}
            </Box>
          )}

          {shown?.recordings_error && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Recordings folder could not be read: {shown.recordings_error}
            </Alert>
          )}

          {shown && rows.length === 0 && !loading && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Nothing found between {shown.window.from} and {shown.window.to}. Classes started with
              &quot;Meet now&quot; leave no calendar entry, so if none were recorded either there is
              nothing for Nexus to import. Open the diagnostics below to see what each source
              returned.
            </Alert>
          )}

          {shown && rows.length > 0 && (
            <>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                <Button size="small" sx={{ textTransform: 'none', minHeight: 44 }} onClick={() => selectWhere((r) => r.action === 'import')}>
                  Select all new
                </Button>
                <Button
                  size="small"
                  sx={{ textTransform: 'none', minHeight: 44 }}
                  onClick={() =>
                    selectWhere(
                      (r) =>
                        r.action === 'import' ||
                        r.reconcile.status_fix !== null ||
                        r.reconcile.fills.length > 0,
                    )
                  }
                >
                  Everything that differs
                </Button>
                <Button
                  size="small"
                  sx={{ textTransform: 'none', minHeight: 44 }}
                  onClick={() => selectWhere((r) => r.recording.action === 'attach')}
                >
                  With a recording
                </Button>
                <Button size="small" sx={{ textTransform: 'none', minHeight: 44 }} onClick={() => setSelected(new Set())}>
                  None
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  {selectedCount} of {rows.length} selected
                </Typography>
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  gap: 1,
                  mb: 2,
                }}
              >
                {rows.map((row) => {
                  const chip = ACTION_CHIP[row.action] ?? { label: row.action, color: 'default' as const };
                  const disabled = row.action === 'skip_cancelled';
                  return (
                    <Box
                      key={row.key}
                      sx={{
                        display: 'flex',
                        gap: 1,
                        minHeight: 72,
                        p: 1,
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: selected.has(row.key) ? 'primary.light' : 'divider',
                        bgcolor: selected.has(row.key) ? 'action.hover' : 'transparent',
                        opacity: disabled ? 0.6 : 1,
                      }}
                    >
                      <Checkbox
                        checked={selected.has(row.key)}
                        disabled={disabled}
                        onChange={() => toggle(row.key)}
                        inputProps={{ 'aria-label': `Select ${row.subject}` }}
                        sx={{ p: 1.5, alignSelf: 'flex-start' }}
                      />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {formatDay(row.scheduled_date, row.start_time, row.end_time)}
                          {row.duration_estimated && ' (est.)'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap title={row.subject}>
                          {row.subject}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          <Chip size="small" label={chip.label} color={chip.color} variant="outlined" />
                          {row.reconcile.status_fix === 'restore' && (
                            <Chip
                              size="small"
                              color="error"
                              label={
                                row.reconcile.result === 'restored'
                                  ? 'Put back'
                                  : 'Cancelled in Nexus, live in Teams'
                              }
                              variant={row.reconcile.result === 'restored' ? 'filled' : 'outlined'}
                            />
                          )}
                          {row.reconcile.status_fix === 'cancel_in_nexus' && (
                            <Chip
                              size="small"
                              color="warning"
                              variant="outlined"
                              label={
                                row.reconcile.result === 'cancelled'
                                  ? 'Cancelled to match Teams'
                                  : 'Cancelled in Teams, live in Nexus'
                              }
                            />
                          )}
                          {row.reconcile.fills.length > 0 && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={
                                row.reconcile.result && row.reconcile.result !== 'skipped'
                                  ? 'Details filled in'
                                  : `Missing ${row.reconcile.fills.map(fieldLabel).join(', ')}`
                              }
                            />
                          )}
                          {row.source === 'recording' && (
                            <Chip size="small" label="Recording only" variant="outlined" />
                          )}
                          <Chip
                            size="small"
                            variant="outlined"
                            color={row.recording.action === 'attach' ? 'success' : 'default'}
                            label={
                              row.recording.action === 'attach'
                                ? 'Recording found'
                                : row.recording.action === 'already_set'
                                  ? 'Recording set'
                                  : 'No recording'
                            }
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              row.attendance.synced_at
                                ? 'Attendance synced'
                                : row.attendance.attempts > 0
                                  ? `Attendance: ${row.attendance.attempts} of 6 tries`
                                  : 'Attendance: never synced'
                            }
                          />
                        </Box>
                        {(row.result || row.attendance.detail || row.error) && (
                          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, alignItems: 'flex-start' }}>
                            {row.result === 'error' || row.attendance.ok === false ? (
                              <ErrorOutlineIcon color="warning" sx={{ fontSize: 16, mt: 0.2 }} />
                            ) : (
                              <CheckCircleIcon color="success" sx={{ fontSize: 16, mt: 0.2 }} />
                            )}
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ wordBreak: 'break-word' }}
                            >
                              {row.error ||
                                row.attendance.detail ||
                                (row.attendance.ok
                                  ? `${row.attendance.synced} present, ${row.attendance.no_shows} absent`
                                  : row.result)}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </>
          )}

          {shown && shown.orphans.length > 0 && (
            <Accordion disableGutters elevation={0} sx={{ mb: 1, '&:before': { display: 'none' } }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, px: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  {shown.orphans.length} Nexus class(es) here have no Teams event
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Nothing here is cancelled or edited. A cancelled one can be put back if you know
                  the class ran: with no Teams event left, only you can say.
                </Typography>
                {shown.orphans.map((o) => (
                  <Box
                    key={o.class_id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48 }}
                  >
                    {o.can_restore ? (
                      <Checkbox
                        checked={restoreOrphans.has(o.class_id)}
                        onChange={() =>
                          setRestoreOrphans((prev) => {
                            const next = new Set(prev);
                            if (next.has(o.class_id)) next.delete(o.class_id);
                            else next.add(o.class_id);
                            return next;
                          })
                        }
                        inputProps={{ 'aria-label': `Put back ${o.title}` }}
                        sx={{ p: 1.5 }}
                      />
                    ) : (
                      <Box sx={{ width: 42 }} />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" noWrap title={o.title}>
                        {o.scheduled_date} {o.start_time.substring(0, 5)} · {o.title}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {o.status === 'cancelled' && (
                          <Chip size="small" color="error" variant="outlined" label="Cancelled in Nexus" />
                        )}
                        {o.has_recording && (
                          <Chip size="small" variant="outlined" label="Has a recording" />
                        )}
                      </Box>
                    </Box>
                  </Box>
                ))}
                {shown.restored_orphans?.map((r) => (
                  <Typography
                    key={r.class_id}
                    variant="caption"
                    color={r.ok ? 'success.main' : 'warning.main'}
                    sx={{ display: 'block' }}
                  >
                    {r.ok ? 'Put back' : r.error}
                  </Typography>
                ))}
              </AccordionDetails>
            </Accordion>
          )}

          {shown?.attendance_fallback && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Attendance could not be read ({shown.attendance_fallback.reason}).
              </Typography>
              {shown.attendance_fallback.options.map((o) => (
                <Typography key={o} variant="caption" sx={{ display: 'block' }}>
                  {o}
                </Typography>
              ))}
            </Alert>
          )}

          <Divider sx={{ my: 2 }} />

          <Accordion disableGutters elevation={0} sx={{ '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48, px: 0 }}>
              <Typography variant="body2" color="text.secondary">
                Why is attendance blocked?
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={runProbe}
                disabled={probing}
                sx={{ textTransform: 'none', minHeight: 44, mb: 2 }}
              >
                {probing ? 'Checking...' : 'Run diagnostics'}
              </Button>
              {probe && (
                <>
                  <DiagnosticsStepList
                    steps={probe.steps}
                    ok={probe.ok}
                    okTitle="Every step passed. Attendance is readable for this classroom."
                    failTitle="Here is what is in the way:"
                  />
                  {probe.sample && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Lookup strategies tried
                      </Typography>
                      {probe.sample.attempts.map((a) => (
                        <Box key={a.key} sx={{ mb: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {a.label} {a.skipped ? '(skipped)' : `- HTTP ${a.status ?? 'no response'}`}
                          </Typography>
                          <Box
                            component="pre"
                            sx={{
                              m: 0,
                              p: 1,
                              fontSize: 11,
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              overflowX: 'auto',
                              maxWidth: '100%',
                              borderRadius: 1,
                              bgcolor: 'background.paper',
                              border: '1px solid',
                              borderColor: 'divider',
                            }}
                          >
                            {a.skipped || a.body || '(empty response)'}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  )}
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    onClick={copyDiagnostics}
                    sx={{ textTransform: 'none', minHeight: 44 }}
                  >
                    Copy diagnostics
                  </Button>
                </>
              )}
            </AccordionDetails>
          </Accordion>
        </DialogContent>

        <DialogActions sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', gap: 1 }}>
          <Button onClick={onClose} sx={{ textTransform: 'none', minHeight: 44 }}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={!preview || applying || selectedCount + restoreOrphans.size === 0}
            onClick={() => setConfirmOpen(true)}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {applying ? 'Working...' : `Apply ${selectedCount + restoreOrphans.size || ''}`.trim()}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Apply these changes?</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {importCount > 0 && (
              <>
                {importCount} new class{importCount === 1 ? '' : 'es'} will be added and published to{' '}
                {shown?.active_students ?? 0} students straight away, along with any recording found.{' '}
              </>
            )}
            {restoreCount + restoreOrphans.size > 0 && (
              <>
                {restoreCount + restoreOrphans.size} cancelled class
                {restoreCount + restoreOrphans.size === 1 ? '' : 'es'} will go back on the timetable.{' '}
              </>
            )}
            {mirrorCancellations && (
              <>Classes that Teams reports as cancelled will be cancelled here too. </>
            )}
            Students are not notified. This cannot be undone from here.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={runApply} sx={{ textTransform: 'none', minHeight: 44 }}>
            Import
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
