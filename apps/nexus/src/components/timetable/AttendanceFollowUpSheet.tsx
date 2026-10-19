'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Collapse,
  IconButton,
  Skeleton,
  Snackbar,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import FlightTakeoffRoundedIcon from '@mui/icons-material/FlightTakeoffRounded';
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { RSVP_REASONS, reasonRequiresNote, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { turnoutRecord } from '@/lib/attendance-standing';
import { attendanceRecordLabel } from '@/lib/class-availability';
import { isNewcomer, type ForecastStudent } from '@/lib/class-forecast';
import {
  ASK_CHANCE_BELOW,
  STATUS_LABEL,
  chanceById,
  defaultAskMessage,
  whenLabel,
  type ConfirmStatus,
} from '@/lib/attendance-confirm';
import type {
  ConfirmationStudent,
  ConfirmationsResponse,
} from '@/app/api/timetable/[classId]/confirmations/route';
import { formatDateISO, formatTimeCompact, relativeDayLabel } from './date-utils';
import type { Theme } from '@neram/ui';
import { tagSx, type TagTone } from './timetable-theme';

/**
 * Confirm who is coming: the office's follow-up sheet for one class.
 *
 * The day card says "~23 of 41 likely". This sheet turns the gap into names and
 * a job: ask the students who often miss (one tap, through Neram Assistant),
 * call the ones who stay silent, and type in whatever they say on the phone,
 * including "away all next week". Anyone who has answered, yes or no, leaves
 * the No reply list by themselves, so nobody is rung twice.
 *
 * A bottom sheet on a phone (staff do this on the move) and a dialog on a
 * laptop (the office does it at a desk with a phone in hand).
 */

export interface FollowUpClassOption {
  id: string;
  title: string;
  start_time: string;
}

interface AttendanceFollowUpSheetProps {
  open: boolean;
  onClose: () => void;
  classroomId: string | null;
  /** One or more classes on the same day. More than one shows a picker. */
  classes: FollowUpClassOption[];
  /** The page's attendance records, for each student's chance. Never fetched here. */
  standingStudents?: ForecastStudent[] | null;
  /** Something was saved: the calendar should recount. */
  onChanged?: () => void;
}

type Filter = 'no_reply' | 'not_asked' | 'coming' | 'not_coming';

const FILTERS: { key: Filter; label: string; Icon: typeof CheckCircleRoundedIcon }[] = [
  { key: 'no_reply', label: 'No reply', Icon: HourglassEmptyRoundedIcon },
  { key: 'not_asked', label: 'Not asked', Icon: HelpOutlineRoundedIcon },
  { key: 'coming', label: 'Coming', Icon: CheckCircleRoundedIcon },
  { key: 'not_coming', label: 'Not coming', Icon: EventBusyRoundedIcon },
];

const STATUS_TONE: Record<ConfirmStatus, TagTone> = {
  coming: 'success',
  not_coming: 'error',
  away: 'warning',
  no_reply: 'primary',
  not_asked: 'neutral',
};

const STATUS_ICON: Record<ConfirmStatus, typeof CheckCircleRoundedIcon> = {
  coming: CheckCircleRoundedIcon,
  not_coming: EventBusyRoundedIcon,
  away: FlightTakeoffRoundedIcon,
  no_reply: HourglassEmptyRoundedIcon,
  not_asked: HelpOutlineRoundedIcon,
};

/**
 * A toggle whose chosen side is unmistakable. The theme's default greys the
 * selected button and leaves the other in primary text, which on a phone reads
 * the wrong way round.
 */
const toggleGroupSx = (theme: Theme) => ({
  '& .MuiToggleButton-root': {
    minHeight: 44,
    textTransform: 'none',
    fontWeight: 600,
    color: 'text.secondary',
    borderColor: 'divider',
  },
  '& .MuiToggleButton-root.Mui-selected, & .MuiToggleButton-root.Mui-selected:hover': {
    bgcolor: alpha(theme.palette.primary.main, 0.12),
    color: 'primary.dark',
    fontWeight: 700,
    borderColor: 'primary.main',
  },
  '& .MuiToggleButton-root.Mui-focusVisible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
});

const EMPTY_TEXT: Record<Filter, string> = {
  no_reply: 'Everyone asked has answered.',
  not_asked: 'Everyone expected has been asked or has answered.',
  coming: 'Nobody has confirmed yet.',
  not_coming: 'Nobody has said they cannot come.',
};

function inFilter(status: ConfirmStatus, filter: Filter): boolean {
  if (filter === 'not_coming') return status === 'not_coming' || status === 'away';
  return status === filter;
}

/** "6:10 PM" today, "Mon 6:10 PM" otherwise. */
function shortStamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const sameDay = formatDateISO(d) === formatDateISO(new Date());
  if (sameDay) return time;
  const day = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'Asia/Kolkata' });
  return `${day} ${time}`;
}

export default function AttendanceFollowUpSheet({
  open,
  onClose,
  classroomId,
  classes,
  standingStudents,
  onChanged,
}: AttendanceFollowUpSheetProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'));
  const { getToken } = useNexusAuthContext();

  const [classId, setClassId] = useState<string | null>(classes[0]?.id ?? null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [editingMessage, setEditingMessage] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // A fresh open is a fresh question: the first class, the filter chosen from
  // the data, nothing ticked by hand.
  const classKey = classes.map((c) => c.id).join(',');
  useEffect(() => {
    if (!open) return;
    setClassId(classes[0]?.id ?? null);
    setFilter(null);
    setExpandedId(null);
    setEditingMessage(false);
  }, [open, classKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = open && classId && classroomId ? `/api/timetable/${classId}/confirmations?classroom_id=${classroomId}` : null;
  const { data, error, isLoading, mutate } = useAuthSWR<ConfirmationsResponse>(key, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });

  const today = formatDateISO(new Date());
  const chances = useMemo(() => chanceById(standingStudents), [standingStudents]);
  const standingById = useMemo(
    () => new Map((standingStudents || []).map((s) => [s.id, s] as const)),
    [standingStudents],
  );
  const chanceOf = (id: string) => chances.get(id) ?? 1;

  // Without a choice made, open where the work is: the silent list when there
  // is one, otherwise the people still to ask.
  const counts = data?.counts;
  const activeFilter: Filter = filter ?? (counts && counts.no_reply > 0 ? 'no_reply' : 'not_asked');

  // Tick the students who often miss, once per class load. They can be
  // unticked; the list is a suggestion, not a send.
  useEffect(() => {
    if (!data) return;
    const picks = data.students.filter((s) => {
      if (s.status !== 'not_asked') return false;
      const st = standingById.get(s.id);
      if (st && isNewcomer(st, today)) return false;
      return chanceOf(s.id) < ASK_CHANCE_BELOW;
    });
    setSelected(new Set(picks.map((s) => s.id)));
    setMessage(
      defaultAskMessage({
        classTitle: data.class.title,
        whenLabel: whenLabel(data.class.scheduled_date, data.class.start_time, today),
      }),
    );
  }, [data?.class.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const list = (data?.students || []).filter((s) => inFilter(s.status, activeFilter));
    const byChance = activeFilter === 'no_reply' || activeFilter === 'not_asked';
    return list.sort((a, b) =>
      byChance ? chanceOf(a.id) - chanceOf(b.id) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name),
    );
  }, [data, activeFilter, chances]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectable = activeFilter === 'not_asked' || activeFilter === 'no_reply';
  const selectedHere = rows.filter((r) => selected.has(r.id));
  const canAsk = !!data?.can_ask && !!data?.open && selectable;

  const refresh = async () => {
    await mutate();
    onChanged?.();
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ask = async () => {
    if (!classId || !classroomId || selectedHere.length === 0) return;
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/timetable/${classId}/confirmations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroom_id: classroomId,
          action: 'ask',
          studentIds: selectedHere.map((s) => s.id),
          message: message.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ message: body.error || 'Could not send', severity: 'error' });
        return;
      }
      const unreached = body.counts?.unreached ?? 0;
      const reached = (body.asked ?? 0) - unreached;
      setToast({
        message:
          `Asked ${reached}` +
          (unreached > 0 ? `, ${unreached} could not be reached (call them)` : '') +
          (body.skipped > 0 ? `, ${body.skipped} skipped` : '') +
          '.',
        severity: unreached > 0 ? 'error' : 'success',
      });
      setSelected(new Set());
      setEditingMessage(false);
      setFilter('no_reply');
      await refresh();
    } catch {
      setToast({ message: 'Could not send', severity: 'error' });
    } finally {
      setSending(false);
    }
  };

  const post = async (url: string, payload: unknown): Promise<boolean> => {
    const token = await getToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setToast({ message: body.error || 'Could not save', severity: 'error' });
      return false;
    }
    return true;
  };

  const record = async (student: ConfirmationStudent, answer: RecordAnswer): Promise<boolean> => {
    if (!classId || !classroomId || !data) return false;
    const ok =
      answer.kind === 'days'
        ? await post(`/api/students/${student.id}/away-windows`, {
            starts_on: answer.startsOn,
            ends_on: answer.endsOn,
            reason_code: answer.reasonCode,
            reason_note: answer.note || null,
          })
        : await post(`/api/timetable/${classId}/confirmations`, {
            classroom_id: classroomId,
            action: 'record',
            studentId: student.id,
            answer: answer.kind === 'coming' ? 'coming' : 'not_coming',
            reason_code: answer.kind === 'class' ? answer.reasonCode : undefined,
            reason_note: answer.kind === 'class' ? answer.note : undefined,
          });
    if (!ok) return false;
    setToast({
      message:
        answer.kind === 'coming'
          ? `${student.name} is coming.`
          : answer.kind === 'days'
            ? `Away dates saved for ${student.name}.`
            : `${student.name} is not coming. Reason saved.`,
      severity: 'success',
    });
    setExpandedId(null);
    await refresh();
    return true;
  };

  const logCall = async (student: ConfirmationStudent, note: string) => {
    if (!classId || !classroomId) return;
    const ok = await post(`/api/timetable/${classId}/confirmations`, {
      classroom_id: classroomId,
      action: 'call',
      studentId: student.id,
      note,
    });
    if (!ok) return;
    setToast({ message: `Call logged for ${student.name}.`, severity: 'success' });
    await refresh();
  };

  const description = data
    ? `${data.class.title}, ${relativeDayLabel(data.class.scheduled_date, today)}${
        data.class.start_time ? ` at ${formatTimeCompact(data.class.start_time)}` : ''
      }`
    : 'Loading the class';

  const footer = canAsk && selectedHere.length > 0 ? (
    <Box sx={{ width: '100%' }}>
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 2,
          p: 1.25,
          mb: 1,
          bgcolor: alpha(theme.palette.primary.main, 0.03),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, flex: 1 }}>
            Neram Assistant will send
          </Typography>
          <Button
            size="small"
            onClick={() => setEditingMessage((v) => !v)}
            aria-expanded={editingMessage}
            sx={{ minHeight: 44 }}
          >
            {editingMessage ? 'Done' : 'Edit'}
          </Button>
        </Box>
        {editingMessage ? (
          <TextField
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            multiline
            minRows={3}
            fullWidth
            size="small"
            inputProps={{ maxLength: 1000, 'aria-label': 'Message to the students' }}
            helperText="{firstName} becomes each student's first name."
          />
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              overflowWrap: 'anywhere',
              // Two lines on a phone, so the names stay the larger part of the
              // sheet. Edit shows the whole of it.
              display: '-webkit-box',
              WebkitLineClamp: { xs: 2, sm: 3 },
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {message.replace(/\{firstName\}/g, '[first name]')}
          </Typography>
        )}
      </Box>
      <Button
        fullWidth
        variant="contained"
        disableElevation
        startIcon={<SendRoundedIcon />}
        onClick={ask}
        disabled={sending || !message.trim()}
        sx={{ minHeight: 48 }}
      >
        {sending ? 'Sending...' : `Ask ${selectedHere.length} on Teams`}
      </Button>
    </Box>
  ) : null;

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title="Confirm who is coming"
      description={description}
      maxWidth="md"
      disableClose={sending}
      actions={footer}
    >
      {classes.length > 1 && (
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          value={classId}
          onChange={(_, v) => v && setClassId(v)}
          aria-label="Which class"
          sx={{ mb: 1.5, ...toggleGroupSx(theme) }}
        >
          {classes.map((c) => (
            <ToggleButton key={c.id} value={c.id}>
              {formatTimeCompact(c.start_time)} {c.title}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}

      {/* Four counts that are also the filter. Icon and word on each, never
          colour alone. */}
      <Box
        role="group"
        aria-label="Filter by answer"
        sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 1.5 }}
      >
        {FILTERS.map(({ key: k, label, Icon }) => {
          const n = !counts ? null : k === 'not_coming' ? counts.not_coming + counts.away : counts[k];
          const active = activeFilter === k;
          return (
            <Box
              key={k}
              component="button"
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(k)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 52,
                px: 1.25,
                border: 1,
                borderColor: active ? 'primary.main' : 'divider',
                borderRadius: 2,
                bgcolor: active ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
                color: 'text.primary',
                fontFamily: 'inherit',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background-color 150ms, border-color 150ms',
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                '&:hover': { borderColor: 'primary.main' },
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
              }}
            >
              <Icon aria-hidden sx={{ fontSize: 20, color: active ? 'primary.main' : 'text.secondary' }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography component="span" sx={{ display: 'block', fontWeight: 800, fontSize: '1.125rem', lineHeight: 1.1 }}>
                  {n === null ? <Skeleton width={20} /> : n}
                </Typography>
                <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {label}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {data && !data.open && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          This class is over. You can still record what students said, but nobody can be asked any more.
        </Alert>
      )}
      {data && data.open && !data.can_ask && selectable && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          You can call and record answers. Asking on Teams needs nudge permission.
        </Alert>
      )}

      {selectable && rows.length > 0 && canAsk && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
            {activeFilter === 'not_asked'
              ? `Ticked: students who come to under ${Math.round(ASK_CHANCE_BELOW * 100)}% of classes.`
              : 'Tick anyone to ask again.'}
          </Typography>
          <Button
            size="small"
            sx={{ minHeight: 44 }}
            onClick={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                const all = rows.every((r) => next.has(r.id));
                for (const r of rows) {
                  if (all) next.delete(r.id);
                  else next.add(r.id);
                }
                return next;
              })
            }
          >
            {rows.every((r) => selected.has(r.id)) ? 'Clear all' : 'Tick all'}
          </Button>
        </Box>
      )}

      {/* The list scrolls on its own on a laptop so the Ask button stays put. */}
      <Box sx={{ maxHeight: { sm: '52vh' }, overflowY: { sm: 'auto' }, mx: { sm: -1 }, px: { sm: 1 } }}>
        {(isLoading || (!data && !error)) && (
          <Box aria-busy="true" aria-label="Loading students">
            {[0, 1, 2, 3].map((i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                <Skeleton variant="circular" width={40} height={40} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="45%" />
                  <Skeleton width="70%" />
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => mutate()} sx={{ minHeight: 44 }}>
                Retry
              </Button>
            }
          >
            Could not load the class list.
          </Alert>
        )}

        {data && rows.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleRoundedIcon aria-hidden sx={{ fontSize: 32, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {EMPTY_TEXT[activeFilter]}
            </Typography>
          </Box>
        )}

        {data &&
          rows.map((s) => (
            <FollowUpRow
              key={s.id}
              student={s}
              classDate={data.class.scheduled_date}
              record={(() => {
                const st = standingById.get(s.id);
                return st ? turnoutRecord(st) : null;
              })()}
              selectable={canAsk}
              checked={selected.has(s.id)}
              onCheck={() => toggle(s.id)}
              canRecord={data.can_record}
              wide={wide}
              expanded={expandedId === s.id}
              onExpand={() => setExpandedId((id) => (id === s.id ? null : s.id))}
              onRecord={(answer) => record(s, answer)}
              onLogCall={(note) => logCall(s, note)}
            />
          ))}
      </Box>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ResponsiveSheet>
  );
}

// ── One student ─────────────────────────────────────────────────────────────

export type RecordAnswer =
  | { kind: 'coming' }
  | { kind: 'class'; reasonCode: RsvpReasonCode; note: string }
  | { kind: 'days'; reasonCode: RsvpReasonCode; note: string; startsOn: string; endsOn: string | null };

interface FollowUpRowProps {
  student: ConfirmationStudent;
  classDate: string;
  record: ReturnType<typeof turnoutRecord> | null;
  selectable: boolean;
  checked: boolean;
  onCheck: () => void;
  canRecord: boolean;
  wide: boolean;
  expanded: boolean;
  onExpand: () => void;
  onRecord: (answer: RecordAnswer) => Promise<boolean>;
  onLogCall: (note: string) => Promise<void>;
}

function FollowUpRow({
  student: s,
  classDate,
  record,
  selectable,
  checked,
  onCheck,
  canRecord,
  wide,
  expanded,
  onExpand,
  onRecord,
  onLogCall,
}: FollowUpRowProps) {
  const theme = useTheme();
  const StatusIcon = STATUS_ICON[s.status];
  const showCheck = selectable && (s.status === 'not_asked' || s.status === 'no_reply');
  const panelId = `record-${s.id}`;
  const [calling, setCalling] = useState(false);

  // The one or two facts that tell the caller what to say.
  const lines: string[] = [];
  if (s.reason) lines.push(s.reason);
  if (s.status === 'coming') {
    lines.push(s.confirmed_by_name ? `Told ${s.confirmed_by_name} on the phone` : 'Confirmed themselves');
  }
  if (s.status === 'no_reply' && s.asked_at) lines.push(`Asked ${shortStamp(s.asked_at)}`);
  if (s.last_called_at) {
    lines.push(
      `Called ${shortStamp(s.last_called_at)}${s.call_note ? `: ${s.call_note}` : ''}` +
        (s.call_count > 1 ? ` (${s.call_count} calls)` : ''),
    );
  }
  if (record && (s.status === 'not_asked' || s.status === 'no_reply')) lines.push(attendanceRecordLabel(record));

  const logNoAnswer = async () => {
    setCalling(true);
    await onLogCall('No answer');
    setCalling(false);
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
        {showCheck && (
          <Checkbox
            checked={checked}
            onChange={onCheck}
            inputProps={{ 'aria-label': `Ask ${s.name}` }}
            sx={{ width: 44, height: 44, ml: -1 }}
          />
        )}
        <StudentAvatar userId={s.id} src={s.avatar_url} name={s.name} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {s.name}
            </Typography>
            <Box component="span" sx={tagSx(theme, STATUS_TONE[s.status])}>
              <StatusIcon aria-hidden sx={{ fontSize: 14 }} />
              {STATUS_LABEL[s.status]}
            </Box>
          </Box>
          {lines.map((line) => (
            <Typography
              key={line}
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', overflowWrap: 'anywhere', lineHeight: 1.4 }}
            >
              {line}
            </Typography>
          ))}
        </Box>

        {canRecord && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {s.phone &&
              (wide ? (
                <Button
                  size="small"
                  variant="outlined"
                  href={`tel:${s.phone}`}
                  startIcon={<PhoneOutlinedIcon />}
                  sx={{ minHeight: 44 }}
                >
                  Call
                </Button>
              ) : (
                <IconButton href={`tel:${s.phone}`} aria-label={`Call ${s.name}`} sx={{ width: 48, height: 48 }}>
                  <PhoneOutlinedIcon />
                </IconButton>
              ))}
            {wide && s.status === 'no_reply' && (
              <Button size="small" onClick={logNoAnswer} disabled={calling} sx={{ minHeight: 44 }}>
                Called, no answer
              </Button>
            )}
            {wide ? (
              <Button
                size="small"
                variant={expanded ? 'contained' : 'text'}
                disableElevation
                startIcon={<EditNoteRoundedIcon />}
                onClick={onExpand}
                aria-expanded={expanded}
                aria-controls={panelId}
                sx={{ minHeight: 44 }}
              >
                Record
              </Button>
            ) : (
              <IconButton
                onClick={onExpand}
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={`Record an answer for ${s.name}`}
                sx={{ width: 48, height: 48, color: expanded ? 'primary.main' : undefined }}
              >
                <EditNoteRoundedIcon />
              </IconButton>
            )}
          </Box>
        )}
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box id={panelId}>
          <RecordPanel
            classDate={classDate}
            onSave={onRecord}
            onNoAnswer={!wide && s.status === 'no_reply' ? logNoAnswer : undefined}
            calling={calling}
          />
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Typing in what they said ────────────────────────────────────────────────

function RecordPanel({
  classDate,
  onSave,
  onNoAnswer,
  calling,
}: {
  classDate: string;
  onSave: (answer: RecordAnswer) => Promise<boolean>;
  onNoAnswer?: () => void;
  calling: boolean;
}) {
  const theme = useTheme();
  const [answer, setAnswer] = useState<'coming' | 'not_coming'>('coming');
  const [reasonCode, setReasonCode] = useState<RsvpReasonCode>('unwell');
  const [note, setNote] = useState('');
  const [span, setSpan] = useState<'class' | 'days'>('class');
  const [startsOn, setStartsOn] = useState(classDate);
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  const noteMissing = answer === 'not_coming' && reasonRequiresNote(reasonCode) && !note.trim();
  const datesWrong = answer === 'not_coming' && span === 'days' && !!endsOn && endsOn < startsOn;

  const save = async () => {
    setTouched(true);
    if (noteMissing || datesWrong) return;
    setSaving(true);
    const payload: RecordAnswer =
      answer === 'coming'
        ? { kind: 'coming' }
        : span === 'class'
          ? { kind: 'class', reasonCode, note: note.trim() }
          : { kind: 'days', reasonCode, note: note.trim(), startsOn, endsOn: endsOn || null };
    await onSave(payload);
    setSaving(false);
  };

  const toggleSx = toggleGroupSx(theme);

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        borderRadius: 2,
        bgcolor: alpha(theme.palette.primary.main, 0.04),
        border: 1,
        borderColor: alpha(theme.palette.primary.main, 0.2),
        display: 'grid',
        gap: 1.25,
      }}
    >
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        value={answer}
        onChange={(_, v) => v && setAnswer(v)}
        aria-label="What they said"
        sx={toggleSx}
      >
        <ToggleButton value="coming">
          <CheckCircleRoundedIcon aria-hidden sx={{ fontSize: 18, mr: 0.75 }} />
          Coming
        </ToggleButton>
        <ToggleButton value="not_coming">
          <EventBusyRoundedIcon aria-hidden sx={{ fontSize: 18, mr: 0.75 }} />
          Not coming
        </ToggleButton>
      </ToggleButtonGroup>

      {answer === 'not_coming' && (
        <>
          <Box role="radiogroup" aria-label="Reason" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {RSVP_REASONS.map((r) => {
              const on = reasonCode === r.code;
              return (
                <Button
                  key={r.code}
                  role="radio"
                  aria-checked={on}
                  size="small"
                  variant={on ? 'contained' : 'outlined'}
                  disableElevation
                  onClick={() => setReasonCode(r.code)}
                  sx={{
                    minHeight: 44,
                    borderRadius: 999,
                    textTransform: 'none',
                    ...(on ? {} : { color: 'text.primary', borderColor: 'divider' }),
                  }}
                >
                  {r.shortLabel}
                </Button>
              );
            })}
          </Box>
          <TextField
            label={reasonRequiresNote(reasonCode) ? 'What they said (needed)' : 'What they said (optional)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            size="small"
            fullWidth
            inputProps={{ maxLength: 300 }}
            error={touched && noteMissing}
            helperText={touched && noteMissing ? 'Add a short note for Other.' : ' '}
          />
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={span}
            onChange={(_, v) => v && setSpan(v)}
            aria-label="How long"
            sx={toggleSx}
          >
            <ToggleButton value="class">Just this class</ToggleButton>
            <ToggleButton value="days">Several days</ToggleButton>
          </ToggleButtonGroup>
          {span === 'days' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <TextField
                type="date"
                label="From"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="date"
                label="Back on (if known)"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                size="small"
                InputLabelProps={{ shrink: true }}
                error={touched && datesWrong}
                helperText={touched && datesWrong ? 'Before the start date.' : 'Last day away'}
              />
            </Box>
          )}
        </>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {onNoAnswer && (
          <Button onClick={onNoAnswer} disabled={calling} sx={{ minHeight: 44, flex: '1 1 auto' }}>
            Called, no answer
          </Button>
        )}
        <Button
          variant="contained"
          disableElevation
          onClick={save}
          disabled={saving}
          sx={{ minHeight: 44, flex: '1 1 auto' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}

/** For the page's post-create prompt: "9 students who often miss". */
export function formatClassOption(c: { class_id: string; title: string; start_time: string }): FollowUpClassOption {
  return { id: c.class_id, title: c.title, start_time: c.start_time };
}
