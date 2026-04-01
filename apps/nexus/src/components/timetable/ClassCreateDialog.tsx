'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  FormHelperText,
  Switch,
  ListSubheader,
  Chip,
  Collapse,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
} from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import SchoolIcon from '@mui/icons-material/School';
import GroupsIcon from '@mui/icons-material/Groups';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RepeatIcon from '@mui/icons-material/Repeat';
import TuneIcon from '@mui/icons-material/Tune';
import { type ClassCardData } from './ClassCard';
import { type HolidayInfo } from './WeeklyCalendarGrid';

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface BatchOption {
  id: string;
  name: string;
}

interface ClassroomOption {
  id: string;
  name: string;
  type: string;
  ms_team_id?: string | null;
  batches: BatchOption[];
}

interface ClassFormData {
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  topic_id: string;
  /** Encoded target: "classroom:{id}" or "batch:{classroomId}:{batchId}" */
  target: string;
  create_meeting: boolean;
  description: string;
  // Meeting options
  meeting_scope: 'auto' | 'link_only' | 'channel_meeting' | 'calendar_event';
  lobby_bypass: string;
  allowed_presenters: string;
  // Recurrence
  recurrence: 'none' | 'daily' | 'weekly';
  recurrence_days: string[];
  recurrence_end_date: string;
}

/** Today as YYYY-MM-DD */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
}

/** Quick time presets for scheduling */
const TIME_PRESETS = [
  { label: 'Morning 10:30', start: '10:30', end: '12:00' },
  { label: 'Morning 11:00', start: '11:00', end: '12:30' },
  { label: 'Evening 6:30', start: '18:30', end: '20:00' },
  { label: 'Evening 7:00', start: '19:00', end: '20:30' },
] as const;

/** Generate time options in 30-min intervals for dropdown (7 AM to 10 PM) */
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 22 && m === 30) break;
      const val = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const hour12 = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
      options.push({ value: val, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

const emptyForm: ClassFormData = {
  title: '',
  scheduled_date: todayStr(),
  start_time: '',
  end_time: '',
  topic_id: '',
  target: '',
  create_meeting: false,
  description: '',
  meeting_scope: 'auto',
  lobby_bypass: 'organization',
  allowed_presenters: 'organizer',
  recurrence: 'none',
  recurrence_days: [],
  recurrence_end_date: '',
};

/** Color map for classroom types */
const typeColors: Record<string, string> = {
  common: 'warning.main',
  nata: 'primary.main',
  jee: 'secondary.main',
  revit: 'info.main',
  other: 'text.secondary',
};

const WEEKDAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
];

interface ClassCreateDialogProps {
  open: boolean;
  onClose: () => void;
  editingClass: ClassCardData | null;
  topics: TopicOption[];
  /** All classrooms the teacher has access to, with their batches */
  classrooms: ClassroomOption[];
  /** Default classroom ID (active classroom) */
  defaultClassroomId: string;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  prefillDate?: string;
  prefillTime?: string;
  holidays?: Record<string, HolidayInfo>;
  onRemoveHoliday?: (date: string) => Promise<void>;
  onMeetingError?: (error: string) => void;
  /** Called with class data when a new class with meeting toggle is created — parent handles background meeting creation */
  onCreateMeetingInBackground?: (classId: string, classroomId: string, meetingScope?: string) => void;

  // Legacy props — kept for backward compatibility
  classroomId?: string;
  batches?: BatchOption[];
  hasLinkedTeam?: boolean;
  commonClassroomId?: string | null;
  classroomName?: string;
}

/** Parse target string → { classroomId, batchId, scope } */
function parseTarget(target: string): { classroomId: string; batchId: string | null; scope: 'all' | 'classroom' | 'batch' } {
  if (target.startsWith('batch:')) {
    const parts = target.split(':');
    return { classroomId: parts[1], batchId: parts[2], scope: 'batch' };
  }
  if (target.startsWith('classroom:')) {
    const cid = target.replace('classroom:', '');
    return { classroomId: cid, batchId: null, scope: 'classroom' };
  }
  return { classroomId: '', batchId: null, scope: 'classroom' };
}

export default function ClassCreateDialog({
  open,
  onClose,
  editingClass,
  topics,
  classrooms,
  defaultClassroomId,
  getToken,
  onSaved,
  prefillDate,
  prefillTime,
  holidays,
  onRemoveHoliday,
  onMeetingError,
  onCreateMeetingInBackground,
  // Legacy
  classroomId: legacyClassroomId,
  batches: legacyBatches,
  hasLinkedTeam,
  commonClassroomId,
  classroomName,
}: ClassCreateDialogProps) {
  // Build classrooms list — use new prop if available, else build from legacy props
  const effectiveClassrooms: ClassroomOption[] = classrooms && classrooms.length > 0
    ? classrooms
    : (() => {
        const list: ClassroomOption[] = [];
        if (commonClassroomId) {
          list.push({ id: commonClassroomId, name: 'Common Classes', type: 'common', batches: [] });
        }
        const cid = defaultClassroomId || legacyClassroomId || '';
        if (cid) {
          list.push({ id: cid, name: classroomName || 'Classroom', type: 'nata', batches: legacyBatches || [] });
        }
        return list;
      })();

  const effectiveDefaultId = defaultClassroomId || legacyClassroomId || '';
  const defaultTarget = effectiveDefaultId ? `classroom:${effectiveDefaultId}` : '';

  const [formData, setFormData] = useState<ClassFormData>({ ...emptyForm, target: defaultTarget });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holidayConflict, setHolidayConflict] = useState<{ date: string; title: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Populate form when editing or opening
  useEffect(() => {
    if (editingClass) {
      // Figure out target from editing class
      let target = defaultTarget;
      if (editingClass.batch_id && editingClass.classroom?.id) {
        target = `batch:${editingClass.classroom.id}:${editingClass.batch_id}`;
      } else if (editingClass.classroom?.id) {
        target = `classroom:${editingClass.classroom.id}`;
      }
      setFormData({
        title: editingClass.title,
        scheduled_date: editingClass.scheduled_date,
        start_time: editingClass.start_time,
        end_time: editingClass.end_time,
        topic_id: editingClass.topic?.id || '',
        target,
        create_meeting: false,
        description: editingClass.description || '',
        meeting_scope: 'auto',
        lobby_bypass: 'organization',
        allowed_presenters: 'organizer',
        recurrence: 'none',
        recurrence_days: [],
        recurrence_end_date: '',
      });
    } else if (prefillDate || prefillTime) {
      setFormData({
        ...emptyForm,
        target: defaultTarget,
        scheduled_date: prefillDate || '',
        start_time: prefillTime || '',
        end_time: prefillTime ? (() => {
          const [h] = prefillTime.split(':').map(Number);
          return `${(h + 1).toString().padStart(2, '0')}:00`;
        })() : '',
      });
    } else {
      setFormData({ ...emptyForm, target: defaultTarget });
    }
    setError(null);
    setShowAdvanced(false);
  }, [editingClass, open, defaultTarget]);

  const { classroomId: selectedClassroomId, batchId: selectedBatchId, scope } = parseTarget(formData.target);

  // Find the selected classroom for display info
  const selectedClassroom = effectiveClassrooms.find((c) => c.id === selectedClassroomId);
  const isCommon = selectedClassroom?.type === 'common';

  const handleSubmit = async () => {
    if (!formData.title || !formData.scheduled_date || !formData.start_time || !formData.end_time) {
      setError('Please fill in all required fields');
      return;
    }
    if (!formData.target) {
      setError('Please select a classroom');
      return;
    }

    // Recurrence validation
    if (formData.recurrence === 'weekly' && formData.recurrence_days.length === 0) {
      setError('Please select at least one day for weekly recurrence');
      return;
    }
    if (formData.recurrence !== 'none' && !formData.recurrence_end_date) {
      setError('Please set an end date for recurring classes');
      return;
    }

    // Check for holiday conflict (only when creating, not editing)
    if (!editingClass && holidays && holidays[formData.scheduled_date]) {
      setHolidayConflict({
        date: formData.scheduled_date,
        title: holidays[formData.scheduled_date].title,
      });
      return;
    }

    await doSubmit();
  };

  const handleConfirmHolidayOverride = async () => {
    if (holidayConflict && onRemoveHoliday) {
      try {
        await onRemoveHoliday(holidayConflict.date);
      } catch {
        setError('Failed to remove holiday');
        setHolidayConflict(null);
        return;
      }
    }
    setHolidayConflict(null);
    await doSubmit();
  };

  const doSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) return;

      // Build recurrence_rule string
      let recurrenceRule: string | null = null;
      if (formData.recurrence === 'daily') {
        recurrenceRule = 'daily';
      } else if (formData.recurrence === 'weekly' && formData.recurrence_days.length > 0) {
        recurrenceRule = `weekly:${formData.recurrence_days.join(',')}`;
      }

      const body: Record<string, unknown> = {
        title: formData.title,
        scheduled_date: formData.scheduled_date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        classroom_id: selectedClassroomId,
        topic_id: formData.topic_id || null,
        batch_id: selectedBatchId || null,
        target_scope: scope === 'batch' ? 'batch' : (isCommon ? 'all' : 'classroom'),
        description: formData.description || null,
        lobby_bypass: formData.create_meeting ? formData.lobby_bypass : null,
        allowed_presenters: formData.create_meeting ? formData.allowed_presenters : null,
        recurrence_rule: recurrenceRule,
        recurrence_end_date: recurrenceRule ? formData.recurrence_end_date : null,
      };

      const method = editingClass ? 'PATCH' : 'POST';
      if (editingClass) {
        body.id = editingClass.id;
      }

      const res = await fetch('/api/timetable', {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save class');
      }

      const data = await res.json();

      // Close dialog and refresh list immediately — don't wait for Teams meeting
      const wantsMeeting = !editingClass && formData.create_meeting;
      const meetingScope = formData.meeting_scope;

      onClose();
      onSaved();

      // Tell the parent to create the Teams meeting in the background
      if (wantsMeeting && onCreateMeetingInBackground) {
        if (data.classes) {
          // Recurrence: multiple classes created — create meetings for each
          for (const cls of data.classes) {
            onCreateMeetingInBackground(cls.id, selectedClassroomId, meetingScope);
          }
        } else if (data.class?.id) {
          onCreateMeetingInBackground(data.class.id, selectedClassroomId, meetingScope);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save class');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine if the selected classroom has a linked Teams team
  const selectedHasTeam = !!selectedClassroom?.ms_team_id;

  const toggleRecurrenceDay = (day: string) => {
    setFormData((f) => ({
      ...f,
      recurrence_days: f.recurrence_days.includes(day)
        ? f.recurrence_days.filter((d) => d !== day)
        : [...f.recurrence_days, day],
    }));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editingClass ? 'Edit Class' : 'Add Class'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Classroom & Batch selector */}
          <FormControl fullWidth>
            <InputLabel id="target-select-label" shrink>Classroom / Batch *</InputLabel>
            <Select
              labelId="target-select-label"
              label="Classroom / Batch *"
              displayEmpty
              value={formData.target}
              onChange={(e) => setFormData((f) => ({ ...f, target: e.target.value as string }))}
              notched
              MenuProps={{ PaperProps: { sx: { maxHeight: 350 } } }}
              sx={{ minHeight: 48 }}
              renderValue={(val) => {
                if (!val) return <em>-- Select Classroom --</em>;
                const parsed = parseTarget(val as string);
                const cls = effectiveClassrooms.find((c) => c.id === parsed.classroomId);
                if (!cls) return val;
                if (parsed.batchId) {
                  const batch = cls.batches.find((b) => b.id === parsed.batchId);
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <GroupsIcon sx={{ fontSize: 18, color: typeColors[cls.type] || 'text.secondary' }} />
                      <span>{cls.name} &rsaquo; {batch?.name || 'Batch'}</span>
                    </Box>
                  );
                }
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {cls.type === 'common'
                      ? <PeopleAltIcon sx={{ fontSize: 18, color: typeColors[cls.type] }} />
                      : <SchoolIcon sx={{ fontSize: 18, color: typeColors[cls.type] }} />}
                    <span>{cls.type === 'common' ? 'All Students (Common)' : cls.name}</span>
                  </Box>
                );
              }}
            >
              <MenuItem value="" disabled>
                <em>-- Select Classroom --</em>
              </MenuItem>
              {effectiveClassrooms.map((cls) => {
                const items: React.ReactNode[] = [];
                // Classroom-level option
                items.push(
                  <MenuItem
                    key={`classroom:${cls.id}`}
                    value={`classroom:${cls.id}`}
                    sx={{ minHeight: 44 }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                      {cls.type === 'common'
                        ? <PeopleAltIcon sx={{ fontSize: 20, color: typeColors[cls.type] }} />
                        : <SchoolIcon sx={{ fontSize: 20, color: typeColors[cls.type] }} />}
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                          {cls.type === 'common' ? 'All Students' : cls.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {cls.type === 'common' ? 'Visible across all classrooms' : `All students in ${cls.name}`}
                        </Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                );
                // Batch-level options (indented under classroom)
                if (cls.batches.length > 0 && cls.type !== 'common') {
                  items.push(
                    <ListSubheader key={`batch-header-${cls.id}`} sx={{ fontWeight: 600, fontSize: '0.7rem', lineHeight: '28px', pl: 5.5, color: 'text.secondary' }}>
                      BATCHES IN {cls.name.toUpperCase()}
                    </ListSubheader>
                  );
                  for (const batch of cls.batches) {
                    items.push(
                      <MenuItem
                        key={`batch:${cls.id}:${batch.id}`}
                        value={`batch:${cls.id}:${batch.id}`}
                        sx={{ pl: 5.5, minHeight: 40 }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <GroupsIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                          <Typography variant="body2">{batch.name}</Typography>
                        </Box>
                      </MenuItem>
                    );
                  }
                }
                return items;
              })}
            </Select>
            <FormHelperText>
              {!formData.target && 'Choose who will see this class'}
              {isCommon && 'This class will be visible to all students across all classrooms'}
              {!isCommon && scope === 'classroom' && selectedClassroom && `Visible to all students in ${selectedClassroom.name}`}
              {scope === 'batch' && 'Visible only to students in this batch'}
            </FormHelperText>
          </FormControl>

          <TextField
            label="Title *"
            fullWidth
            value={formData.title}
            onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
            inputProps={{ style: { minHeight: 24 } }}
          />

          <TextField
            label="Date *"
            type="date"
            fullWidth
            value={formData.scheduled_date}
            onChange={(e) => setFormData((f) => ({ ...f, scheduled_date: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            helperText={formData.scheduled_date === todayStr() ? 'Today' : undefined}
          />

          {/* Quick time presets */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.75, display: 'block' }}>
              Quick Select
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {TIME_PRESETS.map((preset) => {
                const isActive = formData.start_time === preset.start && formData.end_time === preset.end;
                return (
                  <Chip
                    key={preset.label}
                    label={preset.label}
                    onClick={() =>
                      setFormData((f) => ({
                        ...f,
                        start_time: preset.start,
                        end_time: preset.end,
                      }))
                    }
                    color={isActive ? 'primary' : 'default'}
                    variant={isActive ? 'filled' : 'outlined'}
                    sx={{
                      minHeight: 44,
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      '&:hover': { bgcolor: isActive ? undefined : 'action.hover' },
                    }}
                  />
                );
              })}
            </Box>
          </Box>

          {/* Start / End time dropdowns */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel id="start-time-label" shrink>Start Time *</InputLabel>
              <Select
                labelId="start-time-label"
                label="Start Time *"
                displayEmpty
                value={formData.start_time}
                onChange={(e) => {
                  const start = e.target.value as string;
                  setFormData((f) => {
                    // Auto-set end time to 1.5 hours after start if not already set or if end <= start
                    let end = f.end_time;
                    if (!end || end <= start) {
                      const [h, m] = start.split(':').map(Number);
                      const endMin = h * 60 + m + 90;
                      const eh = Math.min(Math.floor(endMin / 60), 22);
                      const em = endMin % 60;
                      end = `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
                    }
                    return { ...f, start_time: start, end_time: end };
                  });
                }}
                notched
                sx={{ minHeight: 48 }}
                renderValue={(val) => {
                  if (!val) return <em style={{ color: '#999' }}>Select</em>;
                  const opt = TIME_OPTIONS.find((o) => o.value === val);
                  return opt ? opt.label : val;
                }}
              >
                <MenuItem value="" disabled><em>Select time</em></MenuItem>
                {TIME_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ minHeight: 40 }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="end-time-label" shrink>End Time *</InputLabel>
              <Select
                labelId="end-time-label"
                label="End Time *"
                displayEmpty
                value={formData.end_time}
                onChange={(e) => setFormData((f) => ({ ...f, end_time: e.target.value as string }))}
                notched
                sx={{ minHeight: 48 }}
                renderValue={(val) => {
                  if (!val) return <em style={{ color: '#999' }}>Select</em>;
                  const opt = TIME_OPTIONS.find((o) => o.value === val);
                  return opt ? opt.label : val;
                }}
              >
                <MenuItem value="" disabled><em>Select time</em></MenuItem>
                {TIME_OPTIONS.filter((opt) => !formData.start_time || opt.value > formData.start_time).map((opt) => (
                  <MenuItem key={opt.value} value={opt.value} sx={{ minHeight: 40 }}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <FormControl fullWidth>
            <InputLabel id="topic-select-label" shrink>Topic</InputLabel>
            <Select
              labelId="topic-select-label"
              label="Topic"
              displayEmpty
              value={formData.topic_id}
              onChange={(e) => setFormData((f) => ({ ...f, topic_id: e.target.value as string }))}
              notched
              MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
              sx={{ minHeight: 48 }}
            >
              <MenuItem value="">
                <em>-- Select Topic --</em>
              </MenuItem>
              {(() => {
                const grouped = topics.reduce<Record<string, TopicOption[]>>((acc, t) => {
                  const cat = t.category || 'General';
                  if (!acc[cat]) acc[cat] = [];
                  acc[cat].push(t);
                  return acc;
                }, {});
                const categories = Object.keys(grouped);
                if (categories.length <= 1) {
                  return topics.map((t) => (
                    <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>
                  ));
                }
                return categories.map((cat) => [
                  <ListSubheader key={`header-${cat}`} sx={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', lineHeight: '32px' }}>
                    {cat}
                  </ListSubheader>,
                  ...grouped[cat].map((t) => (
                    <MenuItem key={t.id} value={t.id} sx={{ pl: 3 }}>{t.title}</MenuItem>
                  )),
                ]);
              })()}
            </Select>
          </FormControl>

          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            value={formData.description}
            onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional notes or agenda for this class"
          />

          {/* ─── Recurrence Section ─── */}
          {!editingClass && (
            <Box
              sx={{
                p: 1.5,
                border: '1px solid',
                borderColor: formData.recurrence !== 'none' ? 'primary.main' : 'divider',
                borderRadius: 1,
                bgcolor: formData.recurrence !== 'none' ? 'primary.50' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: formData.recurrence !== 'none' ? 1.5 : 0 }}>
                <RepeatIcon color={formData.recurrence !== 'none' ? 'primary' : 'disabled'} />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <Select
                    value={formData.recurrence}
                    onChange={(e) => setFormData((f) => ({
                      ...f,
                      recurrence: e.target.value as 'none' | 'daily' | 'weekly',
                      recurrence_days: e.target.value === 'none' ? [] : f.recurrence_days,
                    }))}
                    sx={{ minHeight: 44 }}
                  >
                    <MenuItem value="none">No Repeat</MenuItem>
                    <MenuItem value="daily">Daily (Mon-Sat)</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                  </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary" sx={{ flex: 1, fontSize: '0.8rem' }}>
                  {formData.recurrence === 'none' && 'One-time class'}
                  {formData.recurrence === 'daily' && 'Repeats every weekday'}
                  {formData.recurrence === 'weekly' && 'Select days below'}
                </Typography>
              </Box>

              {/* Weekly day picker */}
              {formData.recurrence === 'weekly' && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                  {WEEKDAYS.map((day) => (
                    <Chip
                      key={day.key}
                      label={day.label}
                      onClick={() => toggleRecurrenceDay(day.key)}
                      color={formData.recurrence_days.includes(day.key) ? 'primary' : 'default'}
                      variant={formData.recurrence_days.includes(day.key) ? 'filled' : 'outlined'}
                      sx={{
                        minWidth: 48,
                        minHeight: 44,
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </Box>
              )}

              {/* End date */}
              {formData.recurrence !== 'none' && (
                <TextField
                  label="Repeat Until *"
                  type="date"
                  fullWidth
                  size="small"
                  value={formData.recurrence_end_date}
                  onChange={(e) => setFormData((f) => ({ ...f, recurrence_end_date: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: formData.scheduled_date }}
                  sx={{ mt: 0.5 }}
                />
              )}
            </Box>
          )}

          {/* ─── Create Teams Meeting toggle ─── */}
          {!editingClass && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                p: 1.5,
                border: '1px solid',
                borderColor: formData.create_meeting ? 'primary.main' : 'divider',
                borderRadius: 1,
                bgcolor: formData.create_meeting ? 'primary.50' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <VideocamIcon color={formData.create_meeting ? 'primary' : 'disabled'} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Create Teams Meeting
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedHasTeam
                      ? 'Meeting link + channel post + calendar invites'
                      : 'Meeting link + calendar invites to students'}
                  </Typography>
                </Box>
              </Box>
              <Switch
                checked={formData.create_meeting}
                onChange={(e) => setFormData((f) => ({ ...f, create_meeting: e.target.checked }))}
                color="primary"
              />
            </Box>
          )}

          {/* ─── Meeting Options (visible when create_meeting is ON) ─── */}
          {!editingClass && formData.create_meeting && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Meeting Scope Selector */}
              <FormControl component="fieldset">
                <FormLabel component="legend" sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 0.5 }}>
                  Meeting Type
                </FormLabel>
                <RadioGroup
                  value={formData.meeting_scope}
                  onChange={(e) => setFormData((f) => ({ ...f, meeting_scope: e.target.value as ClassFormData['meeting_scope'] }))}
                >
                  <FormControlLabel
                    value="auto"
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Auto (Recommended)</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {selectedHasTeam ? 'Channel meeting with invites' : 'Standalone meeting with invites'}
                        </Typography>
                      </Box>
                    }
                    sx={{ minHeight: 48, alignItems: 'flex-start', py: 0.5 }}
                  />
                  {selectedHasTeam && (
                    <FormControlLabel
                      value="channel_meeting"
                      control={<Radio size="small" />}
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>Channel Meeting</Typography>
                          <Typography variant="caption" color="text.secondary">Shows in Teams channel + calendar invites</Typography>
                        </Box>
                      }
                      sx={{ minHeight: 48, alignItems: 'flex-start', py: 0.5 }}
                    />
                  )}
                  <FormControlLabel
                    value="calendar_event"
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Calendar Event</Typography>
                        <Typography variant="caption" color="text.secondary">Meeting link + Outlook invites to students</Typography>
                      </Box>
                    }
                    sx={{ minHeight: 48, alignItems: 'flex-start', py: 0.5 }}
                  />
                  <FormControlLabel
                    value="link_only"
                    control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>Link Only</Typography>
                        <Typography variant="caption" color="text.secondary">Just a join link, no calendar invites</Typography>
                      </Box>
                    }
                    sx={{ minHeight: 48, alignItems: 'flex-start', py: 0.5 }}
                  />
                </RadioGroup>
              </FormControl>

              {/* Advanced Meeting Options (collapsible) */}
              <Box>
                <Button
                  size="small"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  startIcon={<TuneIcon />}
                  endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ textTransform: 'none', color: 'text.secondary', minHeight: 44 }}
                >
                  Meeting Options
                </Button>
                <Collapse in={showAdvanced}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1.5, pl: 1 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="lobby-label" shrink>Who can bypass the lobby?</InputLabel>
                      <Select
                        labelId="lobby-label"
                        label="Who can bypass the lobby?"
                        value={formData.lobby_bypass}
                        onChange={(e) => setFormData((f) => ({ ...f, lobby_bypass: e.target.value }))}
                        notched
                        sx={{ minHeight: 44 }}
                      >
                        <MenuItem value="everyone">Everyone</MenuItem>
                        <MenuItem value="organization">People in my organization</MenuItem>
                        <MenuItem value="organizer">Only me (organizer)</MenuItem>
                        <MenuItem value="invitees">Only invited people</MenuItem>
                      </Select>
                    </FormControl>

                    <FormControl fullWidth size="small">
                      <InputLabel id="presenter-label" shrink>Who can present?</InputLabel>
                      <Select
                        labelId="presenter-label"
                        label="Who can present?"
                        value={formData.allowed_presenters}
                        onChange={(e) => setFormData((f) => ({ ...f, allowed_presenters: e.target.value }))}
                        notched
                        sx={{ minHeight: 44 }}
                      >
                        <MenuItem value="everyone">Everyone</MenuItem>
                        <MenuItem value="organization">People in my organization</MenuItem>
                        <MenuItem value="organizer">Only me (organizer)</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                </Collapse>
              </Box>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || !formData.title || !formData.scheduled_date || !formData.target}
          sx={{ minHeight: 48 }}
        >
          {submitting ? 'Saving...' : editingClass ? 'Update' : 'Create'}
        </Button>
      </DialogActions>

      {/* Holiday conflict confirmation */}
      <Dialog open={!!holidayConflict} onClose={() => setHolidayConflict(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Holiday on this date</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            <strong>{holidayConflict?.date}</strong> is marked as a holiday: <strong>{holidayConflict?.title}</strong>
          </Typography>
          <Typography variant="body2" color="warning.main" sx={{ mt: 1.5 }}>
            Do you want to remove the holiday and schedule this class?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHolidayConflict(null)} sx={{ minHeight: 48 }}>
            No, keep holiday
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleConfirmHolidayOverride}
            sx={{ minHeight: 48 }}
          >
            Remove holiday &amp; create class
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
