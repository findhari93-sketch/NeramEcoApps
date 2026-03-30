// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Alert,
} from '@neram/ui';
import { INCOME_CATEGORIES } from './ExpenseConstants';

interface AddIncomeDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  adminId: string;
  editData?: any;
}

export default function AddIncomeDialog({ open, onClose, onSaved, adminId, editData }: AddIncomeDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (editData) {
      setCategory(editData.category || '');
      setAmount(String(editData.amount || ''));
      setDescription(editData.description || '');
      setTransactionDate(editData.transaction_date || new Date().toISOString().split('T')[0]);
      setNotes(editData.notes || '');
    } else {
      setCategory('');
      setAmount('');
      setDescription('');
      setTransactionDate(new Date().toISOString().split('T')[0]);
      setNotes('');
    }
  }, [editData, open]);

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
      const payload = {
        type: 'income',
        category,
        amount: parseFloat(amount),
        description,
        transaction_date: transactionDate,
        notes: notes || null,
        created_by: adminId,
      };

      const method = editData ? 'PATCH' : 'POST';
      const url = editData ? `/api/expenses/${editData.id}` : '/api/expenses';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

      if (!res.ok) throw new Error('Failed to save income entry');

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
      <DialogTitle>{editData ? 'Edit Income' : 'Add Side Income'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <TextField select fullWidth label="Category *" value={category} onChange={e => setCategory(e.target.value)} margin="normal" size="small">
          {INCOME_CATEGORIES.map(c => (
            <MenuItem key={c.value} value={c.value}>{c.label} — {c.description}</MenuItem>
          ))}
        </TextField>

        <TextField fullWidth label="Amount (₹) *" type="number" value={amount} onChange={e => setAmount(e.target.value)} margin="normal" size="small" inputProps={{ step: '0.01', min: '0' }} />

        <TextField fullWidth label="Description *" value={description} onChange={e => setDescription(e.target.value)} margin="normal" size="small" />

        <TextField fullWidth label="Date *" type="date" value={transactionDate} onChange={e => setTransactionDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />

        <TextField fullWidth label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} margin="normal" size="small" multiline rows={2} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
