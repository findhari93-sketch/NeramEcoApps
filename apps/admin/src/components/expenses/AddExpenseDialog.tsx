// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Alert, Box, Typography, IconButton,
} from '@neram/ui';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DeleteIcon from '@mui/icons-material/Delete';
import { EXPENSE_CATEGORIES } from './ExpenseConstants';

interface AddExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  adminId: string;
  editData?: any;
  preSelectedAssignment?: { id: string; title: string } | null;
  assignments: Array<{ id: string; title: string; staff_name: string }>;
}

export default function AddExpenseDialog({
  open, onClose, onSaved, adminId, editData, preSelectedAssignment, assignments,
}: AddExpenseDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignmentId, setAssignmentId] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState('');

  useEffect(() => {
    if (editData) {
      setCategory(editData.category || '');
      setAmount(String(editData.amount || ''));
      setDescription(editData.description || '');
      setTransactionDate(editData.transaction_date || new Date().toISOString().split('T')[0]);
      setAssignmentId(editData.assignment_id || '');
      setNotes(editData.notes || '');
      setReceiptPreview(editData.receipt_url || '');
    } else {
      setCategory('');
      setAmount('');
      setDescription('');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setAssignmentId(preSelectedAssignment?.id || '');
      setNotes('');
      setReceiptFile(null);
      setReceiptPreview('');
    }
  }, [editData, preSelectedAssignment, open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptFile(file);
      setReceiptPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    if (!category || !amount || !description || !transactionDate) {
      setError('Please fill all required fields');
      return;
    }
    if (parseFloat(amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    setSaving(true);
    setError('');

    try {
      let receiptUrl = editData?.receipt_url || null;

      // Upload receipt if new file selected
      if (receiptFile) {
        const formData = new FormData();
        formData.append('file', receiptFile);
        const uploadRes = await fetch('/api/expenses/upload-receipt', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Failed to upload receipt');
        const uploadData = await uploadRes.json();
        receiptUrl = uploadData.url;
      }

      const payload = {
        type: 'expense',
        category,
        amount: parseFloat(amount),
        description,
        transaction_date: transactionDate,
        assignment_id: assignmentId || null,
        receipt_url: receiptUrl,
        notes: notes || null,
        created_by: adminId,
      };

      const method = editData ? 'PATCH' : 'POST';
      const url = editData ? `/api/expenses/${editData.id}` : '/api/expenses';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (!res.ok) throw new Error('Failed to save expense');

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editData ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField select fullWidth label="Category *" value={category} onChange={e => setCategory(e.target.value)} margin="normal" size="small">
          {EXPENSE_CATEGORIES.map(c => (
            <MenuItem key={c.value} value={c.value}>{c.label} — {c.description}</MenuItem>
          ))}
        </TextField>

        <TextField fullWidth label="Amount (₹) *" type="number" value={amount} onChange={e => setAmount(e.target.value)} margin="normal" size="small" inputProps={{ step: '0.01', min: '0' }} />

        <TextField fullWidth label="Description *" value={description} onChange={e => setDescription(e.target.value)} margin="normal" size="small" />

        <TextField fullWidth label="Date *" type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />

        <TextField select fullWidth label="Staff Assignment (optional)" value={assignmentId} onChange={e => setAssignmentId(e.target.value)} margin="normal" size="small">
          <MenuItem value="">None</MenuItem>
          {assignments.map(a => (
            <MenuItem key={a.id} value={a.id}>{a.staff_name} — {a.title}</MenuItem>
          ))}
        </TextField>

        <TextField fullWidth label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} margin="normal" size="small" multiline rows={2} />

        {/* Receipt upload */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Receipt (optional)</Typography>
          {receiptPreview ? (
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <img src={receiptPreview} alt="Receipt" style={{ maxWidth: 200, maxHeight: 150, borderRadius: 8 }} />
              <IconButton size="small" sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper' }} onClick={() => { setReceiptFile(null); setReceiptPreview(''); }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />} size="small">
              Upload Receipt
              <input type="file" hidden accept="image/*" onChange={handleFileChange} />
            </Button>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
