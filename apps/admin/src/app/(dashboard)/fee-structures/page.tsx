'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Divider,
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

interface FeeStructure {
  id: string;
  course_type: string;
  program_type: string;
  display_name: string;
  display_name_ta: string | null;
  fee_amount: number;
  combo_extra_fee: number;
  duration: string;
  schedule_summary: string | null;
  features: string[];
  is_active: boolean;
  display_order: number;
  // Payment options
  single_payment_discount: number;
  installment_1_amount: number | null;
  installment_2_amount: number | null;
  is_hidden_from_public: boolean;
  created_at: string;
  updated_at: string;
}

const COURSE_TYPES = [
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'both', label: 'Both (Combo)' },
];

const PROGRAM_TYPES = [
  { value: 'year_long', label: 'Year Long' },
  { value: 'crash_course', label: 'Crash Course' },
];

const emptyForm = {
  course_type: 'nata',
  program_type: 'year_long',
  display_name: '',
  display_name_ta: '',
  fee_amount: 0,
  combo_extra_fee: 0,
  duration: '',
  schedule_summary: '',
  features: '',
  is_active: true,
  display_order: 0,
  // Payment options
  single_payment_discount: 0,
  installment_1_amount: 0,
  installment_2_amount: 0,
  is_hidden_from_public: false,
};

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

export default function FeeStructuresPage() {
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeStructure | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const validateField = (field: string, formData = form): string => {
    switch (field) {
      case 'display_name':
        return !formData.display_name.trim() ? 'Display name is required' : '';
      case 'fee_amount':
        return Number(formData.fee_amount) <= 0 ? 'Fee amount must be greater than 0' : '';
      case 'duration':
        return !formData.duration.trim() ? 'Duration is required' : '';
      case 'single_payment_discount':
        return Number(formData.single_payment_discount) < 0
          ? 'Discount cannot be negative'
          : Number(formData.single_payment_discount) >= Number(formData.fee_amount) && Number(formData.fee_amount) > 0
            ? 'Discount must be less than fee amount'
            : '';
      case 'combo_extra_fee':
        return Number(formData.combo_extra_fee) < 0 ? 'Combo extra fee cannot be negative' : '';
      case 'display_order':
        return Number(formData.display_order) < 0 ? 'Display order cannot be negative' : '';
      case 'installments': {
        const i1 = Number(formData.installment_1_amount);
        const i2 = Number(formData.installment_2_amount);
        const fee = Number(formData.fee_amount);
        if ((i1 > 0 || i2 > 0) && fee > 0 && i1 + i2 !== fee) {
          return `Installments must sum to ${formatCurrency(fee)}`;
        }
        return '';
      }
      default:
        return '';
    }
  };

  const validate = (): boolean => {
    const fields = ['display_name', 'fee_amount', 'duration', 'single_payment_discount', 'combo_extra_fee', 'display_order', 'installments'];
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      const error = validateField(field);
      if (error) newErrors[field] = error;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFieldBlur = (field: string) => {
    const error = validateField(field);
    setErrors((prev) => {
      const next = { ...prev };
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
  };

  const fetchFeeStructures = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/fee-structures');
      const json = await res.json();
      setFeeStructures(json.data || []);
    } catch (error) {
      console.error('Error fetching fee structures:', error);
      setSnackbar({ open: true, message: 'Failed to load fee structures', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeStructures();
  }, [fetchFeeStructures]);

  const handleOpenDialog = (fee?: FeeStructure) => {
    if (fee) {
      setEditingFee(fee);
      setForm({
        course_type: fee.course_type,
        program_type: fee.program_type,
        display_name: fee.display_name,
        display_name_ta: fee.display_name_ta || '',
        fee_amount: fee.fee_amount,
        combo_extra_fee: fee.combo_extra_fee,
        duration: fee.duration,
        schedule_summary: fee.schedule_summary || '',
        features: (fee.features || []).join('\n'),
        is_active: fee.is_active,
        display_order: fee.display_order,
        single_payment_discount: fee.single_payment_discount || 0,
        installment_1_amount: fee.installment_1_amount || 0,
        installment_2_amount: fee.installment_2_amount || 0,
        is_hidden_from_public: fee.is_hidden_from_public || false,
      });
    } else {
      setEditingFee(null);
      setForm(emptyForm);
    }
    setErrors({});
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingFee(null);
    setForm(emptyForm);
    setErrors({});
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);

      const payload = {
        course_type: form.course_type,
        program_type: form.program_type,
        display_name: form.display_name,
        display_name_ta: form.display_name_ta || null,
        fee_amount: Number(form.fee_amount),
        combo_extra_fee: Number(form.combo_extra_fee),
        duration: form.duration,
        schedule_summary: form.schedule_summary || null,
        features: form.features ? form.features.split('\n').filter((f) => f.trim()) : [],
        is_active: form.is_active,
        display_order: Number(form.display_order),
        single_payment_discount: Number(form.single_payment_discount) || 0,
        installment_1_amount: Number(form.installment_1_amount) || null,
        installment_2_amount: Number(form.installment_2_amount) || null,
        is_hidden_from_public: form.is_hidden_from_public,
      };

      if (editingFee) {
        const res = await fetch(`/api/fee-structures/${editingFee.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          let errorMessage = `Failed to update (HTTP ${res.status})`;
          try {
            const errBody = await res.json();
            if (errBody?.error) errorMessage = errBody.error;
          } catch { /* response not JSON */ }
          throw new Error(errorMessage);
        }
        setSnackbar({ open: true, message: 'Fee structure updated successfully', severity: 'success' });
      } else {
        const res = await fetch('/api/fee-structures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          let errorMessage = `Failed to create (HTTP ${res.status})`;
          try {
            const errBody = await res.json();
            if (errBody?.error) errorMessage = errBody.error;
          } catch { /* response not JSON */ }
          throw new Error(errorMessage);
        }
        setSnackbar({ open: true, message: 'Fee structure created successfully', severity: 'success' });
      }

      handleCloseDialog();
      fetchFeeStructures();
    } catch (error) {
      console.error('Error saving fee structure:', error);
      const msg = error instanceof Error ? error.message : 'Failed to save fee structure';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fee structure?')) return;

    try {
      const res = await fetch(`/api/fee-structures/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        let errorMessage = `Failed to delete (HTTP ${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.error) errorMessage = errBody.error;
        } catch { /* response not JSON */ }
        throw new Error(errorMessage);
      }
      setSnackbar({ open: true, message: 'Fee structure deleted successfully', severity: 'success' });
      fetchFeeStructures();
    } catch (error) {
      console.error('Error deleting fee structure:', error);
      const msg = error instanceof Error ? error.message : 'Failed to delete fee structure';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  const columns = [
    { field: 'display_order', headerName: 'Order', width: 70 },
    { field: 'display_name', headerName: 'Name', width: 200 },
    {
      field: 'course_type',
      headerName: 'Course',
      width: 120,
      renderCell: (params: any) => (
        <Chip
          label={params.value === 'jee_paper2' ? 'JEE P2' : params.value === 'both' ? 'Combo' : 'NATA'}
          size="small"
          color={params.value === 'nata' ? 'primary' : params.value === 'jee_paper2' ? 'secondary' : 'warning'}
          variant="outlined"
        />
      ),
    },
    {
      field: 'program_type',
      headerName: 'Program',
      width: 130,
      renderCell: (params: any) => (
        <Chip
          label={params.value === 'year_long' ? 'Year Long' : 'Crash Course'}
          size="small"
          variant="outlined"
        />
      ),
    },
    {
      field: 'fee_amount',
      headerName: 'Fee',
      width: 130,
      renderCell: (params: any) => (
        <Typography variant="body2" fontWeight="medium">
          {formatCurrency(params.value)}
        </Typography>
      ),
    },
    {
      field: 'combo_extra_fee',
      headerName: 'Combo Extra',
      width: 130,
      renderCell: (params: any) => (
        <Typography variant="body2" color={params.value > 0 ? 'text.primary' : 'text.secondary'}>
          {params.value > 0 ? formatCurrency(params.value) : '-'}
        </Typography>
      ),
    },
    { field: 'duration', headerName: 'Duration', width: 120 },
    {
      field: 'single_payment_discount',
      headerName: 'Single Pay Disc.',
      width: 130,
      renderCell: (params: any) => (
        <Typography variant="body2" color={params.value > 0 ? 'success.main' : 'text.secondary'}>
          {params.value > 0 ? formatCurrency(params.value) : '-'}
        </Typography>
      ),
    },
    {
      field: 'installment_1_amount',
      headerName: 'Inst. 1',
      width: 110,
      renderCell: (params: any) => (
        <Typography variant="body2" color={params.value ? 'text.primary' : 'text.secondary'}>
          {params.value ? formatCurrency(params.value) : '-'}
        </Typography>
      ),
    },
    {
      field: 'installment_2_amount',
      headerName: 'Inst. 2',
      width: 110,
      renderCell: (params: any) => (
        <Typography variant="body2" color={params.value ? 'text.primary' : 'text.secondary'}>
          {params.value ? formatCurrency(params.value) : '-'}
        </Typography>
      ),
    },
    {
      field: 'is_hidden_from_public',
      headerName: 'Hidden',
      width: 90,
      renderCell: (params: any) => (
        <Chip
          label={params.value ? 'Hidden' : 'Public'}
          size="small"
          color={params.value ? 'warning' : 'default'}
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
            Fee Structures
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage pricing and programs
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Fee Structure
        </Button>
      </Box>

      <DataTable rows={feeStructures} columns={columns} loading={loading} />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingFee ? 'Edit Fee Structure' : 'Add Fee Structure'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {Object.keys(errors).length > 0 && (
              <Alert severity="error" sx={{ mb: 1 }}>
                Please fix the errors below before saving.
              </Alert>
            )}
            <TextField
              label="Display Name"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              onBlur={() => handleFieldBlur('display_name')}
              error={!!errors.display_name}
              helperText={errors.display_name}
              fullWidth
              required
              placeholder="e.g., NATA Year Long Program"
            />
            <TextField
              label="Display Name (Tamil)"
              value={form.display_name_ta}
              onChange={(e) => setForm({ ...form, display_name_ta: e.target.value })}
              fullWidth
            />
            <TextField
              select
              label="Course Type"
              value={form.course_type}
              onChange={(e) => setForm({ ...form, course_type: e.target.value })}
              fullWidth
              required
            >
              {COURSE_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Program Type"
              value={form.program_type}
              onChange={(e) => setForm({ ...form, program_type: e.target.value })}
              fullWidth
              required
            >
              {PROGRAM_TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Fee Amount (Rs.)"
              type="number"
              value={form.fee_amount}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                const i1 = Math.ceil(val / 2);
                const i2 = val - i1;
                setForm({ ...form, fee_amount: val, installment_1_amount: i1, installment_2_amount: i2 });
              }}
              onBlur={() => handleFieldBlur('fee_amount')}
              error={!!errors.fee_amount}
              helperText={errors.fee_amount}
              fullWidth
              required
            />
            <TextField
              label="Combo Extra Fee (Rs.)"
              type="number"
              value={form.combo_extra_fee}
              onChange={(e) => setForm({ ...form, combo_extra_fee: parseFloat(e.target.value) || 0 })}
              onBlur={() => handleFieldBlur('combo_extra_fee')}
              error={!!errors.combo_extra_fee}
              helperText={
                errors.combo_extra_fee ||
                (form.course_type !== 'both' && Number(form.combo_extra_fee) > 0
                  ? "Combo extra fee only applies to 'Both' course type"
                  : 'Additional fee for combo course selection')
              }
              fullWidth
              color={form.course_type !== 'both' && Number(form.combo_extra_fee) > 0 ? 'warning' : undefined}
            />

            <Divider sx={{ my: 0.5 }} />
            <Typography variant="subtitle2" color="text.secondary">
              Payment Options
            </Typography>

            <TextField
              label="Single Payment Discount (Rs.)"
              type="number"
              value={form.single_payment_discount}
              onChange={(e) => setForm({ ...form, single_payment_discount: parseFloat(e.target.value) || 0 })}
              onBlur={() => handleFieldBlur('single_payment_discount')}
              error={!!errors.single_payment_discount}
              helperText={errors.single_payment_discount || 'Discount when student pays full fee in a single payment'}
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Installment 1 Amount (Rs.)"
                type="number"
                value={form.installment_1_amount}
                onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setForm({ ...form, installment_1_amount: val, installment_2_amount: Math.max(0, form.fee_amount - val) });
              }}
                onBlur={() => handleFieldBlur('installments')}
                error={!!errors.installments}
                helperText="First installment amount"
                fullWidth
              />
              <TextField
                label="Installment 2 Amount (Rs.)"
                type="number"
                value={form.installment_2_amount}
                onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setForm({ ...form, installment_2_amount: val, installment_1_amount: Math.max(0, form.fee_amount - val) });
              }}
                onBlur={() => handleFieldBlur('installments')}
                error={!!errors.installments}
                helperText={errors.installments || 'Second installment amount'}
                fullWidth
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_hidden_from_public}
                  onChange={(e) => setForm({ ...form, is_hidden_from_public: e.target.checked })}
                />
              }
              label="Hidden from Public"
            />

            <Divider sx={{ my: 0.5 }} />
            <Typography variant="subtitle2" color="text.secondary">
              General
            </Typography>

            <TextField
              label="Duration"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: e.target.value })}
              onBlur={() => handleFieldBlur('duration')}
              error={!!errors.duration}
              helperText={errors.duration}
              fullWidth
              required
              placeholder="e.g., 12 months"
            />
            <TextField
              label="Schedule Summary"
              value={form.schedule_summary}
              onChange={(e) => setForm({ ...form, schedule_summary: e.target.value })}
              fullWidth
              placeholder="e.g., Mon-Fri, 6-8 PM"
            />
            <TextField
              label="Features (one per line)"
              value={form.features}
              onChange={(e) => setForm({ ...form, features: e.target.value })}
              fullWidth
              multiline
              rows={4}
              placeholder="Live classes&#10;Study materials&#10;Mock tests&#10;Doubt sessions"
              helperText="Enter each feature on a new line"
            />
            <TextField
              label="Display Order"
              type="number"
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: parseInt(e.target.value) || 0 })}
              onBlur={() => handleFieldBlur('display_order')}
              error={!!errors.display_order}
              helperText={errors.display_order}
              fullWidth
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : editingFee ? 'Update' : 'Create'}
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
