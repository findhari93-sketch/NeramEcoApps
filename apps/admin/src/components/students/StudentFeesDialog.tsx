'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  TextField,
  Typography,
} from '@neram/ui';

interface StudentFeesDialogProps {
  open: boolean;
  userId: string | null;
  studentName?: string | null;
  adminId?: string | null;
  onClose: () => void;
  onSaved?: () => void;
}

type Fees = Record<string, string>;

const EMPTY: Fees = {
  assigned_fee: '',
  discount_amount: '',
  final_fee: '',
  full_payment_discount: '',
  allowed_payment_modes: '',
  payment_scheme: '',
  installment_1_amount: '',
  installment_2_amount: '',
  installment_2_due_days: '',
  payment_deadline: '',
  coupon_code: '',
};

const MODE_OPTIONS = [
  { value: 'full_and_installment', label: 'Full payment or instalments' },
  { value: 'full_only', label: 'Full payment only' },
];

const SCHEME_OPTIONS = [
  { value: 'full', label: 'Paying in full' },
  { value: 'installment', label: 'Paying in instalments' },
];

const METHOD_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'upi_direct', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'manual', label: 'Other' },
];

const money = (v: string): number | null => {
  const s = String(v ?? '').replace(/[^0-9.\-]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const inr = (n: number | null) => (n === null ? 'Not set' : `₹${n.toLocaleString('en-IN')}`);

/**
 * Set what a student owes, from the students grid.
 *
 * WHY IT EXISTS. The complete fee form used to live inside the "approve
 * application" action, so it could not be opened for a student who has no
 * application, which on prod described 38 active students. The only other
 * post-approval editor writes assigned_fee and discount_amount but not
 * final_fee, the figure every balance actually derives from, so using it looked
 * like it worked and left the real total empty.
 *
 * Final fee is DERIVED whenever an assigned fee is given, rather than typed.
 * Three numbers that must agree, all hand-entered, is the single most likely way
 * to write a wrong balance onto a real student, and the server refuses the
 * inconsistency anyway. When only the final figure is known, leave the assigned
 * fee blank and type it directly.
 */
export default function StudentFeesDialog({
  open,
  userId,
  studentName,
  adminId,
  onClose,
  onSaved,
}: StudentFeesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fees, setFees] = useState<Fees>(EMPTY);
  const [hasApplication, setHasApplication] = useState(true);
  const [alreadyCollected, setAlreadyCollected] = useState(0);
  const [name, setName] = useState<string | null>(null);

  // A new payment to record, kept apart from the fee fields because it becomes a
  // payments row rather than a column.
  const [collected, setCollected] = useState('');
  const [collectedOn, setCollectedOn] = useState('');
  const [collectedMethod, setCollectedMethod] = useState('bank_transfer');
  const [collectedRef, setCollectedRef] = useState('');

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setFees(EMPTY);
    setCollected('');
    setCollectedOn('');
    setCollectedRef('');

    fetch(`/api/students/fees?userId=${encodeURIComponent(userId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not read the fees.');
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        const next = { ...EMPTY };
        for (const key of Object.keys(EMPTY)) {
          const v = data.fees?.[key];
          next[key] = v === null || v === undefined ? '' : String(v);
        }
        setFees(next);
        setHasApplication(!!data.hasApplication);
        setAlreadyCollected(Number(data.collected || 0));
        setName(data.user?.name ?? null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const set = useCallback((key: string, value: string) => {
    setFees((prev) => ({ ...prev, [key]: value }));
  }, []);

  const assigned = money(fees.assigned_fee);
  const discount = money(fees.discount_amount) ?? 0;
  // Derived whenever an assigned fee is present, typed only when it is not.
  const derivedFinal = assigned === null ? null : Math.max(0, assigned - discount);
  const finalFee = derivedFinal ?? money(fees.final_fee);
  const newlyCollected = money(collected) ?? 0;
  const totalCollected = alreadyCollected + newlyCollected;
  const due = finalFee === null ? null : Math.max(0, finalFee - totalCollected);

  const isInstalment = fees.payment_scheme === 'installment';
  const i1 = money(fees.installment_1_amount);
  const i2 = money(fees.installment_2_amount);
  const instalmentMismatch =
    i1 !== null && i2 !== null && finalFee !== null && Math.abs(i1 + i2 - finalFee) >= 0.01;

  const localError = useMemo(() => {
    if (fees.payment_deadline && !/^\d{4}-\d{2}-\d{2}$/.test(fees.payment_deadline)) {
      return 'The payment deadline must be a date.';
    }
    if (fees.allowed_payment_modes === 'full_only' && isInstalment) {
      return 'This student is set to full payment only, so the scheme cannot be instalments.';
    }
    for (const [key, label] of [
      ['assigned_fee', 'Assigned fee'],
      ['discount_amount', 'Discount'],
      ['full_payment_discount', 'Full payment discount'],
      ['installment_1_amount', 'Instalment 1'],
      ['installment_2_amount', 'Instalment 2'],
    ] as const) {
      const n = money(fees[key]);
      if (n !== null && n < 0) return `${label} cannot be negative.`;
    }
    if (newlyCollected < 0) return 'The collected amount cannot be negative.';
    return null;
  }, [fees, isInstalment, newlyCollected]);

  const save = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const key of Object.keys(EMPTY)) {
        const raw = fees[key];
        // An untouched blank leaves the stored value alone; it never clears it.
        if (raw === '') continue;
        payload[key] = ['allowed_payment_modes', 'payment_scheme', 'payment_deadline', 'coupon_code'].includes(key)
          ? raw
          : money(raw);
      }
      // Always send the figure the balance derives from, even when derived.
      if (finalFee !== null) payload.final_fee = finalFee;

      const res = await fetch('/api/students/fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          adminId: adminId || undefined,
          fees: payload,
          collected:
            newlyCollected > 0
              ? {
                  amount: newlyCollected,
                  paidAt: collectedOn || null,
                  method: collectedMethod,
                  reference: collectedRef || null,
                }
              : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the fees.');
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [userId, adminId, fees, finalFee, newlyCollected, collectedOn, collectedMethod, collectedRef, onSaved, onClose]);

  const field = {
    size: 'small' as const,
    fullWidth: true,
    InputLabelProps: { shrink: true },
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        Fees for {name || studentName || 'this student'}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Set by the office. The student is never asked for these.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }} role="alert">
                {error}
              </Alert>
            )}

            {!hasApplication && (
              <Alert severity="info" sx={{ mb: 2 }}>
                This student has no application form. Saving creates a record for the fee to
                sit on, marked as entered by staff.
              </Alert>
            )}

            {/* The running total, so the consequence of every keystroke is visible. */}
            <Box
              sx={{
                display: 'flex',
                gap: 3,
                flexWrap: 'wrap',
                p: 1.5,
                mb: 2.5,
                borderRadius: 1.5,
                bgcolor: 'rgba(37,99,235,0.06)',
              }}
            >
              {[
                ['Final fee', inr(finalFee)],
                ['Collected', inr(totalCollected)],
                ['Due', inr(due)],
              ].map(([label, value]) => (
                <Box key={label}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {label}
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {value}
                  </Typography>
                </Box>
              ))}
              {alreadyCollected > 0 && (
                <Box sx={{ alignSelf: 'center' }}>
                  <Chip
                    size="small"
                    label={`${inr(alreadyCollected)} already recorded`}
                    sx={{ height: 22, fontSize: 11 }}
                  />
                </Box>
              )}
            </Box>

            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
              What they owe
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2, mb: 2.5 }}>
              <TextField
                {...field}
                label={'Assigned fee (₹)'}
                value={fees.assigned_fee}
                onChange={(e) => set('assigned_fee', e.target.value)}
                helperText="The list price agreed"
              />
              <TextField
                {...field}
                label={'Discount (₹)'}
                value={fees.discount_amount}
                onChange={(e) => set('discount_amount', e.target.value)}
              />
              <TextField
                {...field}
                label={'Final fee (₹)'}
                value={derivedFinal !== null ? String(derivedFinal) : fees.final_fee}
                onChange={(e) => set('final_fee', e.target.value)}
                InputProps={{ readOnly: derivedFinal !== null }}
                helperText={
                  derivedFinal !== null
                    ? 'Assigned minus discount'
                    : 'Type it if there is no assigned fee'
                }
              />
              <TextField
                {...field}
                label={'Full payment discount (₹)'}
                value={fees.full_payment_discount}
                onChange={(e) => set('full_payment_discount', e.target.value)}
                helperText="Extra off for paying in one go"
              />
              <TextField
                {...field}
                label="Payment deadline"
                type="date"
                value={fees.payment_deadline}
                onChange={(e) => set('payment_deadline', e.target.value)}
              />
              <TextField
                {...field}
                label="Coupon code"
                value={fees.coupon_code}
                onChange={(e) => set('coupon_code', e.target.value)}
              />
            </Box>

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
              How they may pay
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
              <TextField
                {...field}
                select
                label="Allowed options"
                value={fees.allowed_payment_modes}
                onChange={(e) => set('allowed_payment_modes', e.target.value)}
              >
                <MenuItem value="">Not set</MenuItem>
                {MODE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                {...field}
                select
                label="What they chose"
                value={fees.payment_scheme}
                onChange={(e) => set('payment_scheme', e.target.value)}
              >
                <MenuItem value="">Not set</MenuItem>
                {SCHEME_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            {/* Shown only when it applies, so the form is three fields shorter
                for the many students paying in one go. */}
            {isInstalment && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
                <TextField
                  {...field}
                  label={'Instalment 1 (₹)'}
                  value={fees.installment_1_amount}
                  onChange={(e) => set('installment_1_amount', e.target.value)}
                />
                <TextField
                  {...field}
                  label={'Instalment 2 (₹)'}
                  value={fees.installment_2_amount}
                  onChange={(e) => set('installment_2_amount', e.target.value)}
                />
                <TextField
                  {...field}
                  label="Instalment 2 due in (days)"
                  value={fees.installment_2_due_days}
                  onChange={(e) => set('installment_2_due_days', e.target.value)}
                  helperText="45 if left blank"
                />
              </Box>
            )}

            {instalmentMismatch && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                The two instalments add up to {inr((i1 ?? 0) + (i2 ?? 0))}, but the final fee is{' '}
                {inr(finalFee)}. That is allowed, in case of a part payment, but check it.
              </Alert>
            )}

            <Divider sx={{ mb: 2 }} />

            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
              Money already received
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Leave blank if nothing has been collected yet. This adds a paid receipt, it does
              not replace anything already recorded.
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
              <TextField
                {...field}
                label={'Amount (₹)'}
                value={collected}
                onChange={(e) => setCollected(e.target.value)}
              />
              <TextField
                {...field}
                label="Received on"
                type="date"
                value={collectedOn}
                onChange={(e) => setCollectedOn(e.target.value)}
              />
              <TextField
                {...field}
                select
                label="How"
                value={collectedMethod}
                onChange={(e) => setCollectedMethod(e.target.value)}
              >
                {METHOD_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                {...field}
                label="Reference"
                value={collectedRef}
                onChange={(e) => setCollectedRef(e.target.value)}
                helperText="UTR or transaction id"
              />
            </Box>

            {localError && (
              <Alert severity="error" sx={{ mt: 2 }} role="alert">
                {localError}
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={loading || saving || !!localError}
          sx={{ textTransform: 'none', minHeight: 40, px: 3 }}
        >
          {saving ? 'Saving...' : 'Save fees'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
