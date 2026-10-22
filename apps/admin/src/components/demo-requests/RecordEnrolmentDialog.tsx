'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import { formatRupees, OFFICE_PAYMENT_METHODS } from '@neram/database/fee-plan';
import type { DemoPerson } from '@/app/api/demo-requests/people/route';
import type { DemoRequest } from './types';

const TYPE_LABEL: Record<string, string> = { student: 'Student', lead: 'Lead', parent: 'Parent' };
const phoneTail = (v: string | null | undefined) => (v || '').replace(/\D/g, '').slice(-10);
const n = (v: string) => Number(String(v).replace(/[^\d.]/g, '')) || 0;
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/**
 * Record a demo student's enrolment from the desk when there is no enrolment link
 * yet: a historical demo, or one recorded as held outside the desk. Staff type the
 * fee and the payment they already took; this records the money, makes the fee
 * record, enrols the student and moves them to the Enrolled tab. When the student
 * already has a Neram account (e.g. a child set up in Nexus, or a parent's account),
 * staff pick it so the fee goes on that account and no duplicate is made.
 */
export default function RecordEnrolmentDialog({
  open,
  onClose,
  request,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  request: DemoRequest;
  /** Runs the desk action; returns an error message, or null on success. */
  onSubmit: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [total, setTotal] = useState('');
  const [paid, setPaid] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [method, setMethod] = useState<string>('upi_direct');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(istToday());
  const [linkExisting, setLinkExisting] = useState(false);
  const [student, setStudent] = useState<DemoPerson | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<DemoPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Reset on open, and suggest an existing student account by phone tail. A demo on a
  // parent's account starts with the toggle on, since the fee belongs to the student.
  useEffect(() => {
    if (!open) return;
    setTotal('');
    setPaid('');
    setDueDate('');
    setMethod('upi_direct');
    setReference('');
    setPaidOn(istToday());
    setError(null);
    setTouched(false);
    setSaving(false);
    const parentAccount = request.account_holder === 'parent';
    const tail = phoneTail(request.phone);
    if (tail.length < 4) {
      setLinkExisting(parentAccount);
      setStudent(null);
      setQuery('');
      return;
    }
    let cancelled = false;
    fetch(`/api/demo-requests/people?q=${encodeURIComponent(tail)}`)
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((d) => {
        if (cancelled) return;
        const people = (d.people ?? []) as DemoPerson[];
        const match = people.find((p) => p.user_type === 'student' && p.id !== request.user_id) || null;
        if (match) {
          setStudent(match);
          setQuery(match.name || tail);
          setLinkExisting(true);
        } else {
          setStudent(null);
          setQuery('');
          setLinkExisting(parentAccount);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, request.phone, request.user_id, request.account_holder]);

  // Search People as staff type (debounced), only while the toggle is on.
  useEffect(() => {
    const q = query.trim();
    if (!open || !linkExisting || q.length < 2 || (student && q === student.name)) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/demo-requests/people?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { people: [] }))
        .then((d) => !cancelled && setOptions((d.people ?? []) as DemoPerson[]))
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, linkExisting, student]);

  const totalNum = n(total);
  const paidNum = n(paid);
  const balance = Math.max(0, Math.round((totalNum - paidNum) * 100) / 100);
  const partPaid = balance > 0.01;

  const fieldError = useMemo(() => {
    if (totalNum <= 0) return 'Enter the total fee.';
    if (paidNum <= 0) return 'Enter the amount paid.';
    if (paidNum > totalNum + 0.01) return 'The amount paid cannot be more than the total fee.';
    if (linkExisting && !student) return 'Pick the student account, or turn off the toggle.';
    return null;
  }, [totalNum, paidNum, linkExisting, student]);

  const submit = async () => {
    setTouched(true);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    setSaving(true);
    setError(null);
    const err = await onSubmit({
      action: 'record_enrolment',
      totalFee: totalNum,
      amountPaid: paidNum,
      installment2DueDate: partPaid && dueDate ? dueDate : null,
      method,
      reference: reference.trim() || undefined,
      paymentDate: paidOn || undefined,
      mode: linkExisting ? 'fold_parent' : 'create',
      studentUserId: linkExisting ? student?.id : undefined,
    });
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="record-enrol-title">
      <DialogTitle id="record-enrol-title" sx={{ fontWeight: 700 }}>
        Record enrolment
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {request.name}: enter the fee and the payment you already took. This records the money, makes the fee record and moves the student to
          the Enrolled tab.
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            label="Total fee"
            type="number"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            onBlur={() => setTouched(true)}
            required
            fullWidth
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment>, sx: { minHeight: 48 } }}
            inputProps={{ min: 0, inputMode: 'numeric' }}
          />
          <TextField
            label="Amount paid"
            type="number"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            onBlur={() => setTouched(true)}
            required
            fullWidth
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment>, sx: { minHeight: 48 } }}
            inputProps={{ min: 0, inputMode: 'numeric' }}
          />
        </Box>

        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color={partPaid ? 'warning.dark' : 'success.dark'} fontWeight={700}>
            {partPaid ? `Balance ${formatRupees(balance)} due` : totalNum > 0 ? 'Paid in full' : ' '}
          </Typography>
          {partPaid && (
            <Typography variant="caption" color="text.secondary">
              (recorded as installment 1 of 2)
            </Typography>
          )}
        </Box>

        {partPaid && (
          <TextField
            label="Balance due date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            fullWidth
            sx={{ mt: 2 }}
            InputLabelProps={{ shrink: true }}
            helperText="Leave blank to set a default due date."
            InputProps={{ sx: { minHeight: 48 } }}
          />
        )}

        <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            select
            label="How it was paid"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            fullWidth
            InputProps={{ sx: { minHeight: 48 } }}
          >
            {OFFICE_PAYMENT_METHODS.map((m) => (
              <MenuItem key={m.value} value={m.value} sx={{ minHeight: 44 }}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Paid on"
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            InputProps={{ sx: { minHeight: 48 } }}
            inputProps={{ max: istToday() }}
          />
        </Box>

        <TextField
          label="Reference (optional)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          fullWidth
          sx={{ mt: 2 }}
          placeholder="UPI or UTR reference, cheque number, receipt no."
          InputProps={{ sx: { minHeight: 48 } }}
          inputProps={{ maxLength: 120 }}
        />

        <FormControlLabel
          sx={{ mt: 2, alignItems: 'flex-start' }}
          control={<Switch checked={linkExisting} onChange={(e) => setLinkExisting(e.target.checked)} sx={{ mt: -0.5 }} />}
          label={
            <Box sx={{ py: 0.5 }}>
              <Typography variant="body2" fontWeight={600}>
                This student already has a Neram account
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Pick it so the fee goes on that account and no new account is made. A parent or lead account on this demo is folded into it.
              </Typography>
            </Box>
          }
        />

        {linkExisting && (
          <>
            <Autocomplete
              sx={{ mt: 1 }}
              options={options}
              value={student}
              onChange={(_, v) => setStudent(v)}
              inputValue={query}
              onInputChange={(_, v) => setQuery(v)}
              getOptionLabel={(o) => o.name || o.phone || ''}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(x) => x}
              loading={searching}
              noOptionsText={query.trim().length < 2 ? 'Type at least 2 letters' : 'Nobody found. Search by name, phone or email.'}
              renderOption={(props, o) => (
                <Box component="li" {...props} key={o.id} sx={{ display: 'block !important', minHeight: 48, py: 1 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {o.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="p">
                    {[o.phone, o.email, o.is_parent_account ? TYPE_LABEL.parent : TYPE_LABEL[o.user_type] || o.user_type].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Existing student account"
                  placeholder="Search by name, phone or email"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {searching ? <CircularProgress color="inherit" size={18} aria-label="Searching" /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            {student && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                The fee goes on {student.name || 'the chosen student'}&apos;s account, and {request.name}&apos;s account is folded into it (phone and
                email kept as family contact). This can be undone within 30 days.
              </Alert>
            )}
          </>
        )}

        {(error || (touched && fieldError)) && (
          <Alert severity="error" role="alert" sx={{ mt: 2 }}>
            {error || fieldError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SchoolIcon />}
          onClick={submit}
          disabled={saving || !!fieldError}
          sx={{ minHeight: 44 }}
        >
          {saving ? 'Recording' : 'Record enrolment'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
