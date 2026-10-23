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
  Switch,
  TextField,
  Typography,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import { formatRupees } from '@neram/database/fee-plan';
import type { DemoPerson } from '@/app/api/demo-requests/people/route';
import { linkMoneyLine } from './EnrolmentLinkStatus';
import type { DeskEnrolmentLink, DemoRequest } from './types';

const TYPE_LABEL: Record<string, string> = { student: 'Student', lead: 'Lead', parent: 'Parent' };
const phoneTail = (v: string | null | undefined) => (v || '').replace(/\D/g, '').slice(-10);
const n = (v: string) => Number(String(v).replace(/[^\d.]/g, '')) || 0;

/** Today in IST as YYYY-MM-DD, the latest day anyone can have joined. */
function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Confirm a recorded payment that was entered on the enrolment link but never
 * finalised: the money staff entered is shown, not asked for again. Confirming
 * records it, makes the fee record and enrols the student on the day they joined
 * (the paid date), so a backfilled student keeps their real date. The amounts can
 * still be corrected. When the student already has a Neram account (e.g. a child
 * set up in Nexus), staff pick it and the demo's parent/lead account is folded in.
 */
export default function FinaliseEnrolmentDialog({
  open,
  onClose,
  link,
  request,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  link: DeskEnrolmentLink;
  request: DemoRequest;
  /** Runs the desk action; returns an error message, or null on success. */
  onSubmit: (body: Record<string, unknown>) => Promise<string | null>;
}) {
  const [total, setTotal] = useState('');
  const [paid, setPaid] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [joinedOn, setJoinedOn] = useState('');
  const [editAmounts, setEditAmounts] = useState(false);
  const [linkExisting, setLinkExisting] = useState(false);
  const [student, setStudent] = useState<DemoPerson | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<DemoPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Prefill the money from the link, and suggest the student account by phone tail.
  useEffect(() => {
    if (!open) return;
    setTotal(String(Number(link.final_fee) || 0));
    setPaid(String(Number(link.amount_paid) || 0));
    setDueDate(link.installment_2_due_date || '');
    setJoinedOn(link.payment_date && link.payment_date <= istToday() ? link.payment_date.slice(0, 10) : istToday());
    setEditAmounts(false);
    setError(null);
    setTouched(false);
    setSaving(false);
    const tail = phoneTail(request.phone);
    if (tail.length < 4) {
      setLinkExisting(false);
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
          setLinkExisting(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, link.final_fee, link.amount_paid, link.installment_2_due_date, link.payment_date, request.phone, request.user_id]);

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(joinedOn)) return 'Pick the day they paid and joined.';
    if (joinedOn > istToday()) return 'The joining day cannot be in the future.';
    if (linkExisting && !student) return 'Pick the student account, or turn off the toggle.';
    return null;
  }, [totalNum, paidNum, joinedOn, linkExisting, student]);

  const submit = async () => {
    setTouched(true);
    if (fieldError) {
      setError(fieldError);
      return;
    }
    setSaving(true);
    setError(null);
    const err = await onSubmit({
      action: 'finalise_enrolment',
      linkId: link.id,
      // Unchanged amounts are left to the link, so the server keeps what staff entered.
      ...(editAmounts ? { totalFee: totalNum, amountPaid: paidNum } : {}),
      installment2DueDate: partPaid && dueDate ? dueDate : null,
      joinedOn,
      mode: linkExisting ? 'fold_parent' : 'create',
      studentUserId: linkExisting ? student?.id : undefined,
    });
    setSaving(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth aria-labelledby="finalise-title">
      <DialogTitle id="finalise-title" sx={{ fontWeight: 700 }}>
        Confirm and enrol {request.name}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The fee below was already entered on the enrolment link. Confirming records it, enrols the student, and stops the desk from asking for
          the form again. Next you can create their class login in one click.
        </Typography>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="caption" color="text.secondary" component="p">
              Fee on the link
            </Typography>
            <Typography variant="body1" fontWeight={700}>
              {editAmounts
                ? partPaid
                  ? `${formatRupees(paidNum)} of ${formatRupees(totalNum)} paid, ${formatRupees(balance)} due`
                  : `${formatRupees(paidNum)} paid in full`
                : linkMoneyLine(link)}
            </Typography>
          </Box>
          {!editAmounts && (
            <Button onClick={() => setEditAmounts(true)} sx={{ minHeight: 44, textTransform: 'none' }}>
              Amounts wrong? Change them
            </Button>
          )}
        </Box>

        {editAmounts && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 }}>
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
        )}

        <TextField
          label="Paid and joined on"
          type="date"
          value={joinedOn}
          onChange={(e) => setJoinedOn(e.target.value)}
          required
          fullWidth
          sx={{ mt: 2 }}
          InputLabelProps={{ shrink: true }}
          inputProps={{ max: istToday() }}
          InputProps={{ sx: { minHeight: 48 } }}
          helperText="The Enrolled date on the desk and in People. For a student who paid earlier, pick the day they actually paid."
        />

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

        <FormControlLabel
          sx={{ mt: 2, alignItems: 'flex-start' }}
          control={<Switch checked={linkExisting} onChange={(e) => setLinkExisting(e.target.checked)} sx={{ mt: -0.5 }} />}
          label={
            <Box sx={{ py: 0.5 }}>
              <Typography variant="body2" fontWeight={600}>
                This student already has a Neram account
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Pick it so the fee goes on that account and no new account is made. The demo&apos;s parent/lead account is folded into it.
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
                Links this demo to {student.name || 'the chosen student'} and folds {request.name}&apos;s account into it (phone and email kept as
                family contact). This can be undone within 30 days.
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
          {saving ? 'Enrolling' : 'Confirm and enrol'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
