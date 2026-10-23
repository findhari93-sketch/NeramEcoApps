'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@neram/ui';
import { storedMobile } from '@neram/database/phone';
import type { DemoRequest } from './types';
import MobileField from './MobileField';

const CLASS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '10th', label: 'Class 10' },
  { id: '11th', label: 'Class 11' },
  { id: '12th', label: 'Class 12' },
  { id: '12th-pass', label: 'Drop year' },
  { id: 'other', label: 'Other' },
];

function examYears(): number[] {
  const y = new Date().getFullYear();
  return [y, y + 1, y + 2, y + 3, y + 4];
}

export interface Form {
  name: string;
  phone: string;
  email: string;
  currentClass: string;
  examYear: string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  parentJoining: boolean;
  accountHolder: 'student' | 'parent';
}

export function fromRequest(r: DemoRequest): Form {
  return {
    name: r.name ?? '',
    // Kept with its code, so a Gulf number stays Gulf.
    phone: r.phone ?? '',
    email: r.email ?? '',
    currentClass: r.current_class ?? '',
    examYear: r.exam_year ? String(r.exam_year) : '',
    parentName: r.parent_name ?? '',
    parentPhone: r.parent_phone ?? '',
    parentEmail: r.parent_email ?? '',
    parentJoining: !!r.parent_joining,
    accountHolder: r.account_holder === 'parent' ? 'parent' : 'student',
  };
}

/**
 * Same details once trimmed: a stray space typed and deleted is not a change, and
 * a mobile number counts by the number it stores, not how the picker formats it.
 */
export function sameForm(a: Form, b: Form): boolean {
  return (Object.keys(a) as Array<keyof Form>).every((k) => {
    const x = a[k];
    const y = b[k];
    if (typeof x !== 'string' || typeof y !== 'string') return x === y;
    if (k === 'phone' || k === 'parentPhone') return (storedMobile(x) ?? x.trim()) === (storedMobile(y) ?? y.trim());
    return x.trim() === y.trim();
  });
}

/**
 * Correct a demo's details on the desk: a wrongly-typed name, a changed phone or
 * email, the class, the parent. Edits this demo record; the linked People account
 * stays the full CRM editor.
 */
export default function EditDetailsDialog({
  open,
  request,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  request: DemoRequest;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState<Form>(() => fromRequest(request));

  useEffect(() => {
    if (open) setForm(fromRequest(request));
  }, [open, request]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const nameOk = form.name.trim().length >= 2;
  const phoneOk = !!storedMobile(form.phone);
  const parentPhoneOk = !form.parentPhone || !!storedMobile(form.parentPhone);
  const emailOk = !form.email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim());
  const parentEmailOk = !form.parentEmail.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.parentEmail.trim());
  const canSave = nameOk && phoneOk && parentPhoneOk && emailOk && parentEmailOk;
  // Nothing changed means nothing to save, so an untouched form never writes a log entry.
  const dirty = useMemo(() => !sameForm(form, fromRequest(request)), [form, request]);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="edit-details-title">
      <DialogTitle id="edit-details-title">Edit demo details</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Fix the details that were entered wrongly. This updates the demo record and the activity log keeps who changed what.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Student name"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              error={!!form.name && !nameOk}
              helperText={form.name && !nameOk ? 'Enter at least two characters' : ' '}
              inputProps={{ maxLength: 120 }}
              required
            />
            <MobileField
              label="Mobile"
              value={form.phone}
              onChange={(phone) => set({ phone })}
              error={!!form.phone && !phoneOk}
              helperText={form.phone && !phoneOk ? 'A full mobile number for the picked country' : ' '}
              required
            />
            <TextField
              label="Email (optional)"
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              error={!emailOk}
              helperText={emailOk ? ' ' : 'Enter a valid email or leave it blank'}
            />
            <TextField select label="Class" value={form.currentClass} onChange={(e) => set({ currentClass: e.target.value })}>
              <MenuItem value="">Not set</MenuItem>
              {CLASS_OPTIONS.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Exam year" value={form.examYear} onChange={(e) => set({ examYear: e.target.value })}>
              <MenuItem value="">Not set</MenuItem>
              {examYears().map((y) => (
                <MenuItem key={y} value={String(y)}>
                  {y}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Account belongs to" value={form.accountHolder} onChange={(e) => set({ accountHolder: e.target.value as 'student' | 'parent' })}>
              <MenuItem value="student">The student</MenuItem>
              <MenuItem value="parent">A parent</MenuItem>
            </TextField>
          </Box>

          <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>
            Parent
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField label="Parent name (optional)" value={form.parentName} onChange={(e) => set({ parentName: e.target.value })} inputProps={{ maxLength: 120 }} />
            <MobileField
              label="Parent mobile (optional)"
              value={form.parentPhone}
              onChange={(parentPhone) => set({ parentPhone })}
              error={!parentPhoneOk}
              helperText={parentPhoneOk ? ' ' : 'A full mobile number, or leave it blank'}
            />
            <TextField
              label="Parent email (optional)"
              type="email"
              value={form.parentEmail}
              onChange={(e) => set({ parentEmail: e.target.value })}
              error={!parentEmailOk}
              helperText={parentEmailOk ? ' ' : 'Enter a valid email or leave it blank'}
            />
          </Box>
          <FormControlLabel
            control={<Switch checked={form.parentJoining} onChange={(e) => set({ parentJoining: e.target.checked })} />}
            label="A parent is joining the demo"
            sx={{ minHeight: 44 }}
          />
        </Box>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button
          variant="contained"
          disabled={busy || !canSave || !dirty}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
          onClick={() =>
            onSubmit({
              action: 'edit_details',
              name: form.name.trim(),
              phone: form.phone,
              email: form.email.trim() || null,
              currentClass: form.currentClass || null,
              examYear: form.examYear ? Number(form.examYear) : null,
              parentName: form.parentName.trim() || null,
              parentPhone: form.parentPhone || null,
              parentEmail: form.parentEmail.trim() || null,
              parentJoining: form.parentJoining,
              accountHolder: form.accountHolder,
            })
          }
        >
          {busy ? 'Saving' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
