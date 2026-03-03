'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Alert,
  Snackbar,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DataTable from '@/components/DataTable';

interface OnboardingQuestion {
  id: string;
  question_key: string;
  question_text: string;
  question_text_ta: string | null;
  question_type: 'single_select' | 'multi_select' | 'scale';
  options: any;
  display_order: number;
  is_active: boolean;
  is_required: boolean;
  maps_to_field: string | null;
  created_at: string;
  updated_at: string;
}

const QUESTION_TYPES = [
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
  { value: 'scale', label: 'Scale' },
];

const emptyForm: {
  question_key: string;
  question_text: string;
  question_text_ta: string;
  question_type: 'single_select' | 'multi_select' | 'scale';
  options: string;
  display_order: number;
  is_active: boolean;
  is_required: boolean;
  maps_to_field: string;
} = {
  question_key: '',
  question_text: '',
  question_text_ta: '',
  question_type: 'single_select',
  options: '',
  display_order: 0,
  is_active: true,
  is_required: true,
  maps_to_field: '',
};

export default function OnboardingPage() {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<OnboardingQuestion | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchQuestions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/onboarding/questions');
      const json = await res.json();
      setQuestions(json.data || []);
    } catch (error) {
      console.error('Error fetching questions:', error);
      setSnackbar({ open: true, message: 'Failed to load questions', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleOpenDialog = (question?: OnboardingQuestion) => {
    if (question) {
      setEditingQuestion(question);
      setForm({
        question_key: question.question_key,
        question_text: question.question_text,
        question_text_ta: question.question_text_ta || '',
        question_type: question.question_type,
        options: JSON.stringify(question.options, null, 2),
        display_order: question.display_order,
        is_active: question.is_active,
        is_required: question.is_required,
        maps_to_field: question.maps_to_field || '',
      });
    } else {
      setEditingQuestion(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingQuestion(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      let parsedOptions;
      try {
        parsedOptions = form.options ? JSON.parse(form.options) : [];
      } catch {
        setSnackbar({ open: true, message: 'Invalid JSON in options field', severity: 'error' });
        setSaving(false);
        return;
      }

      const payload = {
        question_key: form.question_key,
        question_text: form.question_text,
        question_text_ta: form.question_text_ta || null,
        question_type: form.question_type,
        options: parsedOptions,
        display_order: Number(form.display_order),
        is_active: form.is_active,
        is_required: form.is_required,
        maps_to_field: form.maps_to_field || null,
      };

      if (editingQuestion) {
        const res = await fetch(`/api/onboarding/questions/${editingQuestion.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update');
        setSnackbar({ open: true, message: 'Question updated successfully', severity: 'success' });
      } else {
        const res = await fetch('/api/onboarding/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create');
        setSnackbar({ open: true, message: 'Question created successfully', severity: 'success' });
      }

      handleCloseDialog();
      fetchQuestions();
    } catch (error) {
      console.error('Error saving question:', error);
      setSnackbar({ open: true, message: 'Failed to save question', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;

    try {
      const res = await fetch(`/api/onboarding/questions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setSnackbar({ open: true, message: 'Question deleted successfully', severity: 'success' });
      fetchQuestions();
    } catch (error) {
      console.error('Error deleting question:', error);
      setSnackbar({ open: true, message: 'Failed to delete question', severity: 'error' });
    }
  };

  const columns = [
    { field: 'display_order', headerName: 'Order', width: 80 },
    { field: 'question_key', headerName: 'Key', width: 160 },
    { field: 'question_text', headerName: 'Question', width: 280 },
    {
      field: 'question_type',
      headerName: 'Type',
      width: 140,
      renderCell: (params: any) => (
        <Chip
          label={params.value}
          size="small"
          color={
            params.value === 'single_select'
              ? 'primary'
              : params.value === 'multi_select'
              ? 'secondary'
              : 'default'
          }
          variant="outlined"
        />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Active',
      width: 100,
      renderCell: (params: any) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          color={params.value ? 'success' : 'default'}
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDialog(params.row);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(params.row.id);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Onboarding Questions
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage post-login questionnaire
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Question
        </Button>
      </Box>

      <DataTable rows={questions} columns={columns} loading={loading} />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingQuestion ? 'Edit Question' : 'Add Question'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Question Key"
              value={form.question_key}
              onChange={(e) => setForm({ ...form, question_key: e.target.value })}
              fullWidth
              required
              placeholder="e.g., exam_interest"
            />
            <TextField
              label="Question Text (English)"
              value={form.question_text}
              onChange={(e) => setForm({ ...form, question_text: e.target.value })}
              fullWidth
              required
              multiline
              rows={2}
            />
            <TextField
              label="Question Text (Tamil)"
              value={form.question_text_ta}
              onChange={(e) => setForm({ ...form, question_text_ta: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              select
              label="Question Type"
              value={form.question_type}
              onChange={(e) => setForm({ ...form, question_type: e.target.value as any })}
              fullWidth
              required
            >
              {QUESTION_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Options (JSON)"
              value={form.options}
              onChange={(e) => setForm({ ...form, options: e.target.value })}
              fullWidth
              multiline
              rows={4}
              placeholder='[{"value": "nata", "label": "NATA", "icon": "pencil"}]'
              helperText="For single/multi select: array of {value, label}. For scale: {min, max, min_label, max_label}"
            />
            <TextField
              label="Display Order"
              type="number"
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
              fullWidth
            />
            <TextField
              label="Maps to Field"
              value={form.maps_to_field}
              onChange={(e) => setForm({ ...form, maps_to_field: e.target.value })}
              fullWidth
              placeholder="e.g., interest_course"
              helperText="Application form field this maps to for pre-fill"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
              }
              label="Active"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_required}
                  onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                />
              }
              label="Required"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !form.question_key || !form.question_text}
          >
            {saving ? 'Saving...' : editingQuestion ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
