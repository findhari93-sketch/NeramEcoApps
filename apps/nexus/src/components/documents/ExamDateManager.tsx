'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Skeleton,
  IconButton,
  Chip,
  Drawer,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface ExamDate {
  id: string;
  exam_type: string;
  year: number;
  phase: string;
  attempt_number: number;
  exam_date: string;
  label: string | null;
  registration_deadline: string | null;
  is_active: boolean;
  created_at: string;
}

const PHASE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  nata: [
    { value: 'phase_1', label: 'Phase 1' },
    { value: 'phase_2', label: 'Phase 2' },
  ],
  jee: [
    { value: 'session_1', label: 'Session 1' },
    { value: 'session_2', label: 'Session 2' },
  ],
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee: 'JEE',
};

const PHASE_LABELS: Record<string, string> = {
  phase_1: 'Phase 1',
  phase_2: 'Phase 2',
  session_1: 'Session 1',
  session_2: 'Session 2',
};

export default function ExamDateManager() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();
  const [dates, setDates] = useState<ExamDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formExamType, setFormExamType] = useState('nata');
  const [formPhase, setFormPhase] = useState('phase_1');
  const [formAttempt, setFormAttempt] = useState(1);
  const [formDate, setFormDate] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formDeadline, setFormDeadline] = useState('');

  const currentYear = new Date().getFullYear();

  const fetchDates = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/documents/exam-dates?year=${currentYear}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDates(data.exam_dates || []);
      }
    } catch (err) {
      console.error('Failed to load exam dates:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, currentYear]);

  useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  const resetForm = () => {
    setFormExamType('nata');
    setFormPhase('phase_1');
    setFormAttempt(1);
    setFormDate('');
    setFormLabel('');
    setFormDeadline('');
  };

  const handleOpen = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!formDate) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/documents/exam-dates', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exam_type: formExamType,
          year: currentYear,
          phase: formPhase,
          attempt_number: formAttempt,
          exam_date: formDate,
          label: formLabel || null,
          registration_deadline: formDeadline || null,
        }),
      });
      if (res.ok) {
        setDrawerOpen(false);
        fetchDates();
      }
    } catch (err) {
      console.error('Failed to create exam date:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/documents/exam-dates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchDates();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // When exam type changes, reset phase to first option
  const handleExamTypeChange = (newType: string) => {
    setFormExamType(newType);
    const phases = PHASE_OPTIONS[newType];
    if (phases && phases.length > 0) {
      setFormPhase(phases[0].value);
    }
  };

  // Group dates by exam type
  const groupedDates = dates.reduce<Record<string, ExamDate[]>>((acc, d) => {
    const key = d.exam_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[1, 2].map((i) => (
          <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  const formContent = (
    <Box
      sx={{
        p: { xs: 2, sm: 3 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: isMobile ? '100%' : 400,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" fontWeight={700}>
          Add Exam Date
        </Typography>
        <IconButton onClick={() => setDrawerOpen(false)} sx={{ minWidth: 48, minHeight: 48 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <FormControl fullWidth size="small">
        <InputLabel>Exam Type</InputLabel>
        <Select
          value={formExamType}
          label="Exam Type"
          onChange={(e) => handleExamTypeChange(e.target.value)}
        >
          <MenuItem value="nata">NATA</MenuItem>
          <MenuItem value="jee">JEE</MenuItem>
        </Select>
      </FormControl>

      <FormControl fullWidth size="small">
        <InputLabel>Phase / Session</InputLabel>
        <Select
          value={formPhase}
          label="Phase / Session"
          onChange={(e) => setFormPhase(e.target.value)}
        >
          {(PHASE_OPTIONS[formExamType] || []).map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth size="small">
        <InputLabel>Attempt</InputLabel>
        <Select
          value={formAttempt}
          label="Attempt"
          onChange={(e) => setFormAttempt(Number(e.target.value))}
        >
          <MenuItem value={1}>Attempt 1</MenuItem>
          <MenuItem value={2}>Attempt 2</MenuItem>
        </Select>
      </FormControl>

      <TextField
        label="Exam Date"
        type="date"
        size="small"
        fullWidth
        value={formDate}
        onChange={(e) => setFormDate(e.target.value)}
        InputLabelProps={{ shrink: true }}
        required
      />

      <TextField
        label="Label (optional)"
        size="small"
        fullWidth
        value={formLabel}
        onChange={(e) => setFormLabel(e.target.value)}
        placeholder="e.g. NATA Phase 1 - April 2026"
      />

      <TextField
        label="Registration Deadline (optional)"
        type="date"
        size="small"
        fullWidth
        value={formDeadline}
        onChange={(e) => setFormDeadline(e.target.value)}
        InputLabelProps={{ shrink: true }}
      />

      <Button
        variant="contained"
        onClick={handleSubmit}
        disabled={!formDate || submitting}
        sx={{ mt: 1, minHeight: 48, textTransform: 'none', fontWeight: 600 }}
      >
        {submitting ? 'Adding...' : 'Add Exam Date'}
      </Button>
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Exam Dates ({currentYear})
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleOpen}
          sx={{ textTransform: 'none', minHeight: 40 }}
        >
          Add Date
        </Button>
      </Box>

      {dates.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CalendarMonthOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No exam dates configured yet.</Typography>
          <Typography variant="caption" color="text.disabled">
            Add official NATA/JEE exam dates so students can track their progress.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {Object.entries(groupedDates).map(([examType, items]) => (
            <Box key={examType}>
              <Typography
                variant="overline"
                sx={{ mb: 1, display: 'block', fontWeight: 700, color: 'text.secondary' }}
              >
                {EXAM_TYPE_LABELS[examType] || examType.toUpperCase()}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {items.map((d) => (
                  <Paper
                    key={d.id}
                    variant="outlined"
                    sx={{
                      p: { xs: 1.5, sm: 2 },
                      display: 'flex',
                      alignItems: 'center',
                      gap: { xs: 1, sm: 2 },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                        <Typography variant="body2" fontWeight={700}>
                          {d.label || `${EXAM_TYPE_LABELS[d.exam_type]} ${PHASE_LABELS[d.phase]} - Attempt ${d.attempt_number}`}
                        </Typography>
                        <Chip
                          label={PHASE_LABELS[d.phase] || d.phase}
                          size="small"
                          sx={{
                            height: 22,
                            fontSize: '0.65rem',
                            bgcolor: alpha(theme.palette.primary.main, 0.08),
                          }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(d.exam_date).toLocaleDateString('en-IN', {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                        {d.registration_deadline && (
                          <> &middot; Reg. deadline: {new Date(d.registration_deadline).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                          })}</>
                        )}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(d.id)}
                      sx={{ minWidth: 48, minHeight: 48 }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                  </Paper>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Drawer
        anchor={isMobile ? 'bottom' : 'right'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: isMobile ? 16 : 0,
            borderTopRightRadius: isMobile ? 16 : 0,
            maxHeight: isMobile ? '90vh' : '100vh',
          },
        }}
      >
        {formContent}
      </Drawer>
    </Box>
  );
}
