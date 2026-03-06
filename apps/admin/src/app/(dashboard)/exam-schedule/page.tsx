'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Grid,
  Card,
  CardContent,
  IconButton,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import EventIcon from '@mui/icons-material/Event';
import type { ExamSchedule, ExamScheduleSession } from '@neram/database';

const EXAM_TYPES = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
];

function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

interface SessionRow {
  label: string;
  date: string;
  day: string;
}

export default function ExamSchedulePage() {
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [examType, setExamType] = useState('nata');
  const [examYear, setExamYear] = useState(new Date().getFullYear());
  const [isActive, setIsActive] = useState(true);
  const [regOpenDate, setRegOpenDate] = useState('');
  const [regCloseDate, setRegCloseDate] = useState('');
  const [lateRegCloseDate, setLateRegCloseDate] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([
    { label: 'Session 1', date: '', day: '' },
  ]);
  const [brochureUrl, setBrochureUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/exam-schedule');
      const json = await res.json();
      setSchedules(json.data || []);
    } catch {
      setError('Failed to fetch schedules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const resetForm = () => {
    setExamType('nata');
    setExamYear(new Date().getFullYear());
    setIsActive(true);
    setRegOpenDate('');
    setRegCloseDate('');
    setLateRegCloseDate('');
    setSessions([{ label: 'Session 1', date: '', day: '' }]);
    setBrochureUrl('');
    setNotes('');
    setEditingId(null);
  };

  const loadSchedule = (schedule: ExamSchedule) => {
    setExamType(schedule.exam_type);
    setExamYear(schedule.exam_year);
    setIsActive(schedule.is_active);
    setRegOpenDate(schedule.registration_open_date || '');
    setRegCloseDate(schedule.registration_close_date || '');
    setLateRegCloseDate(schedule.late_registration_close_date || '');
    setSessions(
      schedule.sessions.length > 0
        ? schedule.sessions.map((s) => ({ ...s }))
        : [{ label: 'Session 1', date: '', day: '' }]
    );
    setBrochureUrl(schedule.brochure_url || '');
    setNotes(schedule.notes || '');
    setEditingId(schedule.id);
  };

  const addSession = () => {
    setSessions((prev) => [
      ...prev,
      { label: `Session ${prev.length + 1}`, date: '', day: '' },
    ]);
  };

  const removeSession = (index: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSession = (index: number, field: keyof SessionRow, value: string) => {
    setSessions((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, [field]: value };
        if (field === 'date') {
          updated.day = getDayOfWeek(value);
        }
        return updated;
      })
    );
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    if (!examType || !examYear) {
      setError('Exam type and year are required');
      return;
    }

    const validSessions = sessions.filter((s) => s.date);
    if (validSessions.length === 0) {
      setError('At least one session with a date is required');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/exam-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_type: examType,
          exam_year: examYear,
          is_active: isActive,
          registration_open_date: regOpenDate || undefined,
          registration_close_date: regCloseDate || undefined,
          late_registration_close_date: lateRegCloseDate || undefined,
          sessions: validSessions,
          brochure_url: brochureUrl || undefined,
          notes: notes || undefined,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to save');
      }

      setSuccess(editingId ? 'Schedule updated successfully' : 'Schedule created successfully');
      resetForm();
      fetchSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Exam Schedule</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage exam dates and registration windows from CoA brochure
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Form */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {editingId ? 'Edit Schedule' : 'Create Schedule'}
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Exam Type</InputLabel>
                  <Select
                    value={examType}
                    label="Exam Type"
                    onChange={(e) => setExamType(e.target.value)}
                  >
                    {EXAM_TYPES.map((t) => (
                      <MenuItem key={t.value} value={t.value}>
                        {t.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Year"
                  type="number"
                  value={examYear}
                  onChange={(e) => setExamYear(Number(e.target.value))}
                />
              </Grid>
              <Grid item xs={3}>
                <FormControlLabel
                  control={
                    <Switch checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  }
                  label="Active"
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" gutterBottom>
              Registration Window
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Registration Opens"
                  type="date"
                  value={regOpenDate}
                  onChange={(e) => setRegOpenDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Registration Closes"
                  type="date"
                  value={regCloseDate}
                  onChange={(e) => setRegCloseDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  size="small"
                  label="Late Registration Closes"
                  type="date"
                  value={lateRegCloseDate}
                  onChange={(e) => setLateRegCloseDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">Exam Sessions</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addSession}>
                Add Session
              </Button>
            </Box>

            {sessions.map((session, index) => (
              <Grid container spacing={2} key={index} sx={{ mb: 1 }}>
                <Grid item xs={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Label"
                    value={session.label}
                    onChange={(e) => updateSession(index, 'label', e.target.value)}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Date"
                    type="date"
                    value={session.date}
                    onChange={(e) => updateSession(index, 'date', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Day"
                    value={session.day}
                    disabled
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={2} sx={{ display: 'flex', alignItems: 'center' }}>
                  {sessions.length > 1 && (
                    <IconButton size="small" color="error" onClick={() => removeSession(index)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Grid>
              </Grid>
            ))}

            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Brochure URL"
                  value={brochureUrl}
                  onChange={(e) => setBrochureUrl(e.target.value)}
                  placeholder="https://nata.in/brochure-2026.pdf"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes..."
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                {editingId ? 'Update Schedule' : 'Save Schedule'}
              </Button>
              {editingId && (
                <Button variant="outlined" onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Existing Schedules */}
        <Grid item xs={12} md={4}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Existing Schedules
          </Typography>
          {schedules.length === 0 ? (
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No schedules yet. Create the first one.
              </Typography>
            </Paper>
          ) : (
            schedules.map((schedule) => (
              <Card
                key={schedule.id}
                sx={{
                  mb: 1,
                  cursor: 'pointer',
                  border: editingId === schedule.id ? '2px solid' : undefined,
                  borderColor: editingId === schedule.id ? 'primary.main' : undefined,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => loadSchedule(schedule)}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EventIcon fontSize="small" color="primary" />
                      <Typography variant="subtitle2">
                        {EXAM_TYPES.find((t) => t.value === schedule.exam_type)?.label || schedule.exam_type}{' '}
                        {schedule.exam_year}
                      </Typography>
                    </Box>
                    <Chip
                      label={schedule.is_active ? 'Active' : 'Inactive'}
                      size="small"
                      color={schedule.is_active ? 'success' : 'default'}
                    />
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {schedule.sessions.length} session{schedule.sessions.length !== 1 ? 's' : ''}
                    {schedule.registration_close_date &&
                      ` · Reg closes ${schedule.registration_close_date}`}
                  </Typography>
                </CardContent>
              </Card>
            ))
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
