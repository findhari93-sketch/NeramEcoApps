'use client';

/**
 * The exam date registry, and the one place the official date lands.
 *
 * Since 20260804090000 this screen drives the "days left" countdown on the
 * student, parent and teacher dashboards, so three things it used to lack are
 * now load-bearing:
 *
 *   * A YEAR SELECTOR. It hard-coded new Date().getFullYear() on both the POST
 *     body and the list filter, so a JEE 2027 row was neither creatable nor
 *     visible. A plan running in July 2026 targets a session in January 2027.
 *   * An EDIT action. It had Add and Delete only, which made "replace the guess
 *     with the official date once it is announced" impossible without SQL.
 *   * A CONFIDENCE toggle, so a date we guessed can say so and every countdown
 *     hedges until an admin confirms it.
 */

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
  Alert,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { EXAM_TYPE_LABELS, PHASE_LABELS, PHASE_OPTIONS } from '@/lib/exam-countdown';

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
  date_confidence: string | null;
  date_note: string | null;
  created_at: string;
}

/** Only the exams this registry tracks. Foundation and custom plans use their own date. */
const REGISTRY_EXAM_TYPES = ['nata', 'jee'] as const;

export default function ExamDateManager() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken, can } = useNexusAuthContext();
  const [dates, setDates] = useState<ExamDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentYear = new Date().getFullYear();
  const YEAR_OPTIONS = [currentYear, currentYear + 1, currentYear + 2];

  /** Which year the list shows. Separate from the year being edited in the form. */
  const [listYear, setListYear] = useState(currentYear);

  // Form state. editingId null means "creating".
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formExamType, setFormExamType] = useState('nata');
  const [formYear, setFormYear] = useState(currentYear);
  const [formPhase, setFormPhase] = useState('phase_1');
  const [formAttempt, setFormAttempt] = useState(1);
  const [formDate, setFormDate] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formConfidence, setFormConfidence] = useState('expected');
  const [formNote, setFormNote] = useState('');

  // Publishing an official date is admin only, matching the API gate.
  const canConfirm = can('system.settings');

  const fetchDates = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/documents/exam-dates?year=${listYear}`, {
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
  }, [getToken, listYear]);

  useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormExamType('nata');
    setFormYear(listYear);
    setFormPhase('phase_1');
    setFormAttempt(1);
    setFormDate('');
    setFormLabel('');
    setFormDeadline('');
    // A date being typed in now is a guess until someone says otherwise.
    setFormConfidence('expected');
    setFormNote('');
    setMessage(null);
    setDrawerOpen(true);
  };

  const handleOpenEdit = (d: ExamDate) => {
    setEditingId(d.id);
    setFormExamType(d.exam_type);
    setFormYear(d.year);
    setFormPhase(d.phase);
    setFormAttempt(d.attempt_number);
    setFormDate(d.exam_date);
    setFormLabel(d.label || '');
    setFormDeadline(d.registration_deadline || '');
    setFormConfidence(d.date_confidence === 'confirmed' ? 'confirmed' : 'expected');
    setFormNote(d.date_note || '');
    setMessage(null);
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    if (!formDate) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const token = await getToken();
      if (!token) return;

      const payload = {
        exam_type: formExamType,
        year: formYear,
        phase: formPhase,
        attempt_number: formAttempt,
        exam_date: formDate,
        label: formLabel || null,
        registration_deadline: formDeadline || null,
        date_confidence: formConfidence,
        date_note: formConfidence === 'expected' ? formNote || null : null,
      };

      const res = await fetch(
        editingId ? `/api/documents/exam-dates/${editingId}` : '/api/documents/exam-dates',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        setDrawerOpen(false);
        // Jump the list to the year just saved, so the row does not vanish.
        if (formYear !== listYear) setListYear(formYear);
        else fetchDates();
        setMessage({
          type: 'success',
          text: editingId ? 'Exam date updated.' : 'Exam date added.',
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.error || 'Could not save the exam date.' });
      }
    } catch (err) {
      console.error('Failed to save exam date:', err);
      setMessage({ type: 'error', text: 'Could not save the exam date.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/documents/exam-dates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: err.error || 'Could not remove the exam date.' });
        return;
      }
      fetchDates();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // When exam type changes, reset phase to the first valid option for that exam.
  const handleExamTypeChange = (newType: string) => {
    setFormExamType(newType);
    const phases = PHASE_OPTIONS[newType];
    if (phases && phases.length > 0) setFormPhase(phases[0].value);
  };

  const groupedDates = dates.reduce<Record<string, ExamDate[]>>((acc, d) => {
    if (!acc[d.exam_type]) acc[d.exam_type] = [];
    acc[d.exam_type].push(d);
    return acc;
  }, {});

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
          {editingId ? 'Edit Exam Date' : 'Add Exam Date'}
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
          {REGISTRY_EXAM_TYPES.map((t) => (
            <MenuItem key={t} value={t}>
              {EXAM_TYPE_LABELS[t]}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth size="small">
        <InputLabel>Exam Year</InputLabel>
        <Select
          value={formYear}
          label="Exam Year"
          onChange={(e) => setFormYear(Number(e.target.value))}
        >
          {YEAR_OPTIONS.map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
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

      <FormControl fullWidth size="small">
        <InputLabel>Date confidence</InputLabel>
        <Select
          value={formConfidence}
          label="Date confidence"
          onChange={(e) => setFormConfidence(e.target.value)}
        >
          <MenuItem value="expected">Expected (our own estimate)</MenuItem>
          <MenuItem value="confirmed" disabled={!canConfirm}>
            Confirmed (officially announced)
          </MenuItem>
        </Select>
      </FormControl>

      {formConfidence === 'expected' ? (
        <TextField
          label="Why this date"
          size="small"
          fullWidth
          multiline
          minRows={2}
          value={formNote}
          onChange={(e) => setFormNote(e.target.value)}
          placeholder="NTA has not announced Session 1 yet. For the last three years it has fallen in the third week of January."
          helperText="Shown to students and parents under the countdown. One true sentence."
        />
      ) : (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Countdowns will show this as an exact date and a precise day count.
        </Alert>
      )}

      {!canConfirm && (
        <Typography variant="caption" color="text.secondary">
          Only an admin can mark a date as officially confirmed.
        </Typography>
      )}

      <TextField
        label="Label (optional)"
        size="small"
        fullWidth
        value={formLabel}
        onChange={(e) => setFormLabel(e.target.value)}
        placeholder="e.g. JEE Main 2027 Session 1, Paper 2A (B.Arch)"
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
        {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Exam Date'}
      </Button>
    </Box>
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            Exam Dates
          </Typography>
          <FormControl size="small" sx={{ minWidth: 96 }}>
            <Select
              value={listYear}
              onChange={(e) => setListYear(Number(e.target.value))}
              aria-label="Exam year"
            >
              {YEAR_OPTIONS.map((y) => (
                <MenuItem key={y} value={y}>
                  {y}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ textTransform: 'none', minHeight: 40 }}
        >
          Add Date
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Changing a date here updates the countdown for every student, parent and teacher at once.
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : dates.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <CalendarMonthOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No exam dates for {listYear} yet.</Typography>
          <Typography variant="caption" color="text.disabled">
            Add the NATA or JEE date so students can see how long they have left.
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
                {items.map((d) => {
                  const isEstimate = d.date_confidence === 'expected';
                  return (
                    <Paper
                      key={d.id}
                      variant="outlined"
                      sx={{
                        p: { xs: 1.5, sm: 2 },
                        display: 'flex',
                        alignItems: 'center',
                        gap: { xs: 0.5, sm: 1 },
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            mb: 0.5,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Typography variant="body2" fontWeight={700}>
                            {d.label ||
                              `${EXAM_TYPE_LABELS[d.exam_type]} ${PHASE_LABELS[d.phase]} - Attempt ${d.attempt_number}`}
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
                          {isEstimate && (
                            <Chip
                              label="Expected date"
                              size="small"
                              variant="outlined"
                              color="warning"
                              sx={{ height: 22, fontSize: '0.65rem' }}
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(d.exam_date).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                          {d.registration_deadline && (
                            <>
                              {' '}
                              &middot; Reg. deadline:{' '}
                              {new Date(d.registration_deadline).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </>
                          )}
                        </Typography>
                        {isEstimate && d.date_note && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}
                          >
                            {d.date_note}
                          </Typography>
                        )}
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleOpenEdit(d)}
                        aria-label="Edit exam date"
                        sx={{ minWidth: 48, minHeight: 48 }}
                      >
                        <EditOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(d.id)}
                        aria-label="Remove exam date"
                        sx={{ minWidth: 48, minHeight: 48 }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                      </IconButton>
                    </Paper>
                  );
                })}
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
            overflowY: 'auto',
          },
        }}
      >
        {formContent}
      </Drawer>
    </Box>
  );
}
