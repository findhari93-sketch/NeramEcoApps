'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { formatDueDate, formatRupees, istToday, OFFICE_PAYMENT_METHODS, paymentMethodLabel } from '@neram/database/fee-plan';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import ProfileDetailsFields, {
  EMPTY_PROFILE_DETAILS,
  lookupPincodePlace,
  profileDetailsFrom,
  profileDetailsUpdates,
  type ProfileDetailsValues,
} from '@/components/student/ProfileDetailsFields';
import {
  ASKING,
  CORRECTION_NOTE_MAX,
  buildCorrectionReport,
  correctionRowErrors,
  installmentChip,
  newCorrectionRow,
  planLabel,
  statusBanner,
  type CorrectionRowInput,
  type RecordCheckPage,
} from '@/lib/check-details-view';

/**
 * /student/check-details: "Check your details".
 *
 * The office filled in this student's form and fees in Admin and asked them,
 * through Neram Assistant, to check it. Personal details the student fixes here
 * directly (saved through PATCH /api/student/profile-completion, the single
 * writer). Fees are read-only: only the office changes money, so the student
 * either says All correct or Something is wrong, and a report goes to staff.
 *
 * Reached from the Assistant card, the Nexus bell and the dashboard banner. Back
 * goes to the dashboard. Ungated by feature flags (feature-flags.test.ts).
 * Mobile first: the answer buttons sit in a bar above the bottom navigation on
 * a phone and below the fees on a laptop.
 */

const CHECK_KEY = '/api/student/record-check';
const PROFILE_KEY = '/api/student/profile-completion';
const MAX_ROWS = 10;

let rowSeq = 0;
const nextKey = () => `row-${Date.now().toString(36)}-${(rowSeq += 1)}`;

export default function CheckDetailsPage() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const { tokenReady, getToken } = useNexusAuthContext();

  const {
    data: page,
    error: pageError,
    isLoading: pageLoading,
    mutate: mutatePage,
  } = useAuthSWR<RecordCheckPage>(tokenReady ? CHECK_KEY : null, { revalidateOnFocus: false });
  const hasCheck = !!page?.check;
  const { data: profile, mutate: mutateProfile } = useAuthSWR<any>(tokenReady && hasCheck ? PROFILE_KEY : null, {
    revalidateOnFocus: false,
  });

  // ── details ──
  const [values, setValues] = useState<ProfileDetailsValues>(EMPTY_PROFILE_DETAILS);
  const [dirty, setDirty] = useState(false);
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMessage, setDetailsMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const loadedProfile = useRef(false);

  useEffect(() => {
    if (profile && !loadedProfile.current) {
      loadedProfile.current = true;
      setValues(profileDetailsFrom(profile));
    }
  }, [profile]);

  const setField = useCallback((field: keyof ProfileDetailsValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    setDetailsMessage(null);
  }, []);

  const lookupPincode = useCallback(async (code: string) => {
    setPincodeLoading(true);
    const place = await lookupPincodePlace(code);
    if (place) {
      setValues((prev) => ({
        ...prev,
        ...(place.city ? { city: place.city } : {}),
        ...(place.district ? { district: place.district } : {}),
        ...(place.state ? { state: place.state } : {}),
      }));
    }
    setPincodeLoading(false);
  }, []);

  const saveDetails = async () => {
    setSavingDetails(true);
    setDetailsMessage(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Your session has ended. Sign in again.');
      const res = await fetch(PROFILE_KEY, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(profileDetailsUpdates(values, ['personal', 'academic', 'location'])),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save your details.');
      setDirty(false);
      setDetailsMessage({ tone: 'success', text: 'Saved. The office will see your changes.' });
      mutateProfile();
    } catch (err) {
      setDetailsMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save your details.' });
    } finally {
      setSavingDetails(false);
    }
  };

  // ── answers ──
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const post = async (body: Record<string, unknown>): Promise<RecordCheckPage> => {
    const token = await getToken();
    if (!token) throw new Error('Your session has ended. Sign in again.');
    const res = await fetch(CHECK_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Could not send that. Try again.');
    return data as RecordCheckPage;
  };

  const confirm = async () => {
    setConfirming(true);
    setActionError(null);
    try {
      const next = await post({ action: 'confirm' });
      await mutatePage(next, { revalidate: false });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not send that. Try again.');
    } finally {
      setConfirming(false);
    }
  };

  const status = page?.check?.status ?? null;
  const asking = !!status && ASKING.has(status);
  const banner = page ? statusBanner(page) : null;

  // ── render ──
  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2 }}>
      <IconButton component={Link} href="/student/dashboard" aria-label="Back to dashboard" sx={{ width: 48, height: 48, ml: -1.5 }}>
        <ArrowBackIcon />
      </IconButton>
      <Typography component="h1" variant="h5" sx={{ fontWeight: 800, fontSize: { xs: '1.375rem', sm: '1.5rem' } }}>
        Check your details
      </Typography>
    </Box>
  );

  if (!tokenReady || pageLoading) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto' }} aria-busy="true">
        {header}
        <Skeleton variant="text" width="80%" height={24} />
        <Skeleton variant="rounded" height={260} sx={{ mt: 2, borderRadius: 3 }} />
        <Skeleton variant="rounded" height={320} sx={{ mt: 2, borderRadius: 3 }} />
      </Box>
    );
  }

  if (pageError) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto' }}>
        {header}
        <Alert
          severity="error"
          action={
            <Button color="inherit" onClick={() => mutatePage()} sx={{ minHeight: 48 }}>
              Try again
            </Button>
          }
        >
          {pageError.message || 'Could not load your details.'}
        </Alert>
      </Box>
    );
  }

  if (!page?.check) {
    return (
      <Box sx={{ maxWidth: 640, mx: 'auto' }}>
        {header}
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, borderRadius: 3, textAlign: 'center' }}>
          <FactCheckOutlinedIcon aria-hidden sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography sx={{ fontWeight: 700, mt: 1 }}>Nothing to check right now.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            When the office asks you to check your details and fees, they will be here.
          </Typography>
          <Button component={Link} href="/student/dashboard" variant="outlined" sx={{ minHeight: 48 }}>
            Back to dashboard
          </Button>
        </Paper>
      </Box>
    );
  }

  const fees = page.fees;

  const answerButtons = (
    <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'row', md: 'row' } }}>
      <Button
        variant="outlined"
        startIcon={<ReportProblemOutlinedIcon aria-hidden />}
        onClick={() => {
          setActionError(null);
          setSheetOpen(true);
        }}
        disabled={confirming}
        sx={{ minHeight: 48, flex: { xs: 1, md: 'none' }, fontWeight: 700, whiteSpace: 'nowrap' }}
      >
        Something is wrong
      </Button>
      <Button
        variant="contained"
        startIcon={confirming ? <CircularProgress size={18} color="inherit" /> : <CheckCircleOutlineIcon aria-hidden />}
        onClick={confirm}
        disabled={confirming}
        sx={{ minHeight: 48, flex: { xs: 1, md: 'none' }, fontWeight: 700, whiteSpace: 'nowrap' }}
      >
        {confirming ? 'Sending...' : 'All correct'}
      </Button>
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', pb: asking && !isDesktop ? 9 : 0 }}>
      {header}
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        The office filled these in for you. Fix your details if anything is wrong, and tell us if a fee looks wrong.
      </Typography>

      {banner && (
        <Alert severity={banner.tone} role="status" sx={{ mb: 2, borderRadius: 2 }}>
          {banner.text}
        </Alert>
      )}

      {status === 'correction_reported' && fees?.openReport && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
          <Typography component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            What you told the office
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {fees.openReport.note}
          </Typography>
          {fees.openReport.items.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
              {fees.openReport.items.map((item, i) => (
                <Typography component="li" variant="body2" key={i}>
                  {formatRupees(item.amount)} on {formatDueDate(item.paidOn)} by {paymentMethodLabel(item.method)}
                  {item.reference ? ` (${item.reference})` : ''}
                </Typography>
              ))}
            </Box>
          )}
          <Button variant="text" onClick={() => setSheetOpen(true)} sx={{ minHeight: 44, mt: 1, px: 1 }}>
            Send a new report
          </Button>
        </Paper>
      )}

      {/* ── Your fees, first: checking them is why the student came ── */}
      <Paper component="section" aria-labelledby="your-fees" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, mb: 2 }}>
        <Typography id="your-fees" component="h2" variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Your fees
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', mb: 2 }}>
          <LockOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '2px', color: 'text.secondary' }} />
          <Typography variant="body2" color="text.secondary">
            Only the office can change fees. If something is wrong, tell us.
          </Typography>
        </Box>
        {fees ? <FeeSummary fees={fees} /> : null}
      </Paper>

      {/* ── Your details ── */}
      <Paper component="section" aria-labelledby="your-details" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, mb: 2 }}>
        <Typography id="your-details" component="h2" variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>
          Your details
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          You can change these yourself.
        </Typography>
        {!profile ? (
          <Box aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 2, borderRadius: 1 }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(['personal', 'academic', 'location'] as const).map((section) => (
              <ProfileDetailsFields
                key={section}
                section={section}
                values={values}
                onChange={setField}
                onPincodeComplete={(code) => {
                  setDirty(true);
                  lookupPincode(code);
                }}
                pincodeLoading={pincodeLoading}
                dense={false}
              />
            ))}
            <Box>
              <Button
                variant="outlined"
                onClick={saveDetails}
                disabled={!dirty || savingDetails}
                startIcon={savingDetails ? <CircularProgress size={18} color="inherit" /> : undefined}
                sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' }, fontWeight: 700 }}
              >
                {savingDetails ? 'Saving...' : 'Save my details'}
              </Button>
              {detailsMessage && (
                <Typography
                  variant="body2"
                  role={detailsMessage.tone === 'error' ? 'alert' : 'status'}
                  sx={{ mt: 1, color: detailsMessage.tone === 'error' ? 'error.main' : 'success.dark' }}
                >
                  {detailsMessage.text}
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Paper>

      {actionError && (
        <Alert severity="error" role="alert" sx={{ mb: 2, borderRadius: 2 }}>
          {actionError}
        </Alert>
      )}

      {/* Answers: inline on a laptop, a bar above the bottom navigation on a phone. */}
      {asking && isDesktop && <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>{answerButtons}</Box>}
      {asking && !isDesktop && (
        <Paper
          elevation={8}
          square
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            // The student bottom navigation is 64px tall and sits below md.
            bottom: 64,
            zIndex: (t) => t.zIndex.appBar - 1,
            px: 2,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ maxWidth: 560, mx: 'auto' }}>{answerButtons}</Box>
        </Paper>
      )}
      {status === 'confirmed' && (
        <Box sx={{ textAlign: { xs: 'center', md: 'right' }, mb: 3 }}>
          <Button variant="text" onClick={() => setSheetOpen(true)} sx={{ minHeight: 48 }}>
            Found something wrong later? Tell us
          </Button>
        </Box>
      )}

      <ReportSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmit={async (body) => {
          const next = await post({ action: 'report', ...body });
          await mutatePage(next, { revalidate: false });
          setSheetOpen(false);
        }}
      />
    </Box>
  );
}

// ─── the fee summary ─────────────────────────────────────────────────────────

function Row({ label, value, strong, extra }: { label: string; value: string; strong?: boolean; extra?: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 2,
        py: 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body1" sx={{ fontWeight: strong ? 700 : 400 }}>
          {label}
        </Typography>
        {extra}
      </Box>
      <Typography
       
        variant="body1"
        sx={{ m: 0, fontWeight: strong ? 800 : 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function FeeSummary({ fees }: { fees: NonNullable<RecordCheckPage['fees']> }) {
  const now = useMemo(() => new Date(), []);
  if (fees.agreed === null) {
    return (
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        The office has not added your fee yet. If you have paid something, tell us below.
      </Alert>
    );
  }
  const later = fees.installments.filter((i) => i.number >= 2 && !i.waived);
  const showTotal = fees.assignedFee !== null && fees.discount > 0;

  return (
    <Box>
      <Box>
        {showTotal && <Row label="Total fee" value={formatRupees(fees.assignedFee as number)} />}
        {showTotal && <Row label="Discount" value={formatRupees(fees.discount)} />}
        <Row label={showTotal ? 'Fee after discount' : 'Total fee'} value={formatRupees(fees.agreed)} strong />
        <Row label="Plan" value={planLabel(fees.plan)} />
      </Box>

      <Divider sx={{ my: 1 }} />
      <Typography component="h3" sx={{ fontWeight: 700, mt: 1.5, mb: 0.5 }}>
        What you have paid
      </Typography>
      {fees.payments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          No payments recorded yet.
        </Typography>
      ) : (
        <Box>
          {fees.payments.map((p) => (
            <Row
              key={p.id}
              label={p.paidOn ? formatDueDate(p.paidOn) : 'Date not recorded'}
              value={formatRupees(p.amount)}
              extra={
                <Typography variant="body2" color="text.secondary">
                  {p.methodLabel}
                </Typography>
              }
            />
          ))}
          <Row label="Paid so far" value={formatRupees(fees.paidTotal)} strong />
        </Box>
      )}

      {later.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box>
            {later.map((inst) => {
              const chip = installmentChip(inst, now);
              return (
                <Row
                  key={inst.id}
                  label={inst.number === 2 ? 'Second installment' : `Installment ${inst.number}`}
                  value={formatRupees(inst.amount)}
                  extra={
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        Due by {formatDueDate(inst.dueDate)}
                      </Typography>
                      <Chip
                        size="small"
                        label={chip.label}
                        color={chip.tone === 'default' ? 'default' : chip.tone}
                        variant={chip.tone === 'success' ? 'filled' : 'outlined'}
                        icon={chip.tone === 'success' ? <CheckCircleOutlineIcon aria-hidden /> : undefined}
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  }
                />
              );
            })}
          </Box>
        </>
      )}

      <Divider sx={{ my: 1 }} />
      <Box>
        <Row
          label="Still to pay"
          value={formatRupees(fees.balance ?? 0)}
          strong
          extra={
            (fees.balance ?? 0) <= 0.01 ? (
              <Chip
                size="small"
                color="success"
                icon={<CheckCircleOutlineIcon aria-hidden />}
                label="All paid"
                sx={{ mt: 0.5, fontWeight: 600 }}
              />
            ) : null
          }
        />
      </Box>
    </Box>
  );
}

// ─── Something is wrong ──────────────────────────────────────────────────────

function ReportSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (body: { items: unknown[]; note: string }) => Promise<void>;
}) {
  const [rows, setRows] = useState<CorrectionRowInput[]>(() => [newCorrectionRow(nextKey())]);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = istToday();

  useEffect(() => {
    if (!open) return;
    setRows([newCorrectionRow(nextKey())]);
    setTouched({});
    setReference('');
    setNote('');
    setNoteTouched(false);
    setError(null);
  }, [open]);

  const update = (key: string, patch: Partial<CorrectionRowInput>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const touch = (id: string) => setTouched((prev) => ({ ...prev, [id]: true }));

  const submit = async () => {
    // Show every message at once on submit, not only the fields already left.
    const all: Record<string, boolean> = {};
    for (const r of rows) {
      all[`${r.key}:amount`] = true;
      all[`${r.key}:paidOn`] = true;
    }
    setTouched(all);
    setNoteTouched(true);
    const built = buildCorrectionReport({ rows, reference, note }, today);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(built.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const noteError = noteTouched && !note.trim() ? 'Tell us what is wrong.' : null;

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      disableClose={busy}
      title="What did you actually pay?"
      description="Add each payment you made, then tell us what is wrong. The office checks it against their records."
      actions={
        <>
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={submit}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
            sx={{ fontWeight: 700 }}
          >
            {busy ? 'Sending...' : 'Send to the office'}
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
        {rows.map((row, index) => {
          const errs = correctionRowErrors(row, today);
          const amountErr = touched[`${row.key}:amount`] ? errs.amount : undefined;
          const dateErr = touched[`${row.key}:paidOn`] ? errs.paidOn : undefined;
          return (
            <Paper key={row.key} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }} data-testid="correction-row">
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Payment {index + 1}
                </Typography>
                {rows.length > 1 && (
                  <IconButton
                    aria-label={`Remove payment ${index + 1}`}
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    sx={{ width: 48, height: 48, mr: -1 }}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                )}
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField
                  label="Amount"
                  value={row.amount}
                  onChange={(e) => update(row.key, { amount: e.target.value.replace(/[^\d.,]/g, '') })}
                  onBlur={() => touch(`${row.key}:amount`)}
                  error={!!amountErr}
                  helperText={amountErr}
                  fullWidth
                  inputProps={{ inputMode: 'decimal', autoComplete: 'off' }}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                />
                <TextField
                  label="Date you paid"
                  type="date"
                  value={row.paidOn}
                  onChange={(e) => update(row.key, { paidOn: e.target.value })}
                  onBlur={() => touch(`${row.key}:paidOn`)}
                  error={!!dateErr}
                  helperText={dateErr}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: today }}
                />
                <TextField
                  label="How you paid"
                  select
                  value={row.method}
                  onChange={(e) => update(row.key, { method: e.target.value })}
                  fullWidth
                >
                  {OFFICE_PAYMENT_METHODS.map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      {m.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
            </Paper>
          );
        })}

        {rows.length < MAX_ROWS && (
          <Box>
            <Button
              variant="text"
              startIcon={<AddIcon aria-hidden />}
              onClick={() => setRows((prev) => [...prev, newCorrectionRow(nextKey())])}
              sx={{ minHeight: 48 }}
            >
              Add another payment
            </Button>
          </Box>
        )}

        <TextField
          label="Reference (optional)"
          value={reference}
          onChange={(e) => setReference(e.target.value.slice(0, 100))}
          helperText="A UPI transaction or receipt number, if you have one."
          fullWidth
        />
        <TextField
          label="What is wrong?"
          required
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, CORRECTION_NOTE_MAX))}
          onBlur={() => setNoteTouched(true)}
          error={!!noteError}
          helperText={noteError || `${note.length} of ${CORRECTION_NOTE_MAX} characters`}
          multiline
          minRows={3}
          fullWidth
        />

        {error && (
          <Alert severity="error" role="alert" sx={{ borderRadius: 2 }}>
            {error}
          </Alert>
        )}
      </Box>
    </ResponsiveSheet>
  );
}
