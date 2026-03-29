// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Alert } from '@neram/ui';

interface AddAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  adminId: string;
  editData?: any;
}

export default function AddAssignmentDialog({ open, onClose, onSaved, adminId, editData }: AddAssignmentDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [staffName, setStaffName] = useState('');
  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (editData) {
      setTitle(editData.title || '');
      setStaffName(editData.staff_name || '');
      setCity(editData.city || '');
      setStartDate(editData.start_date || new Date().toISOString().split('T')[0]);
      setEndDate(editData.end_date || '');
      setNotes(editData.notes || '');
    } else {
      setTitle(''); setStaffName(''); setCity('');
      setStartDate(new Date().toISOString().split('T')[0]);
      setEndDate(''); setNotes('');
    }
  }, [editData, open]);

  const handleSubmit = async () => {
    if (!title || !staffName || !startDate) {
      setError('Title, Staff Name, and Start Date are required');
      return;
    }
    setSaving(true); setError('');
    try {
      const payload = { title, staff_name: staffName, city: city || null, start_date: startDate, end_date: endDate || null, notes: notes || null, created_by: adminId };
      const method = editData ? 'PATCH' : 'POST';
      const url = editData ? `/api/staff-assignments/${editData.id}` : '/api/staff-assignments';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Failed to save assignment');
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editData ? 'Edit Assignment' : 'New Assignment'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField fullWidth label="Title *" value={title} onChange={e => setTitle(e.target.value)} margin="normal" size="small" placeholder="e.g., Coimbatore Offline Center" />
        <TextField fullWidth label="Staff Name *" value={staffName} onChange={e => setStaffName(e.target.value)} margin="normal" size="small" placeholder="e.g., Tamil Children" />
        <TextField fullWidth label="City" value={city} onChange={e => setCity(e.target.value)} margin="normal" size="small" placeholder="e.g., Coimbatore" />
        <TextField fullWidth label="Start Date *" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />
        <TextField fullWidth label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} margin="normal" size="small" InputLabelProps={{ shrink: true }} />
        <TextField fullWidth label="Notes" value={notes} onChange={e => setNotes(e.target.value)} margin="normal" size="small" multiline rows={2} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
