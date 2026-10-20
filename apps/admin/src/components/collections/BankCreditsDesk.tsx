'use client';

/**
 * Collections › Bank credits: the Instant UPI desk.
 *
 * Top to bottom, in the order staff should act:
 *   1. Held orders: a bank credit matched an order but policy wants a person to
 *      look (above the cap, or one channel only). Confirm enrols; Reject tells the student.
 *   2. Unmatched credits: money arrived with no order. Assign it to a student's
 *      open request (same fulfilment as an automatic match) or mark it "not a fee".
 *   3. Disputed payments: resolve either way.
 *   4. Tick list: auto-confirmed payments to find in the statement.
 *   5. Shadow matches: what Instant UPI would have confirmed while in shadow mode.
 * The strip at the top shows the mode, each watcher's last heartbeat and the outbox.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Skeleton,
  TextField,
  Tooltip,
  Typography,
} from '@neram/ui';
import RefreshIcon from '@mui/icons-material/Refresh';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import PhoneAndroidOutlinedIcon from '@mui/icons-material/PhoneAndroidOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { formatPaise } from '@neram/database/paise';
import type { BankCreditEventRow } from '@neram/database';
import type { CreditsDesk, DeskAttempt, DeskIntent, CreditTwin, PaymentWatchersSettings } from '@neram/database/payments';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { StatusChip, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import { dateTime } from '@/components/payments/PaymentClaimParts';

type DeskData = CreditsDesk & { watchers: PaymentWatchersSettings };

type UnmatchedCredit = BankCreditEventRow & { twin?: CreditTwin | null };

type DialogState =
  | { kind: 'assign'; credit: UnmatchedCredit }
  | { kind: 'ignore'; credit: UnmatchedCredit }
  | { kind: 'confirm'; row: DeskAttempt }
  | { kind: 'reject'; row: DeskAttempt }
  | { kind: 'dispute'; row: DeskAttempt }
  | { kind: 'resolve'; row: DeskAttempt };

const buttonSx = { textTransform: 'none', fontWeight: 600, boxShadow: 'none', ...TARGET_44 } as const;

const sourceIcon = (source: string) => (source.startsWith('email') ? MailOutlineIcon : PhoneAndroidOutlinedIcon);
const sourceName = (source: string) => (source.startsWith('email') ? 'Gmail script' : `Phone ${source.replace(/^sms:/, '')}`);
const ago = (minutes: number) => (minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`);

function creditLine(c: BankCreditEventRow) {
  const who = c.payer_name || c.payer_vpa || 'payer unknown';
  const via = (c.sources || [c.source]).join(' + ');
  return `${who} · UTR ${c.utr || 'none'} · ${dateTime(c.credited_at)} · via ${via}`;
}

export default function BankCreditsDesk() {
  const { supabaseUserId } = useAdminProfile();
  const [data, setData] = useState<DeskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [intentId, setIntentId] = useState('');
  const [force, setForce] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [outcome, setOutcome] = useState<'keep' | 'reverse'>('keep');
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/credits', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the bank credits.');
      setData(json);
    } catch (e: any) {
      setError(e?.message || 'Could not load the bank credits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (d: DialogState) => {
    setDialog(d);
    setDialogError(null);
    setNote('');
    setForce(false);
    setTicked(false);
    setOutcome('keep');
    // Never preselect a student: a one-click Assign on the wrong credit enrols someone who did not pay.
    if (d.kind === 'assign') setIntentId('');
  };

  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, adminId: supabaseUserId }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(json.error || 'Could not do that.');
      err.code = json.code;
      err.detail = json;
      throw err;
    }
    return json;
  };

  const submitDialog = async () => {
    if (!dialog) return;
    setBusy(true);
    setDialogError(null);
    try {
      if (dialog.kind === 'assign') await post(`/api/payments/credits/${dialog.credit.id}`, { action: 'assign', intentId, force });
      else if (dialog.kind === 'ignore') await post(`/api/payments/credits/${dialog.credit.id}`, { action: 'ignore', reason: note });
      else if (dialog.kind === 'confirm') await post(`/api/payments/attempts/${dialog.row.attempt.id}`, { action: 'confirm', statementChecked: ticked, note });
      else if (dialog.kind === 'reject') await post(`/api/payments/attempts/${dialog.row.attempt.id}`, { action: 'reject', note });
      else if (dialog.kind === 'dispute') await post(`/api/payments/attempts/${dialog.row.attempt.id}`, { action: 'dispute', note });
      else if (dialog.kind === 'resolve') await post(`/api/payments/attempts/${dialog.row.attempt.id}`, { action: 'resolve', outcome, note });
      setNotice(DONE_NOTICE[dialog.kind]);
      setDialog(null);
      await load();
    } catch (e: any) {
      if (e?.code === 'AMOUNT_MISMATCH') {
        setDialogError(`The credit is ${formatPaise(e.detail.creditPaise)} but this request is for ${formatPaise(e.detail.intentPaise)}. Tick "assign anyway" if you are sure.`);
      } else setDialogError(e?.message || 'Could not do that.');
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async (row: DeskAttempt) => {
    setQuickBusy(row.attempt.id);
    setNotice(null);
    try {
      await post(`/api/payments/attempts/${row.attempt.id}`, { action: 'reconcile' });
      setNotice('Ticked. It no longer shows here.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not tick it.');
    } finally {
      setQuickBusy(null);
    }
  };

  const health = data?.health;
  const silentAfter = health?.policy.silentAfterMinutes ?? 10;

  if (loading && !data) {
    return (
      <Box aria-busy="true" aria-label="Loading the bank credits">
        <Skeleton variant="rounded" height={56} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={120} />
      </Box>
    );
  }

  return (
    <Box data-testid="bank-credits-desk">
      {/* Health strip */}
      <Paper variant="outlined" sx={{ borderRadius: 1, px: 2, py: 1.5, mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        {health && (
          <>
            {health.mode === 'live' ? (
              <StatusChip icon={BoltOutlinedIcon} label="Instant UPI live" tone="success" />
            ) : health.mode === 'shadow' ? (
              <StatusChip icon={VisibilityOutlinedIcon} label="Shadow mode: matches are held for you" tone="info" />
            ) : (
              <StatusChip icon={PauseCircleOutlineIcon} label="Instant UPI off" tone="neutral" />
            )}
            {health.sources.length === 0 ? (
              <StatusChip icon={ReportProblemOutlinedIcon} label="No watcher has reported yet" tone="warning" />
            ) : (
              health.sources.map((s) => (
                <StatusChip key={s.source} icon={sourceIcon(s.source)} label={`${sourceName(s.source)} · ${ago(s.minutesAgo)}`} tone={s.minutesAgo <= silentAfter ? 'success' : 'warning'} />
              ))
            )}
            {health.outbox.dead > 0 && <StatusChip icon={ReportProblemOutlinedIcon} label={`${health.outbox.dead} stuck ${health.outbox.dead === 1 ? 'job' : 'jobs'}`} tone="error" />}
            {health.outbox.pending > 0 && <StatusChip icon={PendingActionsOutlinedIcon} label={`${health.outbox.pending} queued`} tone="neutral" />}
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button component={Link} href="/settings#instant-upi" size="small" startIcon={<SettingsOutlinedIcon />} sx={{ ...buttonSx, ...FOCUS_RING }}>
          Settings
        </Button>
        <Tooltip title="Refresh">
          <span>
            <IconButton onClick={load} disabled={loading} aria-label="Refresh the bank credits" sx={{ ...TARGET_44, minWidth: 44, ...FOCUS_RING }}>
              {loading ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      {data && (
        <>
          <Section icon={PendingActionsOutlinedIcon} title="Needs your confirmation" count={data.held.length} tone="warning" empty="Nothing is held. Credits under the cap confirm on their own." testId="desk-held">
            {data.held.map((row) => (
              <Row
                key={row.attempt.id}
                primary={`${row.student.name || 'Student'} · ${formatPaise(row.attempt.amount_paise)}`}
                secondary={[
                  row.reason ? `Held: ${row.reason}` : 'Held for a look',
                  row.credit ? creditLine(row.credit) : 'No credit attached yet',
                  `${purposeLabel(row.intent?.purpose)} · order ${row.attempt.id.slice(0, 8)} · ${dateTime(row.attempt.created_at)}`,
                ]}
                actions={
                  <>
                    <Button variant="contained" startIcon={<CheckCircleOutlineIcon />} onClick={() => open({ kind: 'confirm', row })} sx={buttonSx}>
                      Confirm
                    </Button>
                    <Button variant="outlined" color="inherit" onClick={() => open({ kind: 'reject', row })} sx={buttonSx}>
                      Reject
                    </Button>
                  </>
                }
              />
            ))}
          </Section>

          <Section icon={HelpOutlineIcon} title="Unmatched bank credits" count={data.unmatched.length} tone="warning" empty="Every credit in the last 30 days is matched or marked." testId="desk-unmatched">
            {data.unmatched.map((c) => (
              <Row
                key={c.id}
                primary={formatPaise(c.amount_paise)}
                secondary={[creditLine(c), twinLine(c.twin), c.raw_redacted ? c.raw_redacted.slice(0, 140) : '']}
                actions={
                  <>
                    <Button variant="contained" onClick={() => open({ kind: 'assign', credit: c })} sx={buttonSx} disabled={!data.openIntents.length}>
                      Assign to a student
                    </Button>
                    <Button variant="outlined" color="inherit" onClick={() => open({ kind: 'ignore', credit: c })} sx={buttonSx}>
                      Not a fee
                    </Button>
                  </>
                }
              />
            ))}
          </Section>

          <Section icon={GavelOutlinedIcon} title="Disputed" count={data.disputed.length} tone="error" empty="No open disputes." testId="desk-disputed">
            {data.disputed.map((row) => (
              <Row
                key={row.attempt.id}
                primary={`${row.student.name || 'Student'} · ${formatPaise(row.attempt.amount_paise)}`}
                secondary={[row.attempt.review_note ? `Why: ${row.attempt.review_note}` : '', row.credit ? creditLine(row.credit) : '', `${purposeLabel(row.intent?.purpose)} · ${dateTime(row.attempt.created_at)}`]}
                actions={
                  <Button variant="contained" onClick={() => open({ kind: 'resolve', row })} sx={buttonSx}>
                    Resolve
                  </Button>
                }
              />
            ))}
          </Section>

          <Section icon={CheckCircleOutlineIcon} title="Tick against the statement" count={data.toConfirm.length} tone="info" empty="Every auto-confirmed payment is ticked." testId="desk-confirm">
            {data.toConfirm.map((row) => (
              <Row
                key={row.attempt.id}
                primary={`${row.student.name || 'Student'} · ${formatPaise(row.attempt.amount_paise)}`}
                secondary={[
                  row.credit ? creditLine(row.credit) : `UTR ${row.attempt.utr || 'none'}`,
                  `${purposeLabel(row.intent?.purpose)} · ${row.payment?.receipt_number ? `receipt ${row.payment.receipt_number}` : 'receipt pending'} · ${dateTime(row.attempt.created_at)}`,
                ]}
                actions={
                  <>
                    <Button variant="contained" startIcon={quickBusy === row.attempt.id ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />} disabled={quickBusy === row.attempt.id} onClick={() => reconcile(row)} sx={buttonSx}>
                      Seen in statement
                    </Button>
                    <Button variant="outlined" color="inherit" onClick={() => open({ kind: 'dispute', row })} sx={buttonSx}>
                      Not in statement
                    </Button>
                  </>
                }
              />
            ))}
          </Section>

          <Section icon={VisibilityOutlinedIcon} title="Shadow matches (would have confirmed)" count={data.shadow.length} tone="neutral" empty="No shadow matches in the last two weeks." testId="desk-shadow">
            {data.shadow.map((c) => (
              <Row
                key={c.id}
                primary={`${formatPaise(c.amount_paise)} → ${c.student?.name || 'order'} ${c.attempt ? c.attempt.id.slice(0, 8) : ''}`}
                secondary={[creditLine(c), c.attempt ? `Order state now: ${c.attempt.state}. Verify this student the usual way.` : '']}
              />
            ))}
          </Section>
        </>
      )}

      {/* Dialogs */}
      <Dialog open={!!dialog} onClose={() => (busy ? undefined : setDialog(null))} fullWidth maxWidth="sm" aria-labelledby="desk-dialog-title">
        {dialog && (
          <>
            <DialogTitle id="desk-dialog-title" sx={{ fontWeight: 700 }}>
              {TITLE[dialog.kind]}
            </DialogTitle>
            <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
              {dialogError && (
                <Alert severity="error" role="alert">
                  {dialogError}
                </Alert>
              )}
              {dialog.kind === 'assign' && (
                <>
                  <Typography variant="body2">
                    {formatPaise(dialog.credit.amount_paise)}: {creditLine(dialog.credit)}
                  </Typography>
                  {dialog.credit.twin && <Alert severity="warning">{twinLine(dialog.credit.twin)} If so, mark this one as not a fee instead of assigning it.</Alert>}
                  <TextField select label="Student's open payment request" value={intentId} onChange={(e) => setIntentId(e.target.value)} fullWidth helperText="Pick the student. Closest amounts first. They are enrolled, or the balance recorded, as soon as you assign.">
                    <MenuItem value="" disabled>
                      Choose a student
                    </MenuItem>
                    {rankIntents(data?.openIntents || [], Number(dialog.credit.amount_paise)).map((i) => (
                      <MenuItem key={i.id} value={i.id}>
                        {i.student.name || 'Unnamed'} · {formatPaise(i.amountPaise)} · {purposeLabel(i.purpose)}
                        {i.student.phone ? ` · ${i.student.phone}` : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                  {mismatch(data?.openIntents || [], intentId, Number(dialog.credit.amount_paise)) && (
                    <>
                      <Alert severity="warning">The amounts do not agree. Assigning records the difference on the payment for the accounts team.</Alert>
                      <FormControlLabel control={<Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} />} label="Assign anyway" />
                    </>
                  )}
                </>
              )}
              {dialog.kind === 'ignore' && (
                <TextField label="Why is this not a fee?" value={note} onChange={(e) => setNote(e.target.value)} fullWidth required autoFocus helperText="For example: rent, a refund returned, a duplicate alert." />
              )}
              {dialog.kind === 'confirm' && (
                <>
                  <Typography variant="body2">
                    {dialog.row.student.name || 'Student'} paid {formatPaise(dialog.row.attempt.amount_paise)}.
                    {dialog.row.credit ? ` Bank credit: ${creditLine(dialog.row.credit)}.` : ''}
                  </Typography>
                  <FormControlLabel control={<Checkbox checked={ticked} onChange={(e) => setTicked(e.target.checked)} />} label="I found this credit in the bank statement or the KVB app" />
                  <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
                </>
              )}
              {dialog.kind === 'reject' && (
                <TextField label="Why?" value={note} onChange={(e) => setNote(e.target.value)} fullWidth required autoFocus helperText="The student receives this. Five words or more." />
              )}
              {dialog.kind === 'dispute' && (
                <TextField label="What did you find?" value={note} onChange={(e) => setNote(e.target.value)} fullWidth required autoFocus helperText="For example: not in the 20 Oct statement. Staff are told; access is removed only by hand after the founder confirms." />
              )}
              {dialog.kind === 'resolve' && (
                <>
                  <TextField select label="Outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as 'keep' | 'reverse')} fullWidth>
                    <MenuItem value="keep">Found it: the payment stands and is ticked</MenuItem>
                    <MenuItem value="reverse">Not real: mark it reversed</MenuItem>
                  </TextField>
                  <TextField label={outcome === 'reverse' ? 'Why (required)' : 'Note (optional)'} value={note} onChange={(e) => setNote(e.target.value)} fullWidth required={outcome === 'reverse'} />
                </>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setDialog(null)} disabled={busy} sx={buttonSx}>
                Cancel
              </Button>
              <Button variant="contained" onClick={submitDialog} disabled={busy || (dialog.kind === 'assign' && !intentId) || (dialog.kind === 'confirm' && !ticked)} sx={buttonSx}>
                {busy ? <CircularProgress size={18} color="inherit" /> : ACTION[dialog.kind]}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

const TITLE: Record<DialogState['kind'], string> = {
  assign: 'Assign this credit to a student',
  ignore: 'Mark as not a fee',
  confirm: 'Confirm this payment',
  reject: 'Reject this payment',
  dispute: 'Not in the statement',
  resolve: 'Resolve the dispute',
};
const ACTION: Record<DialogState['kind'], string> = { assign: 'Assign', ignore: 'Mark', confirm: 'Confirm and enrol', reject: 'Reject', dispute: 'Dispute', resolve: 'Save' };
const DONE_NOTICE: Record<DialogState['kind'], string> = {
  assign: 'Assigned. The student is being enrolled and emailed.',
  ignore: 'Marked as not a fee.',
  confirm: 'Confirmed. The student is being enrolled and emailed.',
  reject: 'Rejected. The credit is back in Unmatched; tell the student by WhatsApp.',
  dispute: 'Disputed. It is in the Disputed list until resolved.',
  resolve: 'Resolved.',
};

const purposeLabel = (p: string | null | undefined) => (p === 'installment' ? 'Balance payment' : 'Enrolment');

/** The second alert of a payment that already matched (SMS + Google Pay land minutes apart). */
const twinLine = (twin: CreditTwin | null | undefined) => (twin ? `Looks like the second alert for a payment already matched (order ${twin.attemptId.slice(0, 8)}).` : '');

function rankIntents(intents: DeskIntent[], paise: number) {
  return [...intents].sort((a, b) => Math.abs(a.amountPaise - paise) - Math.abs(b.amountPaise - paise) || (a.student.name || '').localeCompare(b.student.name || ''));
}

function mismatch(intents: DeskIntent[], intentId: string, paise: number) {
  const i = intents.find((x) => x.id === intentId);
  if (!i) return false;
  const diff = paise - i.amountPaise;
  return diff < 0 || diff > 99;
}

function Section({ icon: Icon, title, count, tone, empty, children, testId }: { icon: React.ElementType; title: string; count: number; tone: 'warning' | 'info' | 'error' | 'neutral'; empty: string; children: React.ReactNode; testId: string }) {
  const color = tone === 'warning' ? 'warning.main' : tone === 'error' ? 'error.main' : tone === 'info' ? 'info.main' : 'divider';
  return (
    <Paper variant="outlined" component="section" aria-label={title} data-testid={testId} sx={{ borderRadius: 1, mb: 2, overflow: 'hidden', borderColor: count ? color : 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.5 }}>
        <Icon aria-hidden sx={{ color: count ? color : 'text.secondary' }} />
        <Typography component="h2" variant="subtitle1" fontWeight={700}>
          {title}
        </Typography>
        <Chip size="small" label={count} aria-label={`${count} ${count === 1 ? 'item' : 'items'}`} sx={{ fontWeight: 700, minWidth: 28 }} />
      </Box>
      {count === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2 }}>
          {empty}
        </Typography>
      ) : (
        children
      )}
    </Paper>
  );
}

function Row({ primary, secondary, actions }: { primary: string; secondary: string[]; actions?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
        <Typography variant="body1" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {primary}
        </Typography>
        {secondary.filter(Boolean).map((line, i) => (
          <Typography key={i} variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {line}
          </Typography>
        ))}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}
