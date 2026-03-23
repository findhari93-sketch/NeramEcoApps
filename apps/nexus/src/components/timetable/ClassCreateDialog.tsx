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
} from '@neram/ui';
import VideocamIcon from '@mui/icons-material/Videocam';
import SchoolIcon from '@mui/icons-material/School';
import GroupsIcon from '@mui/icons-material/Groups';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
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
}

const emptyForm: ClassFormData = {
  title: '',
  scheduled_date: '',
  start_time: '',
  end_time: '',
  topic_id: '',
  target: '',
  create_meeting: false,
  description: '',
};

/** Color map for classroom types */
const typeColors: Record<string, string> = {
  common: 'warning.main',
  nata: 'primary.main',
  jee: 'secondary.main',
  revit: 'info.main',
  other: 'text.secondary',
};

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

      // If meeting toggle is on and this is a new class, create the Teams meeting
      if (!editingClass && formData.create_meeting && data.class?.id) {
        try {
          const meetingRes = await fetch('/api/timetable/teams-meeting', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              class_id: data.class.id,
              classroom_id: selectedClassroomId,
              auto: true,
            }),
          });

          if (!meetingRes.ok) {
            const meetingErr = await meetingRes.json().catch(() => ({}));
            const errMsg = meetingErr.error || 'Failed to create Teams meeting';
            console.error('Teams meeting creation failed:', errMsg);
            onMeetingError?.(errMsg);
          }
        } catch (meetingErr) {
          console.error('Teams meeting creation error:', meetingErr);
          onMeetingError?.('Failed to create Teams meeting. You can retry from the class detail panel.');
        }
      }

      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save class');
    } finally {
      setSubmitting(false);
    }
  };

  // Determine if the selected classroom has a linked Teams team
  const selectedHasTeam = !!selectedClassroom?.ms_team_id;

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
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Start Time *"
              type="time"
              fullWidth
              value={formData.start_time}
              onChange={(e) => setFormData((f) => ({ ...f, start_time: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Time *"
              type="time"
              fullWidth
              value={formData.end_time}
              onChange={(e) => setFormData((f) => ({ ...f, end_time: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
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

          {/* Create Teams Meeting toggle */}
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
