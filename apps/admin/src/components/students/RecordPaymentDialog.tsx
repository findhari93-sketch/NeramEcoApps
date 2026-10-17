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
  Grid,
  InputAdornment,
  MenuItem,
  TextField,
  Typography,
} from '@neram/ui';
import { OFFICE_PAYMENT_METHODS, formatRupees, istToday, validatePlan } from '@neram/database/fee-plan';

interface RecordPaymentDialogProps {
  open: boolean;
  userId: string | null;
  studentName?: string | null;
  /** What is still owed, to prefill the amount. */
  balance?: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

/**
 * Collections' "Record payment": one office payment against the fee already set.
 * The line key is made when the dialog opens, so a double click records once.
 */
export default function RecordPaymentDialog({ open, userId, studentName, balance, onClose, onSaved }: RecordPaymentDialogProps) {
  const [key, setKey] = useState('');
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(istToday());
  const [method, setMethod] = useState('upi_direct');
  const [reference, setReference] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setKey(newKey());
    setAmount(balance && balance > 0 ? String(Math.round(balance)) : '');
    setPaidOn(istToday());
    setMethod('upi_direct');
    setReference('');
    setTouched({});
    setSubmitted(false);
    setError('');
  }, [open, balance]);

  const line = useMemo(
    () => ({ key, amount: Number(amount.replace(/[,\s₹]/g, '')) || (null as unknown as number), paidOn, method, reference: reference.trim() || null }),
    [key, amount, paidOn, method, reference],
  );
  const check = useMemo(() => validatePlan({ assignedFee: 1, scheme: 'full' }, [line]), [line]);
  const errorFor = (f: string) =>
    submitted || touched[f] ? check.errors.find((e) => e.field === `payments.0.${f}`)?.message : undefined;

  const save = async () => {
    if (!userId) return;
    setSubmitted(true);
    if (check.errors.some((e) => e.field.startsWith('payments.'))) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/collections/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, line }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not record the payment.');
      const warn = (body.warnings || []).length ? ` ${body.warnings.join(' ')}` : '';
      onSaved(`Recorded ${formatRupees(line.amount)} for ${studentName || 'the student'}.${warn}`);
    } catch (e: any) {
      setError(e?.message || 'Could not record the payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 1.5 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 0.5 }}>Record payment</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {studentName || 'Student'}
          {balance ? `, still to collect ${formatRupees(balance)}` : ''}
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, amount: true }))}
              error={Boolean(errorFor('amount'))}
              helperText={errorFor('amount') || ' '}
              fullWidth
              size="small"
              autoFocus
              inputProps={{ inputMode: 'numeric', 'data-testid': 'record-amount' }}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Date received"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, paidOn: true }))}
              error={Boolean(errorFor('paidOn'))}
              helperText={errorFor('paidOn') || ' '}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: istToday() }}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              select
              label="How"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              error={Boolean(errorFor('method'))}
              helperText={errorFor('method') || ' '}
              fullWidth
              size="small"
            >
              {OFFICE_PAYMENT_METHODS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              helperText="UPI or bank reference"
              fullWidth
              size="small"
              inputProps={{ maxLength: 100 }}
            />
          </Grid>
        </Grid>
        {error && (
          <Box sx={{ mt: 1 }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none', minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, boxShadow: 'none' }}
        >
          {saving ? 'Recording' : 'Record payment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
