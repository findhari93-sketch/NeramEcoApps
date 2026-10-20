'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, TextField, Checkbox, FormControlLabel, Alert, CircularProgress, ImageUploadField, useMediaQuery } from '@neram/ui';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import QrCode2Outlined from '@mui/icons-material/QrCode2Outlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import PhoneIphoneOutlined from '@mui/icons-material/PhoneIphoneOutlined';
import LockOutlined from '@mui/icons-material/LockOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import SaveAltOutlined from '@mui/icons-material/SaveAltOutlined';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import WhatsApp from '@mui/icons-material/WhatsApp';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import { getCurrentUser } from '@neram/auth';
import { buildUpiUri, officialQrFor, whatsappDigits, type PaymentQrCode } from '@neram/database/student-pay';
import { tokens as t, focusRing, CtaButton, errorColor, brandColors } from '@/design-system';
import type { PaymentDetailsData } from '@/components/apply/types';
import { rupees, formatDay, istTodayKey, type PaymentPayee } from './student-pay-types';
import InstantUpiPanel, { type InstantOrder, type InstantStatus } from './InstantUpiPanel';
import { useQrSvg, svgToPng, downloadBlob } from './qr-utils';

type Method = 'upi_direct' | 'bank_transfer';
type ProofChannel = 'upload' | 'whatsapp';

/** Instant UPI, offered when it is on and a watcher is alive. The parent owns the API calls. */
export interface InstantUpiOffer {
  orderMinutes: number;
  /** live: the bank alert enrols at once; shadow: staff confirm the match. */
  mode: 'live' | 'shadow';
  start: () => Promise<InstantOrder>;
  poll: (attemptId: string) => Promise<InstantStatus>;
  cancel: (attemptId: string) => Promise<void>;
  onDone: () => void;
}

interface PayStepProps {
  amount: number;
  scheme: 'full' | 'installment';
  balance: number | null;
  balanceDueDate: string | null;
  payee: PaymentPayee;
  /** Official QR images staff uploaded, one per exact amount. */
  qrCodes?: PaymentQrCode[];
  paymentNote: string;
  token: string;
  payment: PaymentDetailsData;
  updatePayment: (data: Partial<PaymentDetailsData>) => void;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
  phoneVerified: boolean;
  onSubmit: () => void;
  submitting: boolean;
  fieldErrors: Record<string, string>;
  /** For the WhatsApp message. */
  studentName?: string | null;
  /** Enrol links only: save the details and email how to pay. */
  onPayLater?: () => void;
  payLaterBusy?: boolean;
  /** Replaces the line under the amount (e.g. on the pay balance page). */
  amountNote?: string;
  /** The enrol form asks for the terms; a balance payment does not. Default true. */
  showTerms?: boolean;
  /** Method 1. Rendered above the manual path, which hides while an order is live. */
  instant?: InstantUpiOffer;
}

/**
 * The Pay step: pay the trust (UPI QR or bank transfer), then tell us you paid
 * with a screenshot on this page or on WhatsApp. The UTR is optional, because
 * many students do not know where to find it; staff match the bank statement.
 * Every amount shown comes from the server.
 */
export default function PayStep(props: PayStepProps) {
  const { amount, payee, paymentNote, payment, updatePayment, fieldErrors } = props;
  const method: Method = payment.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'upi_direct';
  const whatsappTo = whatsappDigits(payee.whatsappNumber);
  const channel: ProofChannel = payment.proofChannel === 'whatsapp' && whatsappTo ? 'whatsapp' : 'upload';
  // A choice saved while WhatsApp was offered must not be sent once it is not.
  useEffect(() => {
    if (payment.proofChannel === 'whatsapp' && !whatsappTo) updatePayment({ proofChannel: 'upload', whatsappSent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.proofChannel, whatsappTo]);
  const isPhone = useMediaQuery('(pointer: coarse) and (max-width: 900px)');
  const today = istTodayKey();

  const upiUri = useMemo(
    () => buildUpiUri({ vpa: payee.upiId, payeeName: payee.payeeName, amount, note: paymentNote }),
    [payee.upiId, payee.payeeName, amount, paymentNote],
  );
  const official = useMemo(() => officialQrFor(props.qrCodes || [], Math.round(amount * 100)), [props.qrCodes, amount]);

  // The fallback QR is drawn on the client from the server's amount; nothing is fetched.
  const qrSvg = useQrSvg(upiUri);
  // While an Instant UPI order is live the manual path hides (two QRs with two amounts would mislead).
  const [instantActive, setInstantActive] = useState(false);

  const [savingQr, setSavingQr] = useState(false);
  const [qrNote, setQrNote] = useState<string | null>(null);
  const saveQr = async () => {
    if (savingQr) return;
    setSavingQr(true);
    setQrNote(null);
    try {
      let blob: Blob | null = null;
      if (official) {
        const res = await fetch(official.url, { mode: 'cors' }).catch(() => null);
        if (res?.ok) blob = await res.blob();
      }
      if (!blob && qrSvg) blob = await svgToPng(qrSvg, 720);
      if (!blob) throw new Error('no image');
      downloadBlob(blob, `neram-pay-${Math.round(amount)}.png`);
      setQrNote('Saved to your phone. Open GPay or PhonePe, tap Scan, and pick it from your gallery or Downloads.');
    } catch {
      if (official) window.open(official.url, '_blank');
      else setQrNote('Could not save it here. Take a screenshot of the QR and scan that from your gallery.');
    } finally {
      setSavingQr(false);
    }
  };

  const uploadProof = async (file: File): Promise<{ url: string }> => {
    const idToken = await getCurrentUser()?.getIdToken();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('token', props.token);
    const res = await fetch('/api/enroll/upload-proof', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    updatePayment({ paymentProofFileName: data.fileName || file.name });
    return { url: data.url };
  };

  const whatsappHref = whatsappTo
    ? `https://wa.me/${whatsappTo}?text=${encodeURIComponent(
        `Hi Neram, I paid ${rupees(amount)}${props.studentName ? ` for ${props.studentName}` : ''} (ref ${paymentNote}). Here is the screenshot.`,
      )}`
    : null;

  const utrDigits = (payment.transactionReference || '').replace(/[\s-]/g, '');
  const utrOk = !utrDigits || (method === 'upi_direct' ? /^\d{12}$/.test(utrDigits) : /^[A-Za-z0-9]{12,22}$/.test(utrDigits));
  const proofOk = channel === 'upload' ? !!payment.paymentProofUrl : !!payment.whatsappSent;
  const showTerms = props.showTerms !== false;
  const planNote =
    props.amountNote ??
    (props.scheme === 'full' ? 'Paid in full. Nothing more to pay.' : `First installment. ${rupees(props.balance)} more by ${formatDay(props.balanceDueDate)}.`);
  const canSubmit = utrOk && proofOk && !!payment.paymentDate && (!showTerms || props.termsAccepted) && props.phoneVerified && !props.submitting && !props.payLaterBusy;

  return (
    <Box>
      {/* What to pay */}
      <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: `${t.radius}px`, bgcolor: t.navy900, color: t.paper, mb: 3, display: instantActive ? 'none' : 'block' }}>
        <Typography sx={{ fontSize: 14, color: t.paperMuted }}>Amount to pay now</Typography>
        <Typography sx={{ fontSize: { xs: 32, sm: 36 }, fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {rupees(amount)}
        </Typography>
        <Typography sx={{ fontSize: 15, color: t.paperMuted, mt: 0.5 }}>{planNote}</Typography>
      </Box>

      {showTerms && props.instant && (
        <FormControlLabel
          sx={{ mb: 2, alignItems: 'flex-start', mr: 0 }}
          control={<Checkbox checked={props.termsAccepted} onChange={(e) => props.setTermsAccepted(e.target.checked)} sx={{ mt: -0.75 }} />}
          label={
            <Typography sx={{ fontSize: 15, lineHeight: 1.5, color: t.ink }}>
              My details are correct and I agree to the{' '}
              <a href="/en/terms" target="_blank" rel="noopener noreferrer" style={{ color: t.navy900, textDecoration: 'underline', fontWeight: 600 }}>
                Terms and Conditions
              </a>{' '}
              and{' '}
              <a href="/en/refund-policy" target="_blank" rel="noopener noreferrer" style={{ color: t.navy900, textDecoration: 'underline', fontWeight: 600 }}>
                Refund Policy
              </a>
              .
            </Typography>
          }
        />
      )}
      {props.instant && (
        <InstantUpiPanel
          baseAmount={amount}
          orderMinutes={props.instant.orderMinutes}
          mode={props.instant.mode}
          planNote={planNote}
          start={props.instant.start}
          poll={props.instant.poll}
          cancel={props.instant.cancel}
          onDone={props.instant.onDone}
          onFallback={() => updatePayment({ paymentMethod: 'upi_direct' })}
          onActiveChange={setInstantActive}
          disabled={!props.phoneVerified || props.submitting || (showTerms && !props.termsAccepted)}
          disabledReason={!props.phoneVerified ? 'Verify your phone number on the first step to pay.' : showTerms && !props.termsAccepted ? 'Tick the terms above to pay.' : null}
        />
      )}

      <Box sx={{ display: instantActive ? 'none' : 'block' }}>
        {props.instant && (
          <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, mb: 1.5 }}>Or pay the usual way and send us the screenshot:</Typography>
        )}
        <StepHeading n={1} title="Pay the trust" />
        <Box role="radiogroup" aria-label="How you will pay" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
          <ChoiceTab selected={method === 'upi_direct'} onClick={() => updatePayment({ paymentMethod: 'upi_direct' })} icon={<QrCode2Outlined aria-hidden />} label="UPI" />
          <ChoiceTab selected={method === 'bank_transfer'} onClick={() => updatePayment({ paymentMethod: 'bank_transfer' })} icon={<AccountBalanceOutlined aria-hidden />} label="Bank transfer" />
        </Box>

        {method === 'upi_direct' ? (
          <Box sx={panelSx}>
            {isPhone && (
              <Box sx={{ mb: 2 }}>
                <CtaButton variant="primary" href={upiUri} fullWidth size="lg" startIcon={<PhoneIphoneOutlined />} endIcon={null}>
                  Pay {rupees(amount)} with a UPI app
                </CtaButton>
                <Typography sx={{ fontSize: 14, color: t.inkMuted, mt: 1, lineHeight: 1.5 }}>
                  Opens GPay, PhonePe or Paytm with the amount filled in. Or save the QR below and scan it from your gallery.
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'center', sm: 'flex-start' } }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <Box
                  role="img"
                  aria-label={`UPI QR code to pay ${rupees(amount)} to ${payee.payeeName}`}
                  sx={{ width: 200, height: 200, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, p: 1, bgcolor: t.surface, '& svg, & img': { width: '100%', height: '100%', display: 'block', objectFit: 'contain' } }}
                >
                  {official ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={official.url} alt="" />
                  ) : qrSvg ? (
                    <Box sx={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  ) : (
                    <Box sx={{ width: '100%', height: '100%', bgcolor: t.ground, borderRadius: '4px' }} />
                  )}
                </Box>
                <Box
                  component="button"
                  type="button"
                  onClick={saveQr}
                  disabled={savingQr || (!official && !qrSvg)}
                  sx={{ ...smallButtonSx, width: 200 }}
                  aria-describedby="save-qr-note"
                >
                  {savingQr ? <CircularProgress size={16} color="inherit" /> : <SaveAltOutlined sx={{ fontSize: 18 }} aria-hidden />}
                  {savingQr ? 'Saving' : 'Save QR to phone'}
                </Box>
                {official && <Typography sx={{ fontSize: 12, color: t.inkMuted }}>Official {payee.bank.bankName} QR</Typography>}
              </Box>
              <Box sx={{ flex: 1, width: '100%', minWidth: 0 }}>
                <CopyRow label="UPI ID" value={payee.upiId} />
                <CopyRow label="Name" value={payee.payeeName} copy={false} />
                {payee.gpayNumber && <CopyRow label="GPay number" value={payee.gpayNumber} />}
                <CopyRow label="Amount" value={String(amount)} display={rupees(amount)} />
                <CopyRow label="Note to add" value={paymentNote} />
              </Box>
            </Box>
            <Typography id="save-qr-note" role="status" aria-live="polite" sx={{ fontSize: 14, color: qrNote ? t.ink : 'transparent', mt: qrNote ? 1.5 : 0, lineHeight: 1.5, minHeight: qrNote ? undefined : 0 }}>
              {qrNote || ''}
            </Typography>
            <Hint>
              Only one phone? Save the QR, open GPay or PhonePe, tap Scan and choose it from your gallery. Check the name reads <strong>{payee.payeeName}</strong> before you pay. Add the note {paymentNote} if your app asks.
            </Hint>
          </Box>
        ) : (
          <Box sx={panelSx}>
            <CopyRow label="Account name" value={payee.bank.accountName} />
            <CopyRow label="Account number" value={payee.bank.accountNumber} mono />
            <CopyRow label="IFSC" value={payee.bank.ifsc} mono />
            <CopyRow label="Bank" value={`${payee.bank.bankName}, ${payee.bank.branch}`} copy={false} />
            <CopyRow label="Amount" value={String(amount)} display={rupees(amount)} />
            <CopyRow label="Remarks" value={paymentNote} />
            <Hint>NEFT, IMPS and UPI to an account number all work. Keep the confirmation your bank shows after the transfer.</Hint>
          </Box>
        )}

        <Box sx={{ mt: 3 }}>
          <StepHeading n={2} title="Tell us you paid" />
          {whatsappTo && (
            <Box role="radiogroup" aria-label="How you will send the proof" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
              <ChoiceTab selected={channel === 'upload'} onClick={() => updatePayment({ proofChannel: 'upload' })} icon={<PhotoCameraOutlined aria-hidden />} label="Upload screenshot" />
              <ChoiceTab selected={channel === 'whatsapp'} onClick={() => updatePayment({ proofChannel: 'whatsapp' })} icon={<WhatsApp aria-hidden />} label="Send on WhatsApp" />
            </Box>
          )}
          <Box sx={{ display: 'grid', gap: 2 }}>
            {channel === 'upload' ? (
              <Box>
                <Typography component="label" sx={{ display: 'block', fontSize: 15, fontWeight: 600, color: t.ink, mb: 1 }}>
                  Payment screenshot <Box component="span" sx={{ color: errorColor }}>*</Box>
                </Typography>
                <ImageUploadField
                  value={payment.paymentProofUrl || null}
                  onChange={(url) => (url ? updatePayment({ paymentProofUrl: url }) : updatePayment({ paymentProofUrl: null, paymentProofFileName: null }))}
                  upload={uploadProof}
                  accept="image/*,.pdf"
                  maxSizeMB={5}
                  camera
                  helperText="The success screen from your payment app, showing the amount"
                />
                {fieldErrors.paymentProofUrl && (
                  <Typography role="alert" sx={{ fontSize: 14, color: errorColor, mt: 0.5 }}>{fieldErrors.paymentProofUrl}</Typography>
                )}
              </Box>
            ) : (
              <Box sx={{ ...panelSx, borderColor: fieldErrors.whatsappSent ? errorColor : t.line }}>
                <Typography sx={{ fontSize: 15, color: t.ink, lineHeight: 1.5, mb: 1.5 }}>
                  Send the payment success screen to our WhatsApp. The message is already typed for you.
                </Typography>
                <CtaButton variant="outline" href={whatsappHref || '#'} external fullWidth size="lg" startIcon={<WhatsApp aria-hidden sx={{ color: brandColors.whatsappDark }} />} endIcon={null}>
                  Open WhatsApp
                </CtaButton>
                <FormControlLabel
                  sx={{ mt: 1.5, alignItems: 'flex-start', mr: 0 }}
                  control={<Checkbox checked={!!payment.whatsappSent} onChange={(e) => updatePayment({ whatsappSent: e.target.checked })} sx={{ mt: -0.75 }} />}
                  label={<Typography sx={{ fontSize: 15, lineHeight: 1.5, color: t.ink }}>I have sent the screenshot on WhatsApp</Typography>}
                />
                {fieldErrors.whatsappSent && (
                  <Typography role="alert" sx={{ fontSize: 14, color: errorColor, mt: 0.5 }}>{fieldErrors.whatsappSent}</Typography>
                )}
              </Box>
            )}

            <TextField
              label={method === 'upi_direct' ? 'UPI reference number (UTR), optional' : 'Bank reference number, optional'}
              value={payment.transactionReference}
              onChange={(e) => updatePayment({ transactionReference: e.target.value.slice(0, 26) })}
              fullWidth
              inputProps={{
                inputMode: method === 'upi_direct' ? 'numeric' : 'text',
                autoComplete: 'off',
                'aria-describedby': 'utr-help',
                style: { fontSize: 16, letterSpacing: '0.04em' },
              }}
              error={!!fieldErrors.transactionReference || !utrOk}
              helperText={
                <span id="utr-help">
                  {fieldErrors.transactionReference ||
                    (method === 'upi_direct'
                      ? 'Helps us confirm faster. GPay: open the payment, "UPI transaction ID". PhonePe: "UTR". Not sure? Leave it empty.'
                      : 'The reference on your bank confirmation. Not sure? Leave it empty.')}
                </span>
              }
            />
            <TextField
              label="Paid from whose account? Optional"
              value={payment.payerName || ''}
              onChange={(e) => updatePayment({ payerName: e.target.value.slice(0, 80) })}
              fullWidth
              inputProps={{ autoComplete: 'off', style: { fontSize: 16 } }}
              helperText="If a parent or friend paid, their name helps us find it in the bank."
            />
            <TextField
              label="Date you paid"
              type="date"
              value={payment.paymentDate || ''}
              onChange={(e) => updatePayment({ paymentDate: e.target.value })}
              required
              fullWidth
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: today, style: { fontSize: 16 } }}
              error={!!fieldErrors.paymentDate}
              helperText={fieldErrors.paymentDate || ' '}
            />
          </Box>
        </Box>

        {!props.phoneVerified && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Please go back to the first step and verify your phone number.
          </Alert>
        )}

        {showTerms && !props.instant && (
          <FormControlLabel
            sx={{ mt: 2, alignItems: 'flex-start', mr: 0 }}
            control={<Checkbox checked={props.termsAccepted} onChange={(e) => props.setTermsAccepted(e.target.checked)} sx={{ mt: -0.75 }} />}
            label={
              <Typography sx={{ fontSize: 15, lineHeight: 1.5, color: t.ink }}>
                My details are correct and I agree to the{' '}
                <a href="/en/terms" target="_blank" rel="noopener noreferrer" style={{ color: t.navy900, textDecoration: 'underline', fontWeight: 600 }}>
                  Terms and Conditions
                </a>{' '}
                and{' '}
                <a href="/en/refund-policy" target="_blank" rel="noopener noreferrer" style={{ color: t.navy900, textDecoration: 'underline', fontWeight: 600 }}>
                  Refund Policy
                </a>
                .
              </Typography>
            }
          />
        )}

        <Box sx={{ mt: 2 }}>
          <CtaButton variant="primary" fullWidth size="lg" onClick={props.onSubmit} disabled={!canSubmit} endIcon={props.submitting ? null : undefined}>
            {props.submitting ? (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} color="inherit" /> Sending...
              </Box>
            ) : (
              'I have paid, verify it'
            )}
          </CtaButton>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.5 }}>
            <LockOutlined aria-hidden sx={{ fontSize: 18, color: t.inkMuted, mt: '2px' }} />
            <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5 }}>
              Our accounts team matches your payment with the bank, usually within a few hours. You get an email at each step.
            </Typography>
          </Box>
        </Box>

        {props.onPayLater && (
          <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${t.line}` }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: t.ink, mb: 0.5 }}>Not paying right now?</Typography>
            <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, mb: 1.5 }}>
              We save your details and email you the QR, the bank details and this link, so you can pay from any phone later.
            </Typography>
            <CtaButton variant="outline" fullWidth onClick={props.onPayLater} disabled={props.payLaterBusy || props.submitting} startIcon={<ScheduleOutlined aria-hidden />} endIcon={null}>
              {props.payLaterBusy ? 'Saving...' : 'I will pay later, email me the details'}
            </CtaButton>
          </Box>
        )}
      </Box>
    </Box>
  );
}

const panelSx = { p: { xs: 2, sm: 2.5 }, borderRadius: `${t.radius}px`, border: `1px solid ${t.line}`, bgcolor: t.surface } as const;

const smallButtonSx = {
  minHeight: 44,
  px: 1.5,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0.75,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
  borderRadius: `${t.radius}px`,
  border: `1px solid ${t.lineStrong}`,
  bgcolor: t.surface,
  color: t.ink,
  transition: 'border-color 150ms ease',
  '&:hover': { borderColor: t.gold500 },
  '&:disabled': { cursor: 'default', opacity: 0.6 },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  ...focusRing,
} as const;

function StepHeading({ n, title }: { n: number; title: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
      <Box
        aria-hidden
        sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: t.navy900, color: t.paper, display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}
      >
        {n}
      </Box>
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, color: t.ink }}>
        <Box component="span" sx={visuallyHidden}>Step {n}: </Box>
        {title}
      </Typography>
    </Box>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

function ChoiceTab({ selected, onClick, icon, label }: { selected: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Box
      component="button"
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      sx={{
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        px: 1,
        fontSize: { xs: 15, sm: 16 },
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        borderRadius: `${t.radius}px`,
        border: `1px solid ${selected ? t.navy900 : t.lineStrong}`,
        bgcolor: selected ? t.navy900 : t.surface,
        color: selected ? t.paper : t.ink,
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: selected ? t.navy900 : t.gold500 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        ...focusRing,
      }}
    >
      {icon}
      {label}
    </Box>
  );
}

function CopyRow({ label, value, display, copy = true, mono }: { label: string; value: string; display?: string; copy?: boolean; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard blocked: the value is on screen to copy by hand. */
    }
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: `1px solid ${t.line}`, '&:last-of-type': { borderBottom: 'none' } }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 13, color: t.inkMuted }}>{label}</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: t.ink, wordBreak: 'break-all', fontFamily: mono ? t.fontMono : undefined }}>
          {display || value}
        </Typography>
      </Box>
      {copy && (
        <Box component="button" type="button" onClick={onCopy} aria-label={copied ? `${label} copied` : `Copy ${label}`} sx={{ ...smallButtonSx, minWidth: 44, px: 1.25, color: copied ? t.success : t.ink }}>
          {copied ? <CheckOutlined sx={{ fontSize: 18 }} aria-hidden /> : <ContentCopyOutlined sx={{ fontSize: 18 }} aria-hidden />}
          <Box component="span" aria-live="polite">{copied ? 'Copied' : 'Copy'}</Box>
        </Box>
      )}
    </Box>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 2 }}>
      <InfoOutlined aria-hidden sx={{ fontSize: 18, color: t.inkMuted, mt: '2px' }} />
      <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5 }}>{children}</Typography>
    </Box>
  );
}
