'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Skeleton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Checkbox,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ScheduledClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string;
  teams_meeting_url: string | null;
  topic: { id: string; title: string; category: string } | null;
}

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface ClassFormData {
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  topic_id: string;
  create_teams_meeting: boolean;
}

const emptyForm: ClassFormData = {
  title: '',
  scheduled_date: '',
  start_time: '',
  end_time: '',
  topic_id: '',
  create_teams_meeting: false,
};

export default function TeacherTimetable() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [classes, setClasses] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ScheduledClass | null>(null);
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const getWeekDates = useCallback((offset: number) => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
      label: `${monday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`,
    };
  }, []);

  const fetchClasses = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const week = getWeekDates(weekOffset);
      const res = await fetch(
        `/api/timetable?classroom=${activeClassroom.id}&start=${week.start}&end=${week.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setClasses(data.classes || []);
      }
    } catch (err) {
      console.error('Failed to load timetable:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, weekOffset, getToken, getWeekDates]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Fetch topics for the dialog
  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchTopics() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/topics?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setTopics(data.topics || []);
        }
      } catch (err) {
        console.error('Failed to load topics:', err);
      }
    }

    fetchTopics();
  }, [activeClassroom, getToken]);

  const formatTime = (time: string) => {
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${m} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handleOpenAdd = () => {
    setEditingClass(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (cls: ScheduledClass) => {
    setEditingClass(cls);
    setFormData({
      title: cls.title,
      scheduled_date: cls.scheduled_date,
      start_time: cls.start_time,
      end_time: cls.end_time,
      topic_id: cls.topic?.id || '',
      create_teams_meeting: false,
    });
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingClass(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async () => {
    if (!activeClassroom) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const body = {
        ...formData,
        classroom_id: activeClassroom.id,
      };

      const url = editingClass ? `/api/timetable` : `/api/timetable`;
      const method = editingClass ? 'PATCH' : 'POST';
      const payload = editingClass ? { ...body, id: editingClass.id } : body;

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        handleClose();
        fetchClasses();
      }
    } catch (err) {
      console.error('Failed to save class:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (classId: string) => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/timetable`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: classId, classroom_id: activeClassroom.id }),
      });

      if (res.ok) {
        fetchClasses();
      }
    } catch (err) {
      console.error('Failed to cancel class:', err);
    }
  };

  const week = getWeekDates(weekOffset);

  // Group classes by date
  const classesByDate = classes.reduce<Record<string, ScheduledClass[]>>((acc, cls) => {
    if (!acc[cls.scheduled_date]) acc[cls.scheduled_date] = [];
    acc[cls.scheduled_date].push(cls);
    return acc;
  }, {});

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh' }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
        Timetable
      </Typography>

      {/* Week Navigation */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Button
          size="small"
          onClick={() => setWeekOffset((w) => w - 1)}
          sx={{ textTransform: 'none', minHeight: 48, minWidth: 48 }}
        >
          &#8592; Prev
        </Button>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {week.label}
        </Typography>
        <Button
          size="small"
          onClick={() => setWeekOffset((w) => w + 1)}
          sx={{ textTransform: 'none', minHeight: 48, minWidth: 48 }}
        >
          Next &#8594;
        </Button>
      </Box>

      {/* Classes by Day */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : Object.keys(classesByDate).length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            No classes scheduled for this week.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.entries(classesByDate)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, dayClasses]) => (
              <Box key={date}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>
                  {formatDate(date)}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {dayClasses.map((cls) => (
                    <Paper
                      key={cls.id}
                      variant="outlined"
                      sx={{
                        p: 2,
                        display: 'flex',
                        alignItems: { xs: 'flex-start', sm: 'center' },
                        flexDirection: { xs: 'column', sm: 'row' },
                        gap: 1,
                        borderLeft: '4px solid',
                        borderLeftColor:
                          cls.status === 'completed'
                            ? 'success.main'
                            : cls.status === 'live'
                              ? 'error.main'
                              : cls.status === 'cancelled'
                                ? 'text.disabled'
                                : 'primary.main',
                      }}
                    >
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {cls.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatTime(cls.start_time)} - {formatTime(cls.end_time)}
                        </Typography>
                        {cls.topic && (
                          <Chip label={cls.topic.title} size="small" sx={{ mt: 0.5 }} />
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                        <Chip
                          label={cls.status}
                          size="small"
                          color={
                            cls.status === 'completed'
                              ? 'success'
                              : cls.status === 'live'
                                ? 'error'
                                : cls.status === 'cancelled'
                                  ? 'default'
                                  : 'primary'
                          }
                          variant="outlined"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        {cls.status !== 'completed' && cls.status !== 'cancelled' && (
                          <>
                            <IconButton
                              size="small"
                              onClick={() => handleOpenEdit(cls)}
                              sx={{ minWidth: 48, minHeight: 48 }}
                              aria-label="Edit class"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDelete(cls.id)}
                              sx={{ minWidth: 48, minHeight: 48 }}
                              aria-label="Cancel class"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Box>
            ))}
        </Box>
      )}

      {/* Add Class FAB */}
      <Fab
        color="primary"
        aria-label="Add class"
        onClick={handleOpenAdd}
        sx={{
          position: 'fixed',
          bottom: { xs: 80, md: 24 },
          right: { xs: 16, md: 24 },
          width: 56,
          height: 56,
        }}
      >
        <AddIcon />
      </Fab>

      {/* Add/Edit Class Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>{editingClass ? 'Edit Class' : 'Add Class'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Title"
              fullWidth
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
              inputProps={{ style: { minHeight: 24 } }}
            />
            <TextField
              label="Date"
              type="date"
              fullWidth
              value={formData.scheduled_date}
              onChange={(e) => setFormData((f) => ({ ...f, scheduled_date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Time"
                type="time"
                fullWidth
                value={formData.start_time}
                onChange={(e) => setFormData((f) => ({ ...f, start_time: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Time"
                type="time"
                fullWidth
                value={formData.end_time}
                onChange={(e) => setFormData((f) => ({ ...f, end_time: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <TextField
              label="Topic"
              select
              fullWidth
              value={formData.topic_id}
              onChange={(e) => setFormData((f) => ({ ...f, topic_id: e.target.value }))}
              SelectProps={{ native: true }}
            >
              <option value="">-- Select Topic --</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </TextField>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Checkbox
                checked={formData.create_teams_meeting}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, create_teams_meeting: e.target.checked }))
                }
                sx={{ '& .MuiSvgIcon-root': { fontSize: 28 } }}
              />
              <Typography variant="body2">Create Teams Meeting</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} sx={{ minHeight: 48 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !formData.title || !formData.scheduled_date}
            sx={{ minHeight: 48 }}
          >
            {submitting ? 'Saving...' : editingClass ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
