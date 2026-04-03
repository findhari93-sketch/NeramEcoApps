'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Switch,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Skeleton,
  Card,
  CardContent,
  Chip,
  useMediaQuery,
  useTheme,
  Snackbar,
  Alert,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface DrillQuestion {
  id: string;
  question_text: string;
  answer_text: string;
  explanation?: string | null;
  frequency_note?: string | null;
  sort_order: number;
  is_active: boolean;
}

interface DrillEditForm {
  question_text: string;
  answer_text: string;
  explanation: string;
  frequency_note: string;
}

const EMPTY_FORM: DrillEditForm = {
  question_text: '',
  answer_text: '',
  explanation: '',
  frequency_note: '',
};

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

export default function DrillManagerTable({ planId }: { planId: string }) {
  const { getToken } = useNexusAuthContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [drills, setDrills] = useState<DrillQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DrillEditForm>(EMPTY_FORM);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchDrills = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/course-plans/${planId}/drill`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDrills(data.drills || []);
      }
    } catch (err) {
      console.error('Failed to load drills:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    fetchDrills();
  }, [fetchDrills]);

  const handleToggleActive = async (drill: DrillQuestion) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/course-plans/${planId}/drill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ drill_id: drill.id, is_active: !drill.is_active }),
      });
      if (res.ok) {
        setDrills((prev) =>
          prev.map((d) => (d.id === drill.id ? { ...d, is_active: !d.is_active } : d))
        );
      } else {
        setSnackbar({ open: true, message: 'Failed to toggle', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to toggle active', severity: 'error' });
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (drill: DrillQuestion) => {
    setEditingId(drill.id);
    setForm({
      question_text: drill.question_text,
      answer_text: drill.answer_text,
      explanation: drill.explanation || '',
      frequency_note: drill.frequency_note || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.question_text.trim() || !form.answer_text.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const body: Record<string, unknown> = {
        question_text: form.question_text.trim(),
        answer_text: form.answer_text.trim(),
        explanation: form.explanation.trim() || null,
        frequency_note: form.frequency_note.trim() || null,
      };

      if (editingId) {
        body.drill_id = editingId;
      } else {
        body.sort_order = drills.length + 1;
      }

      const res = await fetch(`/api/course-plans/${planId}/drill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setSnackbar({ open: true, message: editingId ? 'Question updated' : 'Question added', severity: 'success' });
        setDialogOpen(false);
        fetchDrills();
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Failed to save', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to save question', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={isMobile ? 120 : 52} sx={{ mb: 1.5, borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Drill Questions ({drills.length})
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={openCreate}
          sx={{ textTransform: 'none', minHeight: 40 }}
        >
          Add Question
        </Button>
      </Box>

      {drills.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">
            No drill questions yet. Add your first question to get started.
          </Typography>
        </Box>
      )}

      {/* Mobile: Card Layout */}
      {isMobile && drills.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {drills.map((drill) => (
            <Card
              key={drill.id}
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                opacity: drill.is_active ? 1 : 0.6,
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Chip label={`#${drill.sort_order}`} size="small" variant="outlined" sx={{ fontWeight: 700, fontSize: '0.7rem', height: 22 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Switch
                      size="small"
                      checked={drill.is_active}
                      onChange={() => handleToggleActive(drill)}
                    />
                    <IconButton size="small" onClick={() => openEdit(drill)} sx={{ width: 36, height: 36 }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {drill.question_text}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {drill.answer_text}
                </Typography>
                {drill.frequency_note && (
                  <Typography variant="caption" color="primary">
                    {drill.frequency_note}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* Desktop: Table Layout */}
      {!isMobile && drills.length > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: 40 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Question</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Answer</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Frequency</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 70 }} align="center">Active</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 60 }} align="center">Edit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {drills.map((drill) => (
                <TableRow
                  key={drill.id}
                  sx={{
                    opacity: drill.is_active ? 1 : 0.5,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <TableCell>{drill.sort_order}</TableCell>
                  <TableCell>{truncate(drill.question_text, 50)}</TableCell>
                  <TableCell>{truncate(drill.answer_text, 30)}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {drill.frequency_note || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={drill.is_active}
                      onChange={() => handleToggleActive(drill)}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" onClick={() => openEdit(drill)} sx={{ width: 36, height: 36 }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Edit / Create Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingId ? 'Edit Drill Question' : 'Add Drill Question'}
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            label="Question"
            value={form.question_text}
            onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
            fullWidth
            multiline
            minRows={2}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label="Answer"
            value={form.answer_text}
            onChange={(e) => setForm((f) => ({ ...f, answer_text: e.target.value }))}
            fullWidth
            multiline
            minRows={2}
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label="Explanation (optional)"
            value={form.explanation}
            onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
            fullWidth
            multiline
            minRows={2}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Frequency Note (optional)"
            value={form.frequency_note}
            onChange={(e) => setForm((f) => ({ ...f, frequency_note: e.target.value }))}
            fullWidth
            placeholder="e.g. 4+ sessions"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !form.question_text.trim() || !form.answer_text.trim()}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
