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
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SendIcon from '@mui/icons-material/Send';
import {
  OFFICE_PAYMENT_METHODS,
  validatePlan,
  formatRupees,
  formatDueDate,
  istToday,
  type FeeView,
  type FeePlanInput,
  type PaymentLineInput,
} from '@neram/database/fee-plan';
import ApplicationDetailsFields, {
  EMPTY_DETAILS,
  detailsFormFromLead,
  detailsUpdatesFromForm,
  type ApplicationDetailsForm,
} from '@/components/crm/ApplicationDetailsFields';
import { checkStatusLabel } from './fee-labels';

export interface PrefillPaymentLine {
  amount: number;
  paidOn: string;
  method: string;
  reference?: string | null;
}

interface ApplicationAndFeesDialogProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  /** After any successful save. `message` is the line staff were shown. */
  onSaved?: (info: { message: string; sent: boolean }) => void;
  /** Accepting a student's fee report: their payments arrive as new lines. */
  prefillPaymentLines?: PrefillPaymentLine[];
  resolvesCorrectionId?: string | null;
}

interface LoadedData {
  student: { id: string; name: string | null; email: string | null; phone: string | null; academic_year: string | null; is_alumni: boolean | null };
  hasApplication: boolean;
  details: Record<string, any>;
  fees: {
    assignedFee: number | string | null;
    discount: number | string | null;
    scheme: 'full' | 'installment';
    installment1Amount: number | string | null;
    installment2Amount: number | string | null;
    installment2DueDate: string | null;
    hasFee: boolean;
  };
  view: FeeView;
  latestCheck: { status: string; sent_at: string | null; confirmed_at: string | null } | null;
  openReport: { id: string } | null;
}

interface PlanForm {
  assignedFee: string;
  discount: string;
  scheme: 'full' | 'installment';
  installment1Amount: string;
  installment2Amount: string;
  installment2DueDate: string;
}

interface LineForm {
  key: string;
  amount: string;
  paidOn: string;
  method: string;
  reference: string;
}

const EMPTY_PLAN: PlanForm = {
  assignedFee: '',
  discount: '',
  scheme: 'full',
  installment1Amount: '',
  installment2Amount: '',
  installment2DueDate: '',
};

const FIELD_SX = { '& .MuiOutlinedInput-root': { borderRadius: 0.75 } };
const OVERLINE_SX = { fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 } as const;

function newKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Older browsers: a v4-shaped id is enough for an idempotency key.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function asText(v: unknown): string {
  return v === null || v === undefined ? '' : String(Number(v) || v);
}

function toNumber(v: string): number | null {
  const s = String(v ?? '').replace(/[,\s₹]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function emptyLine(): LineForm {
  return { key: newKey(), amount: '', paidOn: istToday(), method: 'upi_direct', reference: '' };
}

/**
 * Fill in a student's application form and fees together, then send it to the
 * student to check in Nexus.
 *
 * Desktop-first, two columns: the form on the left, a sticky summary of what the
 * student will see on the right. Validation is the shared validatePlan, run on
 * blur and again before saving, so the errors here are the ones the server
 * would give.
 */
export default function ApplicationAndFeesDialog({
  userId,
  open,
  onClose,
  onSaved,
  prefillPaymentLines,
  resolvesCorrectionId,
}: ApplicationAndFeesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState<LoadedData | null>(null);
  const [details, setDetails] = useState<ApplicationDetailsForm>(EMPTY_DETAILS);
  const [plan, setPlan] = useState<PlanForm>(EMPTY_PLAN);
  const [lines, setLines] = useState<LineForm[]>([]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<null | 'save' | 'send'>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ message: string; ok: boolean } | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { keepSuccess?: boolean } = {}) => {
      if (!userId) return;
      setLoading(true);
      setLoadError('');
      if (!opts.keepSuccess) setSuccess(null);
      try {
        const res = await fetch(`/api/students/application-fees?userId=${encodeURIComponent(userId)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load the form.');
        const loaded = body as LoadedData;
        setData(loaded);
        setDetails(detailsFormFromLead(loaded.details));
        setPlan({
          assignedFee: asText(loaded.fees.assignedFee),
          discount: Number(loaded.fees.discount) ? asText(loaded.fees.discount) : '',
          scheme: loaded.fees.scheme,
          installment1Amount: asText(loaded.fees.installment1Amount),
          installment2Amount: asText(loaded.fees.installment2Amount),
          installment2DueDate: loaded.fees.installment2DueDate || '',
        });
      } catch (e: any) {
        setLoadError(e?.message || 'Could not load the form.');
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!open || !userId) return;
    setTouched({});
    setSubmitted(false);
    setServerErrors({});
    setError('');
    setSuccess(null);
    setResolvingId(resolvesCorrectionId ?? null);
    setLines(
      (prefillPaymentLines || []).map((p) => ({
        key: newKey(),
        amount: String(p.amount ?? ''),
        paidOn: p.paidOn || '',
        method: OFFICE_PAYMENT_METHODS.some((m) => m.value === p.method) ? p.method : 'manual',
        reference: p.reference || '',
      })),
    );
    void load();
  }, [open, userId, prefillPaymentLines, resolvesCorrectionId, load]);

  const view = data?.view ?? null;

  const planInput: FeePlanInput = useMemo(
    () => ({
      assignedFee: toNumber(plan.assignedFee),
      discount: toNumber(plan.discount) ?? 0,
      scheme: plan.scheme,
      installment1Amount: toNumber(plan.installment1Amount),
      installment2Amount: toNumber(plan.installment2Amount),
      installment2DueDate: plan.installment2DueDate || null,
    }),
    [plan],
  );

  const lineInputs: PaymentLineInput[] = useMemo(
    () =>
      lines.map((l) => ({
        key: l.key,
        amount: toNumber(l.amount) as number,
        paidOn: l.paidOn,
        method: l.method,
        reference: l.reference.trim() || null,
      })),
    [lines],
  );

  const check = useMemo(
    () =>
      validatePlan(planInput, lineInputs, {
        alreadyPaid: view?.paidTotal ?? 0,
        existing: (view?.payments || []).map((p) => ({ amount: p.amount, paidOn: p.paidOn })),
      }),
    [planInput, lineInputs, view],
  );

  const errorFor = (field: string): string | undefined => {
    if (serverErrors[field]) return serverErrors[field];
    if (!submitted && !touched[field]) return undefined;
    return check.errors.find((e) => e.field === field)?.message;
  };
  const blur = (field: string) => () => setTouched((t) => ({ ...t, [field]: true }));

  const setPlanField = (field: keyof PlanForm, value: string) => {
    setPlan((p) => {
      const next = { ...p, [field]: value } as PlanForm;
      // Fill the second installment when staff type the first, if it is still blank or was auto-filled.
      if (field === 'installment1Amount' || field === 'assignedFee' || field === 'discount') {
        const final = (toNumber(next.assignedFee) ?? 0) - (toNumber(next.discount) ?? 0);
        const i1 = toNumber(next.installment1Amount);
        const prevAuto =
          (toNumber(p.assignedFee) ?? 0) - (toNumber(p.discount) ?? 0) - (toNumber(p.installment1Amount) ?? 0);
        if (next.scheme === 'installment' && i1 !== null && final > i1 && (!p.installment2Amount || toNumber(p.installment2Amount) === prevAuto)) {
          next.installment2Amount = String(final - i1);
        }
      }
      return next;
    });
    setServerErrors((s) => {
      if (!s[field]) return s;
      const { [field]: _gone, ...rest } = s;
      return rest;
    });
  };

  const setLineField = (index: number, field: keyof LineForm, value: string) => {
    setLines((ls) => ls.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  // ── live summary ──
  const newReceived = lineInputs.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount || 0 : 0), 0);
  const received = (view?.paidTotal ?? 0) + newReceived;
  const agreed = check.finalFee ?? view?.agreed ?? null;
  const stillToCollect = agreed === null ? null : Math.max(0, agreed - received);
  const nextDueText = (() => {
    if (agreed === null) return 'Fill in the fee';
    if (!stillToCollect || stillToCollect <= 0.01) return 'Nothing, fully paid';
    if (plan.scheme === 'installment') {
      const i1 = toNumber(plan.installment1Amount) ?? 0;
      if (received + 0.01 < i1) return `${formatRupees(i1 - received)} (1st installment)`;
      if (plan.installment2DueDate) return `${formatRupees(stillToCollect)} on ${formatDueDate(plan.installment2DueDate)}`;
      return `${formatRupees(stillToCollect)}, no date yet`;
    }
    return `${formatRupees(stillToCollect)}, no date set`;
  })();

  const save = async (send: boolean) => {
    if (!userId) return;
    setSubmitted(true);
    setError('');
    setSuccess(null);
    const { updates, error: detailError } = detailsUpdatesFromForm(details, data?.details);
    if (detailError) {
      setError(detailError);
      return;
    }
    if (check.errors.length) {
      setError('Fix the highlighted fields first.');
      return;
    }
    setSaving(send ? 'send' : 'save');
    try {
      const res = await fetch('/api/students/application-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          details: updates,
          plan: planInput,
          payments: lineInputs,
          resolvesCorrectionId: resolvingId,
          send,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const map: Record<string, string> = {};
        for (const fe of body.fieldErrors || []) if (!map[fe.field]) map[fe.field] = fe.message;
        setServerErrors(map);
        throw new Error(body.error || 'Could not save.');
      }
      const delivery = body.delivery as { delivered: boolean; message: string } | null;
      const message = send && delivery ? (delivery.delivered ? `Saved. ${delivery.message}` : delivery.message) : 'Saved.';
      // The lines are recorded now; a fresh form starts with none.
      setLines([]);
      setTouched({});
      setSubmitted(false);
      setServerErrors({});
      setResolvingId(null);
      setSuccess({ message, ok: !send || Boolean(delivery?.delivered) });
      onSaved?.({ message, sent: Boolean(delivery?.delivered) });
      await load({ keepSuccess: true });
    } catch (e: any) {
      setError(e?.message || 'Could not save.');
    } finally {
      setSaving(null);
    }
  };

  const name = data?.student?.name || 'Student';
  const busy = saving !== null;
  const isNewApplication = data ? !data.hasApplication : false;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { borderRadius: 1.5 } }}
      aria-labelledby="application-fees-title"
    >
      <DialogTitle id="application-fees-title" sx={{ fontWeight: 700, fontSize: 18, pb: 0.5 }}>
        Application and fees{data ? `: ${name}` : ''}
        {data?.student?.academic_year && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {data.student.academic_year} batch
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {loading && !data ? (
          <Box sx={{ p: 3 }} aria-busy="true" aria-label="Loading the form">
            <Grid container spacing={3}>
              <Grid item xs={12} md={8}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} variant="rounded" height={40} sx={{ mb: 2 }} />
                ))}
              </Grid>
              <Grid item xs={12} md={4}>
                <Skeleton variant="rounded" height={260} />
              </Grid>
            </Grid>
          </Box>
        ) : loadError ? (
          <Box sx={{ p: 3 }}>
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => load()}>
                  Try again
                </Button>
              }
            >
              {loadError}
            </Alert>
          </Box>
        ) : (
          <Grid container>
            {/* ── left: the form ── */}
            <Grid item xs={12} md={8} sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {resolvingId && (
                <Alert severity="info" sx={{ borderRadius: 0.75 }}>
                  The student&apos;s payments are filled in below as new lines. Check them, then save. Their report is
                  marked accepted when this save succeeds.
                </Alert>
              )}
              {isNewApplication && (
                <Alert severity="info" sx={{ borderRadius: 0.75 }}>
                  This student has no application. Fill in what they told you. Nexus sets their class and exam year from
                  the current class and the target exam year.
                </Alert>
              )}

              <Typography variant="overline" sx={OVERLINE_SX} component="h3">
                Details
              </Typography>
              <ApplicationDetailsFields
                value={details}
                onChange={(field, value) => setDetails((d) => ({ ...d, [field]: value }))}
                isNew={isNewApplication}
                headings={false}
              />

              <Divider sx={{ my: 1 }} />
              <Typography variant="overline" sx={OVERLINE_SX} component="h3">
                Fees
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="Total coaching fee"
                    value={plan.assignedFee}
                    onChange={(e) => setPlanField('assignedFee', e.target.value)}
                    onBlur={blur('assignedFee')}
                    error={Boolean(errorFor('assignedFee'))}
                    helperText={errorFor('assignedFee') || ' '}
                    fullWidth
                    size="small"
                    required
                    inputProps={{ inputMode: 'numeric', 'data-testid': 'fee-total' }}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    sx={FIELD_SX}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Discount"
                    value={plan.discount}
                    onChange={(e) => setPlanField('discount', e.target.value)}
                    onBlur={blur('discount')}
                    error={Boolean(errorFor('discount'))}
                    helperText={errorFor('discount') || (check.finalFee !== null ? `Fee after discount: ${formatRupees(check.finalFee)}` : ' ')}
                    fullWidth
                    size="small"
                    inputProps={{ inputMode: 'numeric', 'data-testid': 'fee-discount' }}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    sx={FIELD_SX}
                  />
                </Grid>
              </Grid>

              <FormControl error={Boolean(errorFor('scheme'))}>
                <FormLabel id="fee-scheme-label" sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
                  How are they paying?
                </FormLabel>
                <RadioGroup
                  row
                  aria-labelledby="fee-scheme-label"
                  value={plan.scheme}
                  onChange={(e) => setPlanField('scheme', e.target.value)}
                >
                  <FormControlLabel value="full" control={<Radio />} label="Paid in full" sx={{ mr: 3, minHeight: 44 }} />
                  <FormControlLabel value="installment" control={<Radio />} label="Two installments" sx={{ minHeight: 44 }} />
                </RadioGroup>
                {errorFor('scheme') && <FormHelperText>{errorFor('scheme')}</FormHelperText>}
              </FormControl>

              {plan.scheme === 'installment' && (
                <Grid container spacing={2}>
                  <Grid item xs={4}>
                    <TextField
                      label="Installment 1"
                      value={plan.installment1Amount}
                      onChange={(e) => setPlanField('installment1Amount', e.target.value)}
                      onBlur={blur('installment1Amount')}
                      error={Boolean(errorFor('installment1Amount'))}
                      helperText={errorFor('installment1Amount') || ' '}
                      fullWidth
                      size="small"
                      inputProps={{ inputMode: 'numeric', 'data-testid': 'fee-installment-1' }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      sx={FIELD_SX}
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      label="Installment 2"
                      value={plan.installment2Amount}
                      onChange={(e) => setPlanField('installment2Amount', e.target.value)}
                      onBlur={blur('installment2Amount')}
                      error={Boolean(errorFor('installment2Amount'))}
                      helperText={errorFor('installment2Amount') || ' '}
                      fullWidth
                      size="small"
                      inputProps={{ inputMode: 'numeric', 'data-testid': 'fee-installment-2' }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                      sx={FIELD_SX}
                    />
                  </Grid>
                  <Grid item xs={4}>
                    <TextField
                      label="2nd installment due date"
                      type="date"
                      value={plan.installment2DueDate}
                      onChange={(e) => setPlanField('installment2DueDate', e.target.value)}
                      onBlur={blur('installment2DueDate')}
                      error={Boolean(errorFor('installment2DueDate'))}
                      helperText={errorFor('installment2DueDate') || 'Reminders start 3 days before'}
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ 'data-testid': 'fee-installment-2-due' }}
                      sx={FIELD_SX}
                    />
                  </Grid>
                </Grid>
              )}

              <Divider sx={{ my: 1 }} />
              <Typography variant="overline" sx={OVERLINE_SX} component="h3">
                Money received
              </Typography>

              {view && view.payments.length > 0 ? (
                <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                  <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <Box component="thead">
                      <Box component="tr" sx={{ '& th': { textAlign: 'left', px: 1.5, py: 1, color: 'text.secondary', fontWeight: 600, borderBottom: '1px solid', borderColor: 'divider' } }}>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>How</th>
                      </Box>
                    </Box>
                    <Box component="tbody">
                      {view.payments.map((p) => (
                        <Box component="tr" key={p.id} sx={{ '& td': { px: 1.5, py: 0.75, borderBottom: '1px solid', borderColor: 'grey.100' } }}>
                          <td>{p.paidOn ? formatDueDate(p.paidOn) : 'No date'}</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatRupees(p.amount)}</td>
                          <td>{p.methodLabel}</td>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Paper>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No payments recorded yet.
                </Typography>
              )}

              {lines.map((line, index) => {
                const at = `payments.${index}`;
                return (
                  <Paper key={line.key} variant="outlined" sx={{ p: 2, borderRadius: 1, borderStyle: 'dashed' }} data-testid="payment-line">
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                      <Typography variant="body2" fontWeight={600}>
                        New payment {lines.length > 1 ? index + 1 : ''}
                      </Typography>
                      <Tooltip title="Remove this payment">
                        <IconButton
                          aria-label={`Remove new payment ${index + 1}`}
                          onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
                          sx={{ width: 40, height: 40 }}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                    <Grid container spacing={2}>
                      <Grid item xs={3}>
                        <TextField
                          label="Amount"
                          value={line.amount}
                          onChange={(e) => setLineField(index, 'amount', e.target.value)}
                          onBlur={blur(`${at}.amount`)}
                          error={Boolean(errorFor(`${at}.amount`))}
                          helperText={errorFor(`${at}.amount`) || ' '}
                          fullWidth
                          size="small"
                          inputProps={{ inputMode: 'numeric' }}
                          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                          sx={FIELD_SX}
                        />
                      </Grid>
                      <Grid item xs={3}>
                        <TextField
                          label="Date received"
                          type="date"
                          value={line.paidOn}
                          onChange={(e) => setLineField(index, 'paidOn', e.target.value)}
                          onBlur={blur(`${at}.paidOn`)}
                          error={Boolean(errorFor(`${at}.paidOn`))}
                          helperText={errorFor(`${at}.paidOn`) || ' '}
                          fullWidth
                          size="small"
                          InputLabelProps={{ shrink: true }}
                          inputProps={{ max: istToday() }}
                          sx={FIELD_SX}
                        />
                      </Grid>
                      <Grid item xs={3}>
                        <TextField
                          select
                          label="How"
                          value={line.method}
                          onChange={(e) => setLineField(index, 'method', e.target.value)}
                          onBlur={blur(`${at}.method`)}
                          error={Boolean(errorFor(`${at}.method`))}
                          helperText={errorFor(`${at}.method`) || ' '}
                          fullWidth
                          size="small"
                          sx={FIELD_SX}
                        >
                          {OFFICE_PAYMENT_METHODS.map((m) => (
                            <MenuItem key={m.value} value={m.value}>
                              {m.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Grid>
                      <Grid item xs={3}>
                        <TextField
                          label="Reference"
                          value={line.reference}
                          onChange={(e) => setLineField(index, 'reference', e.target.value)}
                          helperText="UPI or bank reference"
                          fullWidth
                          size="small"
                          inputProps={{ maxLength: 100 }}
                          sx={FIELD_SX}
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                );
              })}

              <Box>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setLines((ls) => [...ls, emptyLine()])}
                  sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }}
                >
                  Add a payment
                </Button>
              </Box>

              {check.warnings.length > 0 && (
                <Alert severity="warning" sx={{ borderRadius: 0.75 }}>
                  {check.warnings.map((w) => (
                    <div key={w}>{w}</div>
                  ))}
                </Alert>
              )}
            </Grid>

            {/* ── right: sticky summary ── */}
            <Grid
              item
              xs={12}
              md={4}
              sx={{ bgcolor: 'grey.50', borderLeft: { md: '1px solid' }, borderColor: { md: 'divider' }, p: 3 }}
            >
              <Box sx={{ position: { md: 'sticky' }, top: 0 }} aria-live="polite">
                <Typography variant="overline" sx={OVERLINE_SX} component="h3">
                  What the student will see
                </Typography>
                <Stack spacing={1.25} sx={{ mt: 1 }} data-testid="fee-summary">
                  <SummaryRow label="Agreed" value={agreed === null ? 'Not set' : formatRupees(agreed)} strong />
                  <SummaryRow label="Received" value={formatRupees(received)} />
                  <SummaryRow
                    label="Still to collect"
                    value={stillToCollect === null ? 'Not set' : formatRupees(stillToCollect)}
                    strong
                  />
                  <SummaryRow label="Next due" value={nextDueText} />
                  <Divider />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      Check
                    </Typography>
                    <Chip
                      size="small"
                      label={checkStatusLabel(data?.latestCheck?.status ?? null)}
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>
                  {data?.openReport && !resolvingId && (
                    <Alert severity="warning" sx={{ borderRadius: 0.75, py: 0 }}>
                      The student reported a problem with their fees. Review it in Collections.
                    </Alert>
                  )}
                </Stack>
                {success && (
                  <Alert
                    severity={success.ok ? 'success' : 'info'}
                    icon={success.ok ? <CheckCircleOutlineIcon /> : undefined}
                    sx={{ mt: 2, borderRadius: 0.75 }}
                    role="status"
                  >
                    {success.message}
                  </Alert>
                )}
                {error && (
                  <Alert severity="error" sx={{ mt: 2, borderRadius: 0.75 }} role="alert">
                    {error}
                  </Alert>
                )}
              </Box>
            </Grid>
          </Grid>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none', fontWeight: 500, minHeight: 44 }}>
          {success ? 'Close' : 'Cancel'}
        </Button>
        <Button
          variant="outlined"
          onClick={() => save(false)}
          disabled={busy || loading || !data}
          startIcon={saving === 'save' ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, px: 2.5 }}
        >
          {saving === 'save' ? 'Saving' : 'Save'}
        </Button>
        <Button
          variant="contained"
          onClick={() => save(true)}
          disabled={busy || loading || !data}
          startIcon={saving === 'send' ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44, px: 2.5, boxShadow: 'none' }}
        >
          {saving === 'send' ? 'Saving and sending' : 'Save and send to student to check'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}
      >
        {value}
      </Typography>
    </Box>
  );
}
