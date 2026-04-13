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
import SmartToyIcon from '@mui/icons-material/SmartToy';
import DataTable from '@/components/DataTable';

// ============================================
// Types
// ============================================

interface KBItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  'Courses',
  'Fees',
  'Admissions',
  'NATA Exam',
  'Class Timings',
  'Demo Classes',
  'General',
];

// ============================================
// Main Page
// ============================================

export default function AintraKBPage() {
  const [items, setItems] = useState<KBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KBItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<KBItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // Form state
  const [formQuestion, setFormQuestion] = useState('');
  const [formAnswer, setFormAnswer] = useState('');
  const [formCategory, setFormCategory] = useState('General');
  const [formOrder, setFormOrder] = useState(0);
  const [formActive, setFormActive] = useState(true);

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/aintra/kb');
      const json = await res.json();
      setItems(json.data || []);
    } catch {
      showSnackbar('Failed to load knowledge base', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openCreate = () => {
    setEditingItem(null);
    setFormQuestion('');
    setFormAnswer('');
    setFormCategory('General');
    setFormOrder(0);
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (item: KBItem) => {
    setEditingItem(item);
    setFormQuestion(item.question);
    setFormAnswer(item.answer);
    setFormCategory(item.category);
    setFormOrder(item.display_order);
    setFormActive(item.is_active);
    setDialogOpen(true);
  };

  const openDelete = (item: KBItem) => {
    setDeletingItem(item);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formQuestion.trim() || !formAnswer.trim()) {
      showSnackbar('Question and answer are required', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        question: formQuestion.trim(),
        answer: formAnswer.trim(),
        category: formCategory,
        display_order: formOrder,
        is_active: formActive,
      };

      const url = editingItem ? `/api/aintra/kb/${editingItem.id}` : '/api/aintra/kb';
      const method = editingItem ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Save failed');
      }

      showSnackbar(editingItem ? 'Q&A updated' : 'Q&A created', 'success');
      setDialogOpen(false);
      fetchItems();
    } catch (err) {
      showSnackbar(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/aintra/kb/${deletingItem.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showSnackbar('Q&A deleted', 'success');
      setDeleteDialogOpen(false);
      setDeletingItem(null);
      fetchItems();
    } catch {
      showSnackbar('Delete failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: KBItem) => {
    try {
      const res = await fetch(`/api/aintra/kb/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !item.is_active }),
      });
      if (!res.ok) throw new Error('Update failed');
      fetchItems();
    } catch {
      showSnackbar('Failed to toggle status', 'error');
    }
  };

  const columns = [
    {
      field: 'question',
      headerName: 'Question',
      flex: 2,
      renderCell: (params: any) => (
        <Typography variant="body2" sx={{ py: 1, lineHeight: 1.4 }}>
          {params.value.length > 80 ? `${params.value.slice(0, 80)}…` : params.value}
        </Typography>
      ),
    },
    {
      field: 'answer',
      headerName: 'Answer',
      flex: 3,
      renderCell: (params: any) => (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1, lineHeight: 1.4 }}>
          {params.value.length > 100 ? `${params.value.slice(0, 100)}…` : params.value}
        </Typography>
      ),
    },
    {
      field: 'category',
      headerName: 'Category',
      width: 140,
      renderCell: (params: any) => (
        <Chip label={params.value} size="small" variant="outlined" color="primary" />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: (params: any) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          color={params.value ? 'success' : 'default'}
          onClick={() => handleToggleActive(params.row)}
          sx={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      field: 'display_order',
      headerName: 'Order',
      width: 80,
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 100,
      sortable: false,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={() => openEdit(params.row)} title="Edit">
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" color="error" onClick={() => openDelete(params.row)} title="Delete">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SmartToyIcon color="primary" />
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Aintra Training
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage Q&A pairs that train Aintra. Changes take effect within 5 minutes.
            </Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add Q&amp;A
        </Button>
      </Box>

      {/* Info banner */}
      <Alert severity="info" sx={{ mb: 3 }}>
        These Q&amp;A pairs are dynamically injected into Aintra's AI prompt. Add accurate information about
        courses, fees, timings, and policies here. Aintra will use this knowledge to answer student queries.
      </Alert>

      {/* Table */}
      <DataTable
        rows={items}
        columns={columns}
        loading={loading}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingItem ? 'Edit Q&A' : 'Add Q&A'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField
            label="Question"
            value={formQuestion}
            onChange={(e) => setFormQuestion(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="e.g. Do you offer group discounts?"
            required
          />
          <TextField
            label="Answer"
            value={formAnswer}
            onChange={(e) => setFormAnswer(e.target.value)}
            fullWidth
            multiline
            rows={4}
            placeholder="e.g. Yes, we offer 10% off for groups of 3 or more students..."
            required
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              select
              label="Category"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              sx={{ flex: 1 }}
            >
              {CATEGORIES.map((cat) => (
                <MenuItem key={cat} value={cat}>{cat}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Display Order"
              type="number"
              value={formOrder}
              onChange={(e) => setFormOrder(Number(e.target.value))}
              sx={{ width: 140 }}
              inputProps={{ min: 0 }}
            />
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                color="success"
              />
            }
            label="Active (visible to Aintra)"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editingItem ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Q&amp;A</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this Q&amp;A? This cannot be undone.
          </Typography>
          {deletingItem && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight={600}>{deletingItem.question}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={saving}>
            {saving ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
