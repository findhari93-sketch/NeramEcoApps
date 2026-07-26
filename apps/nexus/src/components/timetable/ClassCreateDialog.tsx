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
  Chip,
  Collapse,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Autocomplete,
  Checkbox,
  ListItemText,
  CircularProgress,
} from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import SchoolIcon from '@mui/icons-material/School';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RepeatIcon from '@mui/icons-material/Repeat';
import TuneIcon from '@mui/icons-material/Tune';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import { type ClassCardData } from './ClassCard';
import { type HolidayInfo } from './WeeklyCalendarGrid';
import { buildClassDraftPrompt, parseClassDraft } from '@/lib/class-ai-draft';

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface BatchOption {
  id: string;
  name: string;
}

interface TeacherOption {
  id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  user_type?: string;
  /** True for the currently signed-in scheduler, so the picker can default to them. */
  isSelf?: boolean;
}

interface ClassroomOption {
  id: string;
  name: string;
  type: string;
  ms_team_id?: string | null;
  /** Academic year for cohort classrooms (e.g. "2026-27"), shown to distinguish yearly batches. */
  academic_year?: string | null;
  /** Batch granularity was dropped from the classroom picker; kept optional for legacy callers. */
  batches?: BatchOption[];
}

/**
 * Label for a classroom option. Under the classroom-per-year model every cohort is
 * a `common`-type classroom, so we show its real name (e.g. "JEE B.Arch Session 1")
 * rather than the old generic "All Students (Common)" mask. The academic year, when
 * present, disambiguates one year's cohort from the next.
 */
function classroomSubtitle(cls: ClassroomOption): string {
  if (cls.type === 'common') {
    return cls.academic_year ? `Whole ${cls.academic_year} cohort` : 'All students in this cohort';
  }
  return `Students in ${cls.name}`;
}

interface ClassFormData {
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  /** Course Plan Builder topic id (nexus_course_topics). */
  topic_id: string;
  /** The teacher (tutor) who takes this class. Defaults to the scheduler. */
  teacher_id: string;
  /** Classrooms this class targets. One row is created per classroom (shared meeting). */
  classroom_ids: string[];
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
  teacher_id: '',
  classroom_ids: [],
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
  /** Legacy seed only; the dialog now loads Course Plan topics for the selected classroom(s). */
  topics?: TopicOption[];
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
  const defaultClassroomIds = effectiveDefaultId ? [effectiveDefaultId] : [];

  const [formData, setFormData] = useState<ClassFormData>({ ...emptyForm, classroom_ids: defaultClassroomIds });
  // Course Plan topics for the currently selected classroom(s), fetched on selection change.
  const [topicOptions, setTopicOptions] = useState<TopicOption[]>(topics || []);
  const [topicsLoading, setTopicsLoading] = useState(false);
  // Teaching staff for the "Teacher (tutor)" picker, loaded once when the dialog opens.
  const [teacherOptions, setTeacherOptions] = useState<TeacherOption[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [selfTeacherId, setSelfTeacherId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holidayConflict, setHolidayConflict] = useState<{ date: string; title: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── AI draft (copy-prompt / paste-back bridge) ──
  const [showAiDraft, setShowAiDraft] = useState(false);
  const [aiIdea, setAiIdea] = useState('');
  const [aiPaste, setAiPaste] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPromptCopied, setAiPromptCopied] = useState(false);

  const handleCopyAiPrompt = () => {
    navigator.clipboard.writeText(buildClassDraftPrompt(aiIdea)).then(() => {
      setAiPromptCopied(true);
      setTimeout(() => setAiPromptCopied(false), 2000);
    });
  };

  const handleApplyAiDraft = () => {
    const result = parseClassDraft(aiPaste);
    if (!result.valid || !result.data) {
      setAiError(result.errors[0] || 'Could not read that. Paste the JSON the AI gave you.');
      return;
    }
    setAiError(null);
    setFormData((f) => ({
      ...f,
      title: result.data!.title || f.title,
      description: result.data!.description || f.description,
    }));
    setAiPaste('');
    setShowAiDraft(false);
  };

  // Populate form when editing or opening
  useEffect(() => {
    const fallbackIds = effectiveDefaultId ? [effectiveDefaultId] : [];
    if (editingClass) {
      // An existing class lives in a single classroom; map it back into the multi-select.
      const classroomIds = editingClass.classroom?.id ? [editingClass.classroom.id] : fallbackIds;
      setFormData({
        title: editingClass.title,
        scheduled_date: editingClass.scheduled_date,
        start_time: editingClass.start_time,
        end_time: editingClass.end_time,
        topic_id: editingClass.course_topic?.id || editingClass.topic?.id || '',
        teacher_id: editingClass.teacher?.id || '',
        classroom_ids: classroomIds,
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
        classroom_ids: fallbackIds,
        scheduled_date: prefillDate || '',
        start_time: prefillTime || '',
        end_time: prefillTime ? (() => {
          const [h] = prefillTime.split(':').map(Number);
          return `${(h + 1).toString().padStart(2, '0')}:00`;
        })() : '',
      });
    } else {
      setFormData({ ...emptyForm, classroom_ids: fallbackIds });
    }
    setError(null);
    setShowAdvanced(false);
    setShowAiDraft(false);
    setAiIdea('');
    setAiPaste('');
    setAiError(null);
    setAiPromptCopied(false);
  }, [editingClass, open, effectiveDefaultId, prefillDate, prefillTime]);

  // Selected classrooms → display info + meeting capability.
  const selectedClassrooms = effectiveClassrooms.filter((c) => formData.classroom_ids.includes(c.id));
  const isCommon = selectedClassrooms.some((c) => c.type === 'common');
  const primaryClassroomId = formData.classroom_ids[0] || '';
  const classroomIdsKey = formData.classroom_ids.join(',');

  // Load Course Plan topics for the selected classroom(s). The Topic picker shows only
  // topics placed in the selected classroom's active teaching plan (union when several).
  useEffect(() => {
    if (!open) return;
    const ids = classroomIdsKey ? classroomIdsKey.split(',') : [];
    if (ids.length === 0) {
      setTopicOptions([]);
      return;
    }
    let cancelled = false;
    setTopicsLoading(true);
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const qs = ids.map((id) => `classroom=${encodeURIComponent(id)}`).join('&');
        const res = await fetch(`/api/timetable/plan-topics?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setTopicOptions(data.topics || []);
        }
      } catch {
        // Non-fatal: the picker just stays empty.
      } finally {
        if (!cancelled) setTopicsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, classroomIdsKey, getToken]);

  // Load teaching staff once per open for the tutor picker, and remember who the
  // signed-in scheduler is so new classes default to them as the tutor.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTeachersLoading(true);
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/timetable/teachers', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            const list: TeacherOption[] = data.teachers || [];
            setTeacherOptions(list);
            setSelfTeacherId(list.find((t) => t.isSelf)?.id || '');
          }
        }
      } catch {
        // Non-fatal: the picker just stays empty and the API defaults the tutor to the scheduler.
      } finally {
        if (!cancelled) setTeachersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, getToken]);

  // Default a new class's tutor to the scheduler once staff have loaded, unless a
  // tutor is already chosen (e.g. editing an existing class).
  useEffect(() => {
    if (!open || editingClass || !selfTeacherId) return;
    setFormData((f) => (f.teacher_id ? f : { ...f, teacher_id: selfTeacherId }));
  }, [open, editingClass, selfTeacherId]);

  // Resolve the currently selected topic option (fall back to the editing class's topic
  // so its label shows even before the plan-topics list loads).
  const selectedTopic: TopicOption | null =
    topicOptions.find((t) => t.id === formData.topic_id) ||
    (editingClass?.course_topic && editingClass.course_topic.id === formData.topic_id
      ? { id: editingClass.course_topic.id, title: editingClass.course_topic.title, category: 'General' }
      : editingClass?.topic && editingClass.topic.id === formData.topic_id
        ? { id: editingClass.topic.id, title: editingClass.topic.title, category: editingClass.topic.category || 'General' }
        : null);

  // Resolve the selected tutor. Fall back to the editing class's teacher so its name
  // shows even before the staff list finishes loading.
  const selectedTeacher: TeacherOption | null =
    teacherOptions.find((t) => t.id === formData.teacher_id) ||
    (editingClass?.teacher && editingClass.teacher.id === formData.teacher_id
      ? {
          id: editingClass.teacher.id,
          name: editingClass.teacher.name,
          email: '',
          avatar_url: editingClass.teacher.avatar_url,
        }
      : null);

  const handleSubmit = async () => {
    if (!formData.title || !formData.scheduled_date || !formData.start_time || !formData.end_time) {
      setError('Please fill in all required fields');
      return;
    }
    if (formData.classroom_ids.length === 0) {
      setError('Please select at least one classroom');
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
        // Multi-classroom create; PATCH edits a single class so it also gets classroom_id.
        classroom_ids: formData.classroom_ids,
        classroom_id: primaryClassroomId,
        course_topic_id: formData.topic_id || null,
        teacher_id: formData.teacher_id || null,
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

      // Tell the parent to create the Teams meeting in the background. Rows can span
      // classrooms (and recurrence dates), so use each row's own classroom_id.
      if (wantsMeeting && onCreateMeetingInBackground) {
        const rows: { id: string; classroom_id: string }[] =
          data.classes || (data.class ? [data.class] : []);
        for (const cls of rows) {
          onCreateMeetingInBackground(cls.id, cls.classroom_id, meetingScope);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save class');
    } finally {
      setSubmitting(false);
    }
  };

  // Meeting posts into a Team channel only when every selected classroom has a linked Team.
  const selectedHasTeam = selectedClassrooms.length > 0 && selectedClassrooms.every((c) => !!c.ms_team_id);

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

          {/* Classroom multi-select — one class/meeting can target several classrooms. */}
          <FormControl fullWidth>
            <InputLabel id="classrooms-select-label" shrink>Classrooms *</InputLabel>
            <Select
              labelId="classrooms-select-label"
              label="Classrooms *"
              multiple
              displayEmpty
              value={formData.classroom_ids}
              onChange={(e) => {
                const val = e.target.value;
                setFormData((f) => ({
                  ...f,
                  classroom_ids: typeof val === 'string' ? val.split(',') : (val as string[]),
                }));
              }}
              notched
              MenuProps={{ PaperProps: { sx: { maxHeight: 350 } } }}
              sx={{ minHeight: 48 }}
              renderValue={(selected) => {
                const ids = selected as string[];
                if (ids.length === 0) return <em>-- Select Classrooms --</em>;
                const names = ids
                  .map((id) => effectiveClassrooms.find((x) => x.id === id)?.name || null)
                  .filter(Boolean);
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isCommon
                      ? <PeopleAltIcon sx={{ fontSize: 18, color: typeColors.common }} />
                      : <SchoolIcon sx={{ fontSize: 18, color: 'primary.main' }} />}
                    <span>{names.join(', ')}</span>
                  </Box>
                );
              }}
            >
              {effectiveClassrooms.map((cls) => (
                <MenuItem key={cls.id} value={cls.id} sx={{ minHeight: 44 }}>
                  <Checkbox
                    checked={formData.classroom_ids.includes(cls.id)}
                    sx={{ p: 0.5, mr: 1 }}
                  />
                  {cls.type === 'common'
                    ? <PeopleAltIcon sx={{ fontSize: 20, mr: 1, color: typeColors.common }} />
                    : <SchoolIcon sx={{ fontSize: 20, mr: 1, color: typeColors[cls.type] || 'text.secondary' }} />}
                  <ListItemText
                    primary={cls.name}
                    secondary={classroomSubtitle(cls)}
                    primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: 600, lineHeight: 1.2 } }}
                    secondaryTypographyProps={{ variant: 'caption', sx: { fontSize: '0.7rem' } }}
                  />
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {formData.classroom_ids.length === 0 && 'Choose which classrooms get this class'}
              {formData.classroom_ids.length > 0 &&
                `Visible to students in: ${selectedClassrooms.map((c) => c.name).join(', ')}`}
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

          {/* Topic — searchable, from the selected classroom's Course Plan. */}
          <Autocomplete
            options={[...topicOptions].sort((a, b) =>
              (a.category || 'General').localeCompare(b.category || 'General'),
            )}
            groupBy={(o) => o.category || 'General'}
            getOptionLabel={(o) => o.title}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            value={selectedTopic}
            onChange={(_e, val) => setFormData((f) => ({ ...f, topic_id: val?.id || '' }))}
            loading={topicsLoading}
            fullWidth
            renderInput={(params) => (
              <TextField
                {...params}
                label="Topic"
                placeholder="Search topics from the course plan"
                InputLabelProps={{ ...params.InputLabelProps, shrink: true }}
                helperText={
                  formData.classroom_ids.length === 0
                    ? 'Select a classroom to load its course plan topics'
                    : !topicsLoading && topicOptions.length === 0
                      ? 'No course plan topics for this classroom yet. Add topics in Course Plans → Builder.'
                      : undefined
                }
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {topicsLoading ? <CircularProgress color="inherit" size={18} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />

          {/* Teacher (tutor) — who actually takes this class. Any teaching staff can be
              chosen; the meeting lands on the tutor's Teams calendar and their name is
              shown in the Teams channel/chat post. Defaults to the scheduler. */}
          <Autocomplete
            options={teacherOptions}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            value={selectedTeacher}
            onChange={(_e, val) => setFormData((f) => ({ ...f, teacher_id: val?.id || '' }))}
            loading={teachersLoading}
            fullWidth
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', minHeight: 44 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {option.name}{option.isSelf ? ' (you)' : ''}
                </Typography>
                {option.email && (
                  <Typography variant="caption" color="text.secondary">{option.email}</Typography>
                )}
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Teacher (tutor)"
                placeholder="Who takes this class?"
                InputLabelProps={{ ...params.InputLabelProps, shrink: true }}
                helperText="Shows the meeting on this teacher's Teams calendar and names them in the Teams post"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {teachersLoading ? <CircularProgress color="inherit" size={18} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />


          {/* ─── Draft with AI (copy-prompt / paste-back bridge) ─── */}
          <Box
            sx={{
              border: '1px solid',
              borderColor: showAiDraft ? 'primary.main' : 'divider',
              borderRadius: 1,
              bgcolor: showAiDraft ? 'primary.50' : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <Button
              onClick={() => setShowAiDraft((v) => !v)}
              startIcon={<AutoAwesomeIcon />}
              endIcon={showAiDraft ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              sx={{ textTransform: 'none', color: 'text.secondary', minHeight: 48, width: '100%', justifyContent: 'flex-start', px: 1.5 }}
            >
              Draft Title &amp; Description with AI
            </Button>
            <Collapse in={showAiDraft}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5, pt: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  Describe the class in one line, copy the prompt into ChatGPT, Gemini or Claude, then paste the JSON it returns back here.
                </Typography>
                {aiError && <Alert severity="error" onClose={() => setAiError(null)}>{aiError}</Alert>}
                <TextField
                  label="Your class idea"
                  fullWidth
                  size="small"
                  value={aiIdea}
                  onChange={(e) => setAiIdea(e.target.value)}
                  placeholder="e.g. Isometric drawing basics for beginners"
                  inputProps={{ style: { minHeight: 24 } }}
                />
                <Button
                  variant="outlined"
                  onClick={handleCopyAiPrompt}
                  startIcon={aiPromptCopied ? <CheckIcon /> : <ContentCopyIcon />}
                  color={aiPromptCopied ? 'success' : 'primary'}
                  sx={{ minHeight: 48, textTransform: 'none', alignSelf: 'flex-start' }}
                >
                  {aiPromptCopied ? 'Prompt copied!' : 'Copy AI prompt'}
                </Button>
                <TextField
                  label="Paste AI result (JSON)"
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={6}
                  value={aiPaste}
                  onChange={(e) => setAiPaste(e.target.value)}
                  placeholder='{ "title": "...", "description": "..." }'
                />
                <Button
                  variant="contained"
                  onClick={handleApplyAiDraft}
                  disabled={!aiPaste.trim()}
                  sx={{ minHeight: 48, textTransform: 'none', alignSelf: 'flex-start' }}
                >
                  Apply to Title &amp; Description
                </Button>
              </Box>
            </Collapse>
          </Box>

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
          disabled={submitting || !formData.title || !formData.scheduled_date || formData.classroom_ids.length === 0}
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
