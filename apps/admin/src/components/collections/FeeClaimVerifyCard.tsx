'use client';

/**
 * A balance payment to verify: an enrolled student paid their next installment
 * to the trust by UPI or bank transfer on the pay balance page and sent the UTR
 * and a screenshot. Staff match it with the bank statement, then Verify (records
 * the payment in Collections and emails a receipt) or Reject (emails the reason).
 *
 * Same layout as the enrolment-link card (direct-enrollment/VerifyPaymentCard),
 * through the shared parts in components/payments/PaymentClaimParts.
 */
import { useCallback, useEffect, useState } from 'react';
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
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
  useCopyToClipboard,
  Checkbox,
  FormControlLabel,
} from '@neram/ui';
import { alpha } from '@mui/material/styles';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import RefreshIcon from '@mui/icons-material/Refresh';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { formatDueDate, formatRupees } from '@neram/database/fee-plan';
import { whatsappDigits } from '@neram/database/student-pay';
import { OpsSkeleton as Skeleton } from '@/components/ops/OpsUi';
import { BankMatchHint, Dd, Dt, ProofPreview, dateTime, firstName, methodLabel } from '@/components/payments/PaymentClaimParts';
import {
  balanceAfterClaim,
  claimInstallmentLabel,
  rejectedMessage,
  verifiedMessage,
  type FeeClaimDetail,
} from '@/lib/fee-claims-view';

export type FeeClaimDecision = 'verify' | 'reject';

export default function FeeClaimVerifyCard({
  claimId,
  adminId,
  onChanged,
  onDone,
}: {
  claimId: string;
  /** Sent as a fallback for routes running without the middleware stamp. */
  adminId?: string | null;
  /** After a decision, with the line to show. */
  onChanged?: (decision: FeeClaimDecision, message: string) => void;
  /** The Done button under the result (closes the drawer). */
  onDone?: () => void;
}) {
  const { copied, copy } = useCopyToClipboard(2000);
  const [claim, setClaim] = useState<FeeClaimDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<FeeClaimDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ kind: FeeClaimDecision; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statementChecked, setStatementChecked] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [imgBroken, setImgBroken] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setImgBroken(false);
    try {
      const res = await fetch(`/api/fee-claims/${claimId}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the payment.');
      setClaim(json.data);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load the payment.');
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    setClaim(null);
    setDone(null);
    setError(null);
    load();
  }, [load]);

  const decide = async (decision: FeeClaimDecision) => {
    if (decision === 'reject' && reason.trim().length < 5) {
      setReasonError('Say what was wrong, at least 5 characters, so the student can fix it.');
      return;
    }
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/fee-claims/${claimId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          reason: decision === 'reject' ? reason.trim() : undefined,
          statementChecked: decision === 'verify' ? statementChecked : undefined,
          adminId: adminId || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.fieldErrors?.reason) setReasonError(json.fieldErrors.reason);
        throw new Error(json.error || 'Could not update the payment. Try again.');
      }
      const text =
        decision === 'verify'
          ? verifiedMessage({
              receiptNumber: json.data?.receiptNumber,
              emailedTo: json.data?.emailedTo,
              balanceAfter: typeof json.data?.balanceAfter === 'number' ? json.data.balanceAfter : null,
            })
          : rejectedMessage(claim?.studentName, json.data?.emailedTo);
      setDone({ kind: decision, text });
      setConfirmOpen(false);
      setRejectOpen(false);
      onChanged?.(decision, text);
    } catch (err: any) {
      setError(err?.message || 'Could not update the payment. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const tone = (t: any) => ({
    borderColor: t.palette.warning.main,
    bgcolor: alpha(t.palette.warning.main, 0.06),
  });

  // ── states ────────────────────────────────────────────────────────────────
  if (loading && !claim) {
    return (
      <Paper variant="outlined" sx={(t) => ({ p: 2, borderRadius: 2, borderWidth: 2, ...tone(t) })} aria-busy="true" aria-label="Loading the payment">
        <Skeleton variant="text" width={180} height={28} />
        <Skeleton variant="text" width={140} height={48} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 140px' }, gap: 2, mt: 1 }}>
          <Skeleton variant="rounded" height={110} />
          <Skeleton variant="rounded" height={110} />
        </Box>
        <Skeleton variant="rounded" height={96} sx={{ mt: 2 }} />
      </Paper>
    );
  }

  if (loadError || !claim) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" onClick={load} startIcon={<RefreshIcon />} sx={{ minHeight: 44, textTransform: 'none' }}>
            Try again
          </Button>
        }
      >
        {loadError || 'Could not load the payment.'}
      </Alert>
    );
  }

  if (done) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert
          severity={done.kind === 'verify' ? 'success' : 'info'}
          icon={done.kind === 'verify' ? <CheckCircleOutlineIcon /> : undefined}
          role="status"
        >
          {done.text}
        </Alert>
        {onDone && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="contained" onClick={onDone} sx={{ minHeight: 44, minWidth: 120, fontWeight: 700, textTransform: 'none', boxShadow: 'none' }}>
              Done
            </Button>
          </Box>
        )}
      </Box>
    );
  }

  if (claim.status !== 'pending') {
    return (
      <Alert
        severity="info"
        action={
          <Button color="inherit" onClick={load} startIcon={<RefreshIcon />} sx={{ minHeight: 44, textTransform: 'none' }}>
            Refresh
          </Button>
        }
      >
        {claim.status === 'verified'
          ? `This payment was already verified${claim.verifiedAt ? ` on ${dateTime(claim.verifiedAt)}` : ''}.`
          : claim.rejectionReason
            ? `This payment was rejected: ${claim.rejectionReason.replace(/[.\s]+$/, '')}.`
            : 'This payment is no longer waiting to be verified.'}
      </Alert>
    );
  }

  const name = claim.studentName || 'The student';
  const fee = claim.fee;
  const after = balanceAfterClaim(fee?.balance, claim.amount);
  const titleId = `fee-claim-${claimId}-title`;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby={titleId}
      sx={(t) => ({ borderRadius: 2, borderWidth: 2, overflow: 'hidden', ...tone(t) })}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.5 }}>
        <PendingActionsOutlinedIcon sx={{ color: 'warning.dark' }} aria-hidden />
        <Typography id={titleId} component="h3" variant="subtitle1" fontWeight={700} sx={{ flex: 1, minWidth: 0 }}>
          Balance payment to verify
        </Typography>
        <Tooltip title="Reload (the screenshot link lasts 10 minutes)">
          <span>
            <IconButton onClick={load} disabled={loading || busy !== null} aria-label="Reload the payment" sx={{ width: 44, height: 44 }}>
              {loading ? <CircularProgress size={18} /> : <RefreshIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1fr) 148px' }, gap: 2 }}>
        {/* Details */}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary">
            {name} paid
          </Typography>
          <Typography component="p" sx={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.2, mb: 0.5 }}>
            {formatRupees(claim.amount)}
          </Typography>
          <Chip
            size="small"
            label={claimInstallmentLabel(claim.installmentNumber)}
            sx={{ fontWeight: 600, mb: 1.5, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}
          />

          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', columnGap: 2, rowGap: 0.75, alignItems: 'center' }}>
            <Dt>Method</Dt>
            <Dd>{methodLabel(claim.method)}</Dd>

            <Dt>Proof</Dt>
            <Dd>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  icon={claim.proofChannel === 'whatsapp' ? <WhatsAppIcon /> : undefined}
                  label={claim.proofChannel === 'whatsapp' ? 'Screenshot on WhatsApp' : 'Screenshot uploaded'}
                  color={claim.proofChannel === 'whatsapp' ? 'success' : 'default'}
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
                {claim.proofChannel === 'whatsapp' && claim.studentPhone && (
                  <Button
                    size="small"
                    href={`https://wa.me/${whatsappDigits(claim.studentPhone) || ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    startIcon={<WhatsAppIcon />}
                    sx={{ minHeight: 36, textTransform: 'none', fontWeight: 600 }}
                  >
                    Open WhatsApp chat
                  </Button>
                )}
              </Box>
            </Dd>

            {claim.payerName && (
              <>
                <Dt>Paid from</Dt>
                <Dd>{claim.payerName}</Dd>
              </>
            )}

            <Dt>UTR</Dt>
            <Dd>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.95rem', overflowWrap: 'anywhere' }}>
                  {claim.utr || 'Not given'}
                </Box>
                {claim.utr && (
                  <Tooltip title={copied ? 'Copied' : 'Copy UTR'}>
                    <IconButton
                      onClick={() => copy(claim.utr || '')}
                      aria-label={copied ? 'UTR copied' : 'Copy UTR'}
                      sx={{ width: 44, height: 44, flexShrink: 0 }}
                    >
                      {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Dd>

            <Dt>Paid on</Dt>
            <Dd>{claim.paidOn ? formatDueDate(claim.paidOn) : 'Not given'}</Dd>

            {claim.submittedAt && (
              <>
                <Dt>Submitted</Dt>
                <Dd>{dateTime(claim.submittedAt)}</Dd>
              </>
            )}
            {claim.studentPhone && (
              <>
                <Dt>Phone</Dt>
                <Dd>{claim.studentPhone}</Dd>
              </>
            )}
            {claim.studentEmail && (
              <>
                <Dt>Email</Dt>
                <Dd>{claim.studentEmail}</Dd>
              </>
            )}
          </Box>
        </Box>

        {/* Screenshot */}
        <ProofPreview
          proofUrl={claim.proofUrl}
          broken={imgBroken}
          onBroken={() => setImgBroken(true)}
          onReload={load}
          studentName={name}
        />
      </Box>

      {/* The student's fee position, so staff see what this payment does */}
      <Box sx={{ mx: 2, mb: 2, p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography component="h4" variant="body2" fontWeight={700} sx={{ mb: 1 }}>
          Fee position
        </Typography>
        {!fee || fee.agreed === null ? (
          <Typography variant="body2" color="text.secondary">
            No fee is set for this student, so the payment cannot be checked against a balance. Add the fee first.
          </Typography>
        ) : (
          <Box
            component="dl"
            sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', columnGap: 2, rowGap: 0.5, '& dd': { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }}
          >
            <Dt>Agreed fee</Dt>
            <Dd>{formatRupees(fee.agreed)}</Dd>
            <Dt>Paid so far</Dt>
            <Dd>{formatRupees(fee.paidTotal)}</Dd>
            <Dt>Balance now</Dt>
            <Dd strong>
              {formatRupees(fee.balance ?? 0)}
              {fee.dueDate ? `, next due ${formatDueDate(fee.dueDate)}` : ''}
            </Dd>
            <Dt>This payment</Dt>
            <Dd strong>{formatRupees(claim.amount)}</Dd>
            {after !== null && (
              <>
                <Dt>Balance after</Dt>
                <Dd strong>{after <= 0.01 ? 'Fully paid' : formatRupees(after)}</Dd>
              </>
            )}
          </Box>
        )}
        {fee && fee.balance !== null && claim.amount - fee.balance > 0.01 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            This is more than the balance of {formatRupees(fee.balance)}. Check the fee before you verify.
          </Alert>
        )}
      </Box>

      <BankMatchHint />

      {error && !confirmOpen && !rejectOpen && (
        <Alert severity="error" role="alert" sx={{ mx: 2, mb: 1.5 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, px: 2, pb: 2, pt: 0.5, bgcolor: 'background.paper', flexWrap: 'wrap' }}>
        <Button
          variant="outlined"
          color="error"
          onClick={() => {
            setReason('');
            setReasonError(null);
            setError(null);
            setRejectOpen(true);
          }}
          disabled={busy !== null}
          sx={{ minHeight: 44, minWidth: 112, fontWeight: 600, textTransform: 'none' }}
        >
          Reject
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={() => {
            setError(null);
            setConfirmOpen(true);
          }}
          disabled={busy !== null}
          startIcon={<CheckIcon />}
          sx={{ minHeight: 44, minWidth: 160, fontWeight: 700, textTransform: 'none' }}
        >
          Verify payment
        </Button>
      </Box>

      {/* Verify confirm */}
      <Dialog open={confirmOpen} onClose={busy ? undefined : () => setConfirmOpen(false)} maxWidth="xs" fullWidth aria-labelledby={`${titleId}-confirm`}>
        <DialogTitle id={`${titleId}-confirm`} sx={{ fontWeight: 700 }}>
          Verify {formatRupees(claim.amount)} from {firstName(claim.studentName)}?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This records the payment in Collections and emails a receipt.
          </Typography>
          <FormControlLabel
            sx={{ mt: 2, alignItems: 'flex-start', mr: 0 }}
            control={<Checkbox checked={statementChecked} onChange={(e) => setStatementChecked(e.target.checked)} sx={{ mt: -0.75 }} inputProps={{ 'aria-describedby': 'statement-tick-help' }} />}
            label={
              <Typography variant="body2">
                I found <strong>{formatRupees(claim.amount)}</strong> in the bank statement{claim.utr ? ` with UTR ${claim.utr}` : ''}.
              </Typography>
            }
          />
          <Typography id="statement-tick-help" variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
            Screenshots are easy to fake. The statement or the GPay history is the proof.
          </Typography>
          {error && (
            <Alert severity="error" role="alert" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy !== null} sx={{ minHeight: 44, textTransform: 'none' }}>
            Go back
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={() => decide('verify')}
            disabled={busy !== null || !statementChecked}
            startIcon={busy === 'verify' ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{ minHeight: 44, minWidth: 140, fontWeight: 700, textTransform: 'none' }}
          >
            {busy === 'verify' ? 'Recording' : 'Verify and record'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject with a reason */}
      <Dialog open={rejectOpen} onClose={busy ? undefined : () => setRejectOpen(false)} maxWidth="sm" fullWidth aria-labelledby={`${titleId}-reject`}>
        <DialogTitle id={`${titleId}-reject`} sx={{ fontWeight: 700 }}>
          Reject this payment?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {firstName(claim.studentName)} gets an email with your reason and can submit the payment again from the pay balance page.
          </Typography>
          <TextField
            label="Reason (the student sees this)"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(null);
            }}
            required
            fullWidth
            multiline
            minRows={3}
            autoFocus
            placeholder="For example: No credit with this UTR in our bank statement. Check the 12-digit UTR in your UPI app."
            error={Boolean(reasonError)}
            helperText={reasonError || ' '}
            inputProps={{ maxLength: 500 }}
          />
          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setRejectOpen(false)} disabled={busy !== null} sx={{ minHeight: 44, textTransform: 'none' }}>
            Go back
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => decide('reject')}
            disabled={busy !== null}
            startIcon={busy === 'reject' ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ minHeight: 44, minWidth: 140, fontWeight: 700, textTransform: 'none' }}
          >
            {busy === 'reject' ? 'Rejecting' : 'Reject payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
