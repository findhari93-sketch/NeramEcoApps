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
import { getCurrentUser } from '@neram/auth';
import { buildUpiUri } from '@neram/database/student-pay';
import { tokens as t, focusRing, CtaButton, errorColor } from '@/design-system';
import type { PaymentDetailsData } from '@/components/apply/types';
import { rupees, formatDay, istTodayKey, type PaymentPayee } from './student-pay-types';

type Method = 'upi_direct' | 'bank_transfer';

interface PayStepProps {
  amount: number;
  scheme: 'full' | 'installment';
  balance: number | null;
  balanceDueDate: string | null;
  payee: PaymentPayee;
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
  /** Replaces the line under the amount (e.g. on the pay balance page). */
  amountNote?: string;
  /** The enrol form asks for the terms; a balance payment does not. Default true. */
  showTerms?: boolean;
}

export default function PayStep(props: PayStepProps) {
  const { amount, payee, paymentNote, payment, updatePayment, fieldErrors } = props;
  const method: Method = payment.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'upi_direct';
  const isPhone = useMediaQuery('(pointer: coarse) and (max-width: 900px)');
  const today = istTodayKey();

  const upiUri = useMemo(
    () => buildUpiUri({ vpa: payee.upiId, payeeName: payee.payeeName, amount, note: paymentNote }),
    [payee.upiId, payee.payeeName, amount, paymentNote],
  );

  // The QR is drawn on the client from the server's amount; nothing is fetched.
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((QR) => QR.toString(upiUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: t.navy900, light: t.surface } }))
      .then((svg) => alive && setQrSvg(svg))
      .catch(() => alive && setQrSvg(null));
    return () => {
      alive = false;
    };
  }, [upiUri]);

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

  const utrDigits = (payment.transactionReference || '').replace(/[\s-]/g, '');
  const utrOk = method === 'upi_direct' ? /^\d{12}$/.test(utrDigits) : /^[A-Za-z0-9]{12,22}$/.test(utrDigits);
  const showTerms = props.showTerms !== false;
  const canSubmit =
    utrOk && !!payment.paymentDate && !!payment.paymentProofUrl && (!showTerms || props.termsAccepted) && props.phoneVerified && !props.submitting;

  return (
    <Box>
      {/* What to pay */}
      <Box sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: `${t.radius}px`, bgcolor: t.navy900, color: t.paper, mb: 3 }}>
        <Typography sx={{ fontSize: 14, color: t.paperMuted }}>Amount to pay now</Typography>
        <Typography sx={{ fontSize: { xs: 32, sm: 36 }, fontWeight: 800, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {rupees(amount)}
        </Typography>
        <Typography sx={{ fontSize: 15, color: t.paperMuted, mt: 0.5 }}>
          {props.amountNote ??
            (props.scheme === 'full'
              ? 'Paid in full. Nothing more to pay.'
              : `First installment. ${rupees(props.balance)} more by ${formatDay(props.balanceDueDate)}.`)}
        </Typography>
      </Box>

      <StepHeading n={1} title="Pay the trust" />
      <Box role="radiogroup" aria-label="How you will pay" sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
        <MethodTab selected={method === 'upi_direct'} onClick={() => updatePayment({ paymentMethod: 'upi_direct' })} icon={<QrCode2Outlined aria-hidden />} label="UPI" />
        <MethodTab selected={method === 'bank_transfer'} onClick={() => updatePayment({ paymentMethod: 'bank_transfer' })} icon={<AccountBalanceOutlined aria-hidden />} label="Bank transfer" />
      </Box>

      {method === 'upi_direct' ? (
        <Box sx={panelSx}>
          {isPhone && (
            <Box sx={{ mb: 2 }}>
              <CtaButton variant="primary" href={upiUri} fullWidth size="lg" startIcon={<PhoneIphoneOutlined />} endIcon={null}>
                Pay {rupees(amount)} with a UPI app
              </CtaButton>
              <Typography sx={{ fontSize: 14, color: t.inkMuted, mt: 1, lineHeight: 1.5 }}>
                Opens GPay, PhonePe or Paytm with the amount filled in. Or scan the QR from another phone.
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'center', sm: 'flex-start' } }}>
            <Box
              role="img"
              aria-label={`UPI QR code to pay ${rupees(amount)} to ${payee.payeeName}`}
              sx={{ width: 200, height: 200, flexShrink: 0, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, p: 1, bgcolor: t.surface, '& svg': { width: '100%', height: '100%', display: 'block' } }}
            >
              {qrSvg ? (
                <Box sx={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: qrSvg }} />
              ) : (
                <Box sx={{ width: '100%', height: '100%', bgcolor: t.ground, borderRadius: '4px' }} />
              )}
            </Box>
            <Box sx={{ flex: 1, width: '100%', minWidth: 0 }}>
              <CopyRow label="UPI ID" value={payee.upiId} />
              <CopyRow label="Name" value={payee.payeeName} copy={false} />
              {payee.gpayNumber && <CopyRow label="GPay number" value={payee.gpayNumber} />}
              <CopyRow label="Amount" value={String(amount)} display={rupees(amount)} />
              <CopyRow label="Note to add" value={paymentNote} />
            </Box>
          </Box>
          <Hint>
            If your app does not let you pay with the amount filled in, pay to the UPI ID above and type {rupees(amount)} yourself. Add the note {paymentNote} so we can find your payment quickly.
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
          <Hint>NEFT, IMPS and UPI to an account number all work. Keep the reference number your bank shows after the transfer.</Hint>
        </Box>
      )}

      <Box sx={{ mt: 3 }}>
        <StepHeading n={2} title="Tell us you paid" />
        <Box sx={{ display: 'grid', gap: 2 }}>
          <TextField
            label={method === 'upi_direct' ? 'UPI reference number (UTR)' : 'Bank reference number (UTR)'}
            value={payment.transactionReference}
            onChange={(e) => updatePayment({ transactionReference: e.target.value.slice(0, 26) })}
            required
            fullWidth
            inputProps={{
              inputMode: method === 'upi_direct' ? 'numeric' : 'text',
              autoComplete: 'off',
              'aria-describedby': 'utr-help',
              style: { fontSize: 16, letterSpacing: '0.04em' },
            }}
            error={!!fieldErrors.transactionReference || (utrDigits.length > 0 && !utrOk && utrDigits.length >= (method === 'upi_direct' ? 12 : 22))}
            helperText={
              <span id="utr-help">
                {fieldErrors.transactionReference ||
                  (method === 'upi_direct'
                    ? '12 digits. GPay: open the payment and copy "UPI transaction ID". PhonePe: "UTR". Paytm: "UPI Ref No".'
                    : 'The UTR or reference number on your bank’s confirmation (12 to 22 letters and digits).')}
              </span>
            }
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
              helperText="The success screen from your payment app, showing the amount and reference"
            />
            {fieldErrors.paymentProofUrl && (
              <Typography role="alert" sx={{ fontSize: 14, color: errorColor, mt: 0.5 }}>{fieldErrors.paymentProofUrl}</Typography>
            )}
          </Box>
        </Box>
      </Box>

      {!props.phoneVerified && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Please go back to the first step and verify your phone number.
        </Alert>
      )}

      {showTerms && (
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
            'Submit payment for verification'
          )}
        </CtaButton>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.5 }}>
          <LockOutlined aria-hidden sx={{ fontSize: 18, color: t.inkMuted, mt: '2px' }} />
          <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5 }}>
            Our accounts team matches your reference with the bank, usually within a few hours. You will get an email at each step.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

const panelSx = { p: { xs: 2, sm: 2.5 }, borderRadius: `${t.radius}px`, border: `1px solid ${t.line}`, bgcolor: t.surface } as const;

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

function MethodTab({ selected, onClick, icon, label }: { selected: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
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
        fontSize: 16,
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
        <Box
          component="button"
          type="button"
          onClick={onCopy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          sx={{
            minWidth: 44,
            minHeight: 44,
            px: 1.25,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            borderRadius: `${t.radius}px`,
            border: `1px solid ${t.lineStrong}`,
            bgcolor: t.surface,
            color: copied ? t.success : t.ink,
            '&:hover': { borderColor: t.gold500 },
            ...focusRing,
          }}
        >
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
