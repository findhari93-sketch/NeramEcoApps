'use client';

/**
 * Instant UPI: the student pays the exact tagged amount (for example ₹25,000.37)
 * to the trust's UPI ID; the bank alert reaches us on its own. Live: they are
 * enrolled within seconds with no staff step. Shadow (the first weeks): the
 * match is held and a person confirms it, still with no screenshot. Shown only
 * when Settings turn it on and the office phone is alive (the parent checks
 * /api/payments/methods).
 *
 * Phases: idle → starting → waiting (polls the order) → done (paid, enrolment
 * being written) | held (staff confirm) | expired (keeps watching 24 h) |
 * fallback (the student took the screenshot path; the order keeps watching) |
 * rejected | error. "Use another way" cancels the order and returns to idle.
 * A poll that was in flight when the student left can never revive the panel:
 * every result is checked against the order that is current now.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress, Alert, useMediaQuery } from '@neram/ui';
import BoltOutlined from '@mui/icons-material/BoltOutlined';
import PhoneIphoneOutlined from '@mui/icons-material/PhoneIphoneOutlined';
import SaveAltOutlined from '@mui/icons-material/SaveAltOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import TaskAltOutlined from '@mui/icons-material/TaskAltOutlined';
import { tokens as t, focusRing, CtaButton } from '@/design-system';
import { useQrSvg, svgToPng, downloadBlob } from './qr-utils';

export interface InstantOrder {
  attemptId: string;
  amountPaise: number;
  paiseTag: number | null;
  upiUri: string;
  expiresAt: string;
  payeeName: string;
  upiId: string;
  note: string;
}

export interface InstantStatus {
  state: string;
  /** The link is 'used' (enrolment) or the intent is paid (balance). */
  enrolled: boolean;
  expiresAt: string | null;
}

export interface InstantUpiPanelProps {
  /** Rupees the student owes (without the tag), for the idle card. */
  baseAmount: number;
  orderMinutes: number;
  /** live: the bank alert enrols at once. shadow: it is held and a person confirms. */
  mode?: 'live' | 'shadow';
  /** Under the amount while waiting: the plan ("First installment. ₹13,500 more by ..."). */
  planNote?: string;
  /** Creates (or reuses) the order. Throws with a readable message on failure. */
  start: () => Promise<InstantOrder>;
  poll: (attemptId: string) => Promise<InstantStatus>;
  cancel: (attemptId: string) => Promise<void>;
  /** The order was confirmed and the student is enrolled (or the balance recorded). */
  onDone: () => void;
  /** The student wants the screenshot path instead (or must take it). */
  onFallback: () => void;
  /** True while the panel owns the screen (the parent hides the manual path). */
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
  /** Why the button is disabled, shown under it (for example "accept the terms first"). */
  disabledReason?: string | null;
}

type Phase = 'idle' | 'starting' | 'waiting' | 'done' | 'held' | 'expired' | 'fallback' | 'rejected' | 'error';
const ACTIVE: Phase[] = ['starting', 'waiting', 'done', 'held'];
const SLOW: Phase[] = ['fallback', 'held', 'expired'];

const rupeesExact = (paise: number) => {
  const whole = Math.floor(paise / 100);
  const rem = paise % 100;
  return `₹${whole.toLocaleString('en-IN')}${rem ? `.${String(rem).padStart(2, '0')}` : ''}`;
};

/** 3s for the first 3 minutes, then 10s to 10 minutes, then 30s. Slow phases poll at 30s; "done" at 3s. */
const pollDelay = (elapsedMs: number, phase: Phase) =>
  phase === 'done' ? 3000 : SLOW.includes(phase) ? 30_000 : elapsedMs < 3 * 60_000 ? 3000 : elapsedMs < 10 * 60_000 ? 10_000 : 30_000;

export default function InstantUpiPanel(props: InstantUpiPanelProps) {
  const mode = props.mode || 'live';
  const [phase, setPhase] = useState<Phase>('idle');
  const [order, setOrder] = useState<InstantOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [savingQr, setSavingQr] = useState(false);
  const [qrNote, setQrNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const phaseRef = useRef<Phase>('idle');
  /** The order this panel is watching right now; a result for any other order is ignored. */
  const activeId = useRef<string | null>(null);
  const mounted = useRef(true);
  const startedAt = useRef<number>(0);
  const doneAt = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPhone = useMediaQuery('(pointer: coarse) and (max-width: 900px)');
  const qrSvg = useQrSvg(order?.upiUri || null);

  const go = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const stopPolling = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    propsRef.current.onActiveChange?.(ACTIVE.includes(phase));
  }, [phase]);

  useEffect(
    () => () => {
      mounted.current = false;
      activeId.current = null;
      stopPolling();
    },
    [],
  );

  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'done') return;
    const id = setInterval(() => {
      setNow(Date.now());
      // The window closed on this side: say so now rather than when the sweep notices.
      if (phaseRef.current === 'waiting' && order && new Date(order.expiresAt).getTime() <= Date.now()) go('expired');
    }, 1000);
    return () => clearInterval(id);
  }, [phase, order]);

  const tick = async (attemptId: string) => {
    let status: InstantStatus | null = null;
    try {
      status = await propsRef.current.poll(attemptId);
    } catch {
      /* a failed poll is retried on the next tick */
    }
    // The student moved on (cancelled, left the page) while this poll was in flight.
    if (!mounted.current || activeId.current !== attemptId) return;
    const current = phaseRef.current;
    if (status) {
      if (status.enrolled) {
        stopPolling();
        activeId.current = null;
        go('done');
        propsRef.current.onDone();
        return;
      }
      if (status.state === 'succeeded') {
        // Paid; the enrolment is being written. Keep asking until it is.
        if (current !== 'done') {
          doneAt.current = Date.now();
          go('done');
        }
      } else if (status.state === 'awaiting_review') {
        if (current !== 'held') go('held');
      } else if (status.state === 'rejected') {
        stopPolling();
        activeId.current = null;
        go('rejected');
        propsRef.current.onFallback();
        return;
      } else if (status.state === 'cancelled' || status.state === 'failed') {
        stopPolling();
        activeId.current = null;
        if (current !== 'fallback') go('expired');
        return;
      } else if (status.state === 'expired') {
        // A late credit still counts for 24 hours, so keep listening, slowly.
        if (current !== 'fallback' && current !== 'expired') go('expired');
      }
    }
    timer.current = setTimeout(() => tick(attemptId), pollDelay(Date.now() - startedAt.current, phaseRef.current));
  };

  const start = async () => {
    go('starting');
    setError(null);
    try {
      const o = await propsRef.current.start();
      if (!mounted.current) return;
      setOrder(o);
      startedAt.current = Date.now();
      activeId.current = o.attemptId;
      go('waiting');
      stopPolling();
      timer.current = setTimeout(() => tick(o.attemptId), 3000);
    } catch (e: any) {
      if (!mounted.current) return;
      setError(e?.message || 'Could not start the instant payment.');
      go('error');
    }
  };

  const anotherWay = async () => {
    stopPolling();
    const o = order;
    activeId.current = null;
    setOrder(null);
    go('idle');
    propsRef.current.onFallback();
    if (o) await propsRef.current.cancel(o.attemptId).catch(() => undefined);
  };

  const notShowing = () => {
    // The order keeps watching for 24 hours and this panel keeps listening; the manual path opens below.
    go('fallback');
    propsRef.current.onFallback();
  };

  const saveQr = async () => {
    if (!qrSvg || savingQr) return;
    setSavingQr(true);
    try {
      const blob = await svgToPng(qrSvg, 720);
      if (!blob) throw new Error();
      downloadBlob(blob, `neram-pay-${order ? (order.amountPaise / 100).toFixed(2) : 'qr'}.png`);
      setQrNote('Saved. Open GPay or PhonePe, tap Scan, and pick it from your gallery or Downloads.');
    } catch {
      setQrNote('Could not save it here. Take a screenshot of the QR and scan that from your gallery.');
    } finally {
      setSavingQr(false);
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* on screen to copy by hand */
    }
  };

  const amountText = order ? rupeesExact(order.amountPaise) : '';
  const baseText = `₹${Math.round(props.baseAmount).toLocaleString('en-IN')}`;

  // ── idle / starting / error ──────────────────────────────────────────────
  if (phase === 'idle' || phase === 'starting' || phase === 'error') {
    return (
      <Box sx={{ ...cardSx, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <Box aria-hidden sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: t.goldTintBg, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <BoltOutlined sx={{ color: t.gold800 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, color: t.ink }}>
              {mode === 'live' ? 'Pay by UPI, confirmed in seconds' : 'Pay by UPI, no screenshot needed'}
            </Typography>
            <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, mt: 0.25 }}>
              {mode === 'live'
                ? 'Pay the exact amount we show. The bank alert reaches us on its own and you are enrolled the moment it does. No screenshot, no extra fee. Larger amounts get a quick check by our team first.'
                : 'Pay the exact amount we show. The bank alert reaches us on its own and our team confirms it, usually within a few hours. No screenshot, no extra fee.'}
            </Typography>
          </Box>
        </Box>
        {error && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ mt: 1.5 }}>
          <CtaButton variant="primary" fullWidth size="lg" onClick={start} disabled={props.disabled || phase === 'starting'} startIcon={phase === 'starting' ? undefined : <BoltOutlined aria-hidden />} endIcon={null}>
            {phase === 'starting' ? (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={18} color="inherit" /> Preparing your amount...
              </Box>
            ) : mode === 'live' ? (
              `Pay ${baseText} instantly`
            ) : (
              `Pay ${baseText} by UPI`
            )}
          </CtaButton>
          {props.disabled && props.disabledReason && (
            <Typography sx={{ fontSize: 14, color: t.inkMuted, mt: 1, textAlign: 'center' }}>{props.disabledReason}</Typography>
          )}
        </Box>
      </Box>
    );
  }

  // ── fallback: the manual path is open below; the order still watches ─────
  if (phase === 'fallback') {
    return (
      <Alert severity="info" icon={<BoltOutlined aria-hidden />} sx={{ mb: 3 }}>
        We keep watching for {amountText} for 24 hours. If it arrives, this page updates on its own. If you have not paid yet, use the QR or bank details below and send us the screenshot.
      </Alert>
    );
  }

  // ── rejected: staff could not confirm it ─────────────────────────────────
  if (phase === 'rejected') {
    return (
      <Alert severity="warning" sx={{ mb: 3 }} role="status">
        We could not confirm the payment of {amountText}. If you did pay, upload the screenshot below or message us on WhatsApp and our team will sort it out. If not, pay with the QR or bank details below.
      </Alert>
    );
  }

  // ── done: paid, enrolment being written ──────────────────────────────────
  if (phase === 'done') {
    const slow = doneAt.current > 0 && now - doneAt.current > 60_000;
    return (
      <Box sx={{ ...cardSx, borderColor: t.success, mb: 3 }} role="status" aria-live="polite">
        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
          <TaskAltOutlined aria-hidden sx={{ color: t.success, fontSize: 32 }} />
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: t.ink }}>Payment received. One moment...</Typography>
            <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5 }}>
              {slow ? 'Setting up your account is taking longer than usual. This page updates on its own; if nothing changes in a few minutes, message us on WhatsApp.' : 'Setting up your enrolment.'}
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  // ── held: staff confirm by hand ──────────────────────────────────────────
  if (phase === 'held') {
    return (
      <Box sx={{ ...cardSx, borderColor: t.success, mb: 3 }} role="status" aria-live="polite">
        <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
          <TaskAltOutlined aria-hidden sx={{ color: t.success, fontSize: 32 }} />
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: t.ink }}>We received {amountText}</Typography>
            <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, mt: 0.25 }}>
              Our accounts team confirms it by hand, usually within a few hours. This page updates when it is done. Nothing more to do now.
            </Typography>
          </Box>
        </Box>
      </Box>
    );
  }

  // ── waiting / expired ────────────────────────────────────────────────────
  const remainingMs = order ? Math.max(0, new Date(order.expiresAt).getTime() - now) : 0;
  const mm = Math.floor(remainingMs / 60000);
  const ss = Math.floor((remainingMs % 60000) / 1000);

  return (
    <Box sx={{ ...cardSx, borderColor: phase === 'expired' ? t.lineStrong : t.gold500, mb: 3 }}>
      <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600, color: t.inkMuted }}>
        Pay exactly
      </Typography>
      <Typography sx={{ fontSize: { xs: 34, sm: 40 }, fontWeight: 800, lineHeight: 1.15, color: t.ink, fontVariantNumeric: 'tabular-nums' }}>{amountText}</Typography>
      {order?.paiseTag ? (
        <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, mt: 0.5 }}>
          The {order.paiseTag} paise is how we recognise your payment. Your fee stays {`₹${Math.round((order.amountPaise - order.paiseTag) / 100).toLocaleString('en-IN')}`}.
          {props.planNote ? ` ${props.planNote}` : ''}
        </Typography>
      ) : props.planNote ? (
        <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, mt: 0.5 }}>{props.planNote}</Typography>
      ) : null}

      {phase === 'expired' ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          This payment request has closed. If you already paid {amountText}, it still counts: we match it within 24 hours and this page updates on its own. Otherwise start again, or pay with the QR below.
        </Alert>
      ) : (
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1, color: t.ink }}>
          <CircularProgress size={18} aria-hidden />
          <Typography component="span" role="status" aria-live="polite" sx={{ fontSize: 15 }}>
            Waiting for your payment.
          </Typography>
          <Box component="span" aria-hidden sx={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
            {mm}:{String(ss).padStart(2, '0')}
          </Box>
          <Box component="span" sx={visuallyHidden}>{`${mm} minutes left`}</Box>
        </Box>
      )}

      {phase === 'waiting' && order && (
        <>
          {isPhone && (
            <Box sx={{ mt: 2 }}>
              <CtaButton variant="primary" href={order.upiUri} fullWidth size="lg" startIcon={<PhoneIphoneOutlined />} endIcon={null}>
                Pay {amountText} with a UPI app
              </CtaButton>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 2.5, flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'center', sm: 'flex-start' }, mt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
              <Box
                role="img"
                aria-label={`UPI QR code to pay ${amountText} to ${order.payeeName}`}
                sx={{ width: 200, height: 200, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, p: 1, bgcolor: t.surface, '& svg': { width: '100%', height: '100%', display: 'block' } }}
              >
                {qrSvg ? <Box sx={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: qrSvg }} /> : <Box sx={{ width: '100%', height: '100%', bgcolor: t.ground, borderRadius: '4px' }} />}
              </Box>
              <Box component="button" type="button" onClick={saveQr} disabled={savingQr || !qrSvg} sx={{ ...smallButtonSx, width: 200 }} aria-describedby="instant-qr-note">
                {savingQr ? <CircularProgress size={16} color="inherit" /> : <SaveAltOutlined sx={{ fontSize: 18 }} aria-hidden />}
                {savingQr ? 'Saving' : 'Save QR to phone'}
              </Box>
            </Box>
            <Box sx={{ flex: 1, width: '100%', minWidth: 0 }}>
              <Row label="UPI ID" value={order.upiId} onCopy={() => copy('UPI ID', order.upiId)} copied={copied === 'UPI ID'} />
              <Row label="Name to check" value={order.payeeName} />
              <Row label="Amount, exactly" value={amountText} onCopy={() => copy('Amount', (order.amountPaise / 100).toFixed(2))} copied={copied === 'Amount'} />
              <Row label="Note" value={order.note} onCopy={() => copy('Note', order.note)} copied={copied === 'Note'} />
            </Box>
          </Box>
          <Typography id="instant-qr-note" role="status" aria-live="polite" sx={{ fontSize: 14, color: t.ink, mt: qrNote ? 1.5 : 0, lineHeight: 1.5 }}>
            {qrNote || ''}
          </Typography>
          <Typography sx={{ fontSize: 14, color: t.inkMuted, lineHeight: 1.5, mt: 1.5 }}>
            Type the amount exactly, including the paise. Check the name reads <strong>{order.payeeName}</strong> before you pay. The QR already carries the exact amount.
          </Typography>
        </>
      )}

      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mt: 2 }}>
        {phase === 'expired' ? (
          <CtaButton variant="primary" fullWidth onClick={start} endIcon={null}>
            Start again
          </CtaButton>
        ) : (
          <CtaButton variant="outline" fullWidth onClick={notShowing} endIcon={null}>
            I paid, but it is not showing
          </CtaButton>
        )}
        <CtaButton variant="link" fullWidth onClick={anotherWay} endIcon={null}>
          Use another way to pay
        </CtaButton>
      </Box>
    </Box>
  );
}

function Row({ label, value, onCopy, copied }: { label: string; value: string; onCopy?: () => void; copied?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: `1px solid ${t.line}`, '&:last-of-type': { borderBottom: 'none' } }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 13, color: t.inkMuted }}>{label}</Typography>
        <Typography sx={{ fontSize: 16, fontWeight: 600, color: t.ink, wordBreak: 'break-all' }}>{value}</Typography>
      </Box>
      {onCopy && (
        <Box component="button" type="button" onClick={onCopy} aria-label={copied ? `${label} copied` : `Copy ${label}`} sx={{ ...smallButtonSx, minWidth: 44, px: 1.25, color: copied ? t.success : t.ink }}>
          {copied ? <CheckOutlined sx={{ fontSize: 18 }} aria-hidden /> : <ContentCopyOutlined sx={{ fontSize: 18 }} aria-hidden />}
          <Box component="span" aria-live="polite">{copied ? 'Copied' : 'Copy'}</Box>
        </Box>
      )}
    </Box>
  );
}

const cardSx = { p: { xs: 2, sm: 2.5 }, borderRadius: `${t.radius}px`, border: `2px solid ${t.gold500}`, bgcolor: t.surface } as const;

const visuallyHidden = { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

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
