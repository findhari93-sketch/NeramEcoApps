'use client';

/**
 * The one place staff make, change and share a student's enrolment link.
 * Opened from the demo desk, Follow-ups, the person page and Direct Enroll.
 *
 * One active link per student: on open it looks for one (by account, then
 * phone) and shows it, so a second link is never made by accident. Editing a
 * link keeps its URL, so whatever was already sent keeps working.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  ImageUploadField,
  InputAdornment,
  MenuItem,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useCopyToClipboard,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import {
  BALANCE_DUE_PRESETS,
  enrolmentPlanLines,
  enrolmentShareMessage,
} from '@neram/database/enrolment-link';
import { addDaysToKey, formatDueDate, formatRupees, istToday } from '@neram/database/fee-plan';
import { buildStudentPayOffer, offerFromLink, type StudentPayOffer } from '@neram/database/student-pay';
import PhonelinkRingOutlinedIcon from '@mui/icons-material/PhonelinkRingOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import InvoiceDownload from './InvoiceDownload';
import ConfirmDialog from './ConfirmDialog';
import VerifyPaymentCard from './VerifyPaymentCard';
import {
  COUNTRY_CODES,
  COURSE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  useEnrolmentLinkForm,
  valuesFromLink,
  type EnrolmentLinkPrefill,
  type FieldErrors,
} from './useEnrolmentLinkForm';

export type EnrolmentLinkChange =
  | 'created'
  | 'updated'
  | 'cancelled'
  | 'regenerated'
  | 'payment_verified'
  | 'payment_rejected';

interface EnrolmentLinkDrawerProps {
  open: boolean;
  onClose: () => void;
  adminId: string;
  /** Who it is for. With userId (or a phone) the drawer opens their active link if there is one. */
  prefill?: EnrolmentLinkPrefill;
  /** Open this link directly (Direct Enroll "View", the person page). */
  linkId?: string | null;
  onChanged?: (link: any, change: EnrolmentLinkChange) => void;
}

type Mode = 'loading' | 'edit' | 'view';

const COURSE_LABEL: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'NATA + JEE Paper 2',
  revit: 'Revit',
  not_sure: 'Not decided',
};

const STATUS: Record<string, { label: string; color: 'success' | 'info' | 'warning' | 'default' }> = {
  active: { label: 'Active', color: 'success' },
  payment_submitted: { label: 'Payment to verify', color: 'warning' },
  used: { label: 'Completed', color: 'info' },
  expired: { label: 'Expired', color: 'warning' },
  cancelled: { label: 'Cancelled', color: 'default' },
};

const EVENT_LABEL: Record<string, string> = {
  created: 'Link made',
  updated: 'Details changed',
  copied: 'Link copied',
  emailed: 'Emailed to the student',
  email_failed: 'Email did not send',
  whatsapp_opened: 'WhatsApp chat opened',
  whatsapp_sent: 'Sent on WhatsApp',
  whatsapp_failed: 'WhatsApp did not send',
  cancelled: 'Link cancelled',
  merged: 'Duplicate merged into this link',
  payment_submitted: 'Student submitted a payment',
  payment_verified: 'Payment verified, student enrolled',
  payment_rejected: 'Payment rejected',
};

const SECTION_LABEL_SX = {
  display: 'block',
  mb: 1.5,
  color: 'text.secondary',
  textTransform: 'uppercase',
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: 1,
} as const;

const TWO_COL = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 } as const;

function shortDate(value: string | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

function waUrl(phone: string | null | undefined, text: string): string {
  let digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export default function EnrolmentLinkDrawer({ open, onClose, adminId, prefill, linkId, onChanged }: EnrolmentLinkDrawerProps) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [mode, setMode] = useState<Mode>('loading');
  const [link, setLink] = useState<any>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const form = useEnrolmentLinkForm(prefill);
  const { reset } = form;

  const loadLink = useCallback(async (id: string) => {
    const res = await fetch(`/api/direct-enrollment/${id}`);
    const json = await readJson(res);
    if (!res.ok) throw new Error(json.error || 'Could not load the link.');
    return json.data;
  }, []);

  // On open: a given link, else the student's active link, else a new form.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setMode('loading');
    setNotice(null);
    setLoadError(null);
    setLink(null);
    reset();
    (async () => {
      try {
        if (linkId) {
          const data = await loadLink(linkId);
          if (!cancelled) {
            setLink(data);
            setMode('view');
          }
          return;
        }
        const params = new URLSearchParams();
        if (prefill?.userId) params.set('userId', prefill.userId);
        if (prefill?.studentPhone) params.set('phone', prefill.studentPhone);
        if (params.toString()) {
          const res = await fetch(`/api/direct-enrollment/lookup?${params}`);
          const json = await readJson(res);
          if (!res.ok) throw new Error(json.error || 'Could not check for an existing link.');
          if (json.data && !cancelled) {
            setLink(json.data);
            setNotice(
              `${json.data.created_by_name || 'Someone'} already made a link for ${json.data.student_name} on ${shortDate(json.data.created_at)}. Share or edit this one, so they keep the same link.`,
            );
            setMode('view');
            return;
          }
        }
        if (!cancelled) setMode('edit');
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err?.message || 'Something went wrong.');
          setMode('edit');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linkId, prefill?.userId, prefill?.studentPhone]);

  const startEdit = () => {
    reset(valuesFromLink(link));
    setNotice(null);
    setMode('edit');
  };

  const title =
    mode === 'view' ? 'Enrolment link' : link ? 'Edit enrolment link' : 'New enrolment link';
  const studentName = link?.student_name || prefill?.studentName || form.values.studentName;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      transitionDuration={reduceMotion ? 0 : undefined}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 560 }, maxWidth: '100%', display: 'flex', flexDirection: 'column' },
        role: 'dialog',
        'aria-label': title,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2" fontWeight={700} noWrap>
            {title}
          </Typography>
          {studentName && (
            <Typography variant="body2" color="text.secondary" noWrap>
              {studentName}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      {mode === 'loading' && <LoadingBody />}

      {mode === 'view' && link && (
        <LinkView
          link={link}
          notice={notice}
          adminId={adminId}
          onEdit={startEdit}
          onReload={async (id, change) => {
            const data = await loadLink(id);
            setLink(data);
            if (change) {
              setNotice(null);
              onChanged?.(data, change);
            }
          }}
          onLinkReplaced={(next, change) => {
            setLink(next);
            setNotice(null);
            onChanged?.(next, change);
          }}
        />
      )}

      {mode === 'edit' && (
        <EditForm
          form={form}
          prefill={prefill}
          editingLink={link}
          loadError={loadError}
          adminId={adminId}
          onCancel={() => (link ? setMode('view') : onClose())}
          onSaved={(saved, change, message) => {
            setLink(saved);
            setNotice(message);
            setMode('view');
            if (change) onChanged?.(saved, change);
          }}
        />
      )}
    </Drawer>
  );
}

// ─── loading ──────────────────────────────────────────────────────────────────

function LoadingBody() {
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }} aria-busy="true">
      <Skeleton variant="rounded" height={56} />
      <Skeleton variant="rounded" height={48} />
      <Box sx={TWO_COL}>
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={48} />
      </Box>
      <Skeleton variant="rounded" height={140} />
    </Box>
  );
}

// ─── edit / create ────────────────────────────────────────────────────────────

interface FeeStructure {
  id: string;
  course_type: string;
  display_name: string;
  fee_amount: number;
  single_payment_discount?: number | null;
  installment_1_amount?: number | null;
  installment_2_amount?: number | null;
}

/** "Pay in full: ₹25,000 (saves ₹5,000)" / "Two installments: ₹16,500 now, ₹13,500 within 45 days". */
function OfferPreview({ offer, dueDays = 45 }: { offer: StudentPayOffer; dueDays?: number }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover', display: 'flex', flexDirection: 'column', gap: 0.75 }} aria-live="polite">
      <Typography variant="caption" color="text.secondary" fontWeight={700}>
        The student chooses
      </Typography>
      <Typography variant="body2">
        <strong>Pay in full: {formatRupees(offer.fullAmount)}</strong>
        {offer.savings > 0 ? ` (saves ${formatRupees(offer.savings)})` : ''}
      </Typography>
      {offer.allowsInstallments && offer.installment1 !== null && offer.installment2 !== null ? (
        <Typography variant="body2">
          <strong>Two installments:</strong> {formatRupees(offer.installment1)} now, {formatRupees(offer.installment2)} within {dueDays} days
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary">
          Full payment only. This fee structure has no installments.
        </Typography>
      )}
    </Paper>
  );
}

/** The WhatsApp message for a student-pays link: choose a plan, pay, done. */
function studentPayShareMessage(link: any): string {
  const first = String(link.student_name || '').trim().split(/\s+/)[0] || 'there';
  const offer = offerFromLink(link);
  const expiry = link.expires_at ? formatDueDate(String(link.expires_at).slice(0, 10)) : null;
  const plans =
    `Pay in full: ${formatRupees(offer.fullAmount)}${offer.savings > 0 ? ` (save ${formatRupees(offer.savings)})` : ''}` +
    (offer.allowsInstallments && offer.installment1 !== null && offer.installment2 !== null
      ? `, or ${formatRupees(offer.installment1)} now and ${formatRupees(offer.installment2)} later.`
      : '.');
  return [
    `Hi ${first}, welcome to Neram Classes.`,
    '',
    'Choose your plan and pay securely here:',
    link.url,
    '',
    plans,
    '',
    expiry ? `The link works until ${expiry}.` : 'The link works for 7 days.',
    'Reply here if you need any help.',
  ].join('\n');
}

function EditForm({
  form,
  prefill,
  editingLink,
  loadError,
  adminId,
  onCancel,
  onSaved,
}: {
  form: ReturnType<typeof useEnrolmentLinkForm>;
  prefill?: EnrolmentLinkPrefill;
  editingLink: any;
  loadError: string | null;
  adminId: string;
  onCancel: () => void;
  /** change is null when nothing was saved (the student already had a link). */
  onSaved: (link: any, change: EnrolmentLinkChange | null, message: string | null) => void;
}) {
  const { values, set, plan, errors, isValid, setShowErrors, setServerErrors, fullPhone } = form;
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [editStudent, setEditStudent] = useState(!prefill?.userId && !editingLink);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(loadError);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/fee-structures?isActive=true')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => !cancelled && setFeeStructures(j.data || []))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const feeOptions = feeStructures.filter(
    (fs) => values.interestCourse === 'both' || fs.course_type === values.interestCourse || fs.course_type === 'both',
  );

  const finalFee = plan.finalFee;
  const studentPays = values.paymentMode === 'student_pays';
  const selectedFs = feeStructures.find((f) => f.id === values.feeStructureId) || null;
  const offer = useMemo(
    () => (selectedFs ? buildStudentPayOffer(selectedFs, values.discount) : null),
    [selectedFs, values.discount],
  );
  const offerDueDays = Number(editingLink?.offer_balance_due_days) || 45;

  const setFee =(key: 'totalFee' | 'discount', raw: string) => {
    const v = raw.replace(/[^\d]/g, '');
    set(key, v);
    if (values.scheme === 'full') {
      const total = Number(key === 'totalFee' ? v : values.totalFee) || 0;
      const discount = Number(key === 'discount' ? v : values.discount) || 0;
      if (total > 0) set('amountPaid', String(Math.max(0, total - discount)));
    }
  };

  const proofUpload = async (file: File): Promise<{ url: string }> => {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/direct-enrollment/upload', { method: 'POST', body });
    const json = await readJson(res);
    if (!res.ok) throw new Error(json.error || 'Upload failed.');
    return { url: json.url };
  };

  const submit = async () => {
    setShowErrors(true);
    if (!isValid) {
      setError('Check the highlighted fields.');
      return;
    }
    if (studentPays && offer && offer.fullAmount <= 0) {
      setServerErrors({ discount: 'The discount leaves nothing to pay.' });
      setError('Check the highlighted fields.');
      return;
    }
    setSaving(true);
    setError(null);
    const common = {
      adminId,
      linkId: editingLink?.id || undefined,
      studentName: values.studentName.trim(),
      studentPhone: fullPhone || undefined,
      studentEmail: values.email.trim() || undefined,
      interestCourse: values.interestCourse,
      learningMode: values.learningMode,
      adminNotes: values.adminNotes.trim() || undefined,
      userId: editingLink ? undefined : prefill?.userId,
      demoRegistrationId: editingLink ? undefined : prefill?.demoRegistrationId,
    };
    try {
      const res = await fetch('/api/direct-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          studentPays
            ? {
                ...common,
                paymentMode: 'student_pays',
                feeStructureId: values.feeStructureId,
                discountAmount: Number(values.discount) || 0,
              }
            : {
                ...common,
                paymentMode: 'recorded',
                // The fee plan picked only fills the fee; still record which one it was.
                feeStructureId: values.feeStructureId || undefined,
                totalFee: Number(values.totalFee) || 0,
                discountAmount: Number(values.discount) || 0,
                paymentScheme: values.scheme,
                amountPaid: Number(values.amountPaid) || 0,
                balanceDueDate: values.scheme === 'installment' ? values.balanceDueDate : undefined,
                paymentMethod: values.paymentMethod,
                paymentDate: values.paymentDate || undefined,
                transactionReference: values.transactionReference.trim() || undefined,
                paymentProofUrl: values.paymentProofUrl || undefined,
              },
        ),
      });
      const json = await readJson(res);
      if (res.status === 409 && json.code === 'ACTIVE_LINK_EXISTS' && json.existing) {
        onSaved(json.existing, null, json.error);
        return;
      }
      if (!res.ok) {
        if (json.fieldErrors) setServerErrors(json.fieldErrors as FieldErrors);
        throw new Error(json.error || 'Could not save the link.');
      }
      onSaved(
        json.data,
        editingLink ? 'updated' : 'created',
        editingLink ? 'Saved. The student keeps the same link.' : 'Link ready. Send it to the student below.',
      );
    } catch (err: any) {
      setError(err?.message || 'Could not save the link.');
    } finally {
      setSaving(false);
    }
  };

  const paymentDay = values.paymentDate || istToday();
  const country = COUNTRY_CODES.find((c) => c.code === values.country) || COUNTRY_CODES[0];

  return (
    <>
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} role="alert">
            {error}
          </Alert>
        )}
        {editingLink && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Changes keep the same link, so the student does not need a new one. The link is valid for 7 days from saving.
          </Alert>
        )}

        {/* How the money comes in */}
        <Typography component="h3" id="enrol-pay-mode-label" sx={SECTION_LABEL_SX}>Payment</Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={values.paymentMode}
          onChange={(_, v) => v && set('paymentMode', v)}
          aria-labelledby="enrol-pay-mode-label"
          color="primary"
          sx={{ mb: 1 }}
        >
          <ToggleButton value="student_pays" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, gap: 1 }}>
            <PhonelinkRingOutlinedIcon fontSize="small" aria-hidden />
            Student pays online
          </ToggleButton>
          <ToggleButton value="recorded" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, gap: 1 }}>
            <ReceiptLongOutlinedIcon fontSize="small" aria-hidden />
            Already received
          </ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {studentPays
            ? 'The student picks pay in full or two installments on the link, pays the trust by UPI or bank, and sends the UTR. You verify it before they are enrolled.'
            : 'You already have the money. Record what was paid and the student fills in their details on the link.'}
        </Typography>

        {/* Student */}
        <Typography component="h3" sx={SECTION_LABEL_SX}>Student</Typography>
        {!editStudent ? (
          <Paper variant="outlined" sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={600} noWrap>{values.studentName || 'No name'}</Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {[fullPhone, values.email].filter(Boolean).join(' · ') || 'No phone or email'}
              </Typography>
            </Box>
            <Button onClick={() => setEditStudent(true)} startIcon={<EditOutlinedIcon />} sx={{ minHeight: 44 }}>
              Edit
            </Button>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
            <TextField
              label="Student name"
              value={values.studentName}
              onChange={(e) => set('studentName', e.target.value)}
              required
              fullWidth
              autoFocus={!values.studentName}
              error={Boolean(errors.studentName)}
              helperText={errors.studentName}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 1 }}>
              <TextField
                select
                label="Code"
                value={values.country}
                onChange={(e) => {
                  set('country', e.target.value);
                  set('phone', '');
                }}
              >
                {COUNTRY_CODES.map((c) => (
                  <MenuItem key={c.code} value={c.code}>
                    {c.prefix} {c.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Phone"
                value={values.phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  if (digits.length <= country.length) set('phone', digits);
                }}
                inputProps={{ inputMode: 'numeric', autoComplete: 'tel-national' }}
                error={Boolean(errors.phone)}
                helperText={errors.phone}
              />
            </Box>
            <TextField
              label="Email (to send the link by email)"
              type="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              error={Boolean(errors.email)}
              helperText={errors.email}
              inputProps={{ autoComplete: 'email' }}
            />
          </Box>
        )}

        {/* Course */}
        <Typography component="h3" sx={SECTION_LABEL_SX}>Course</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <Box sx={TWO_COL}>
            <TextField
              select
              label="Course"
              value={values.interestCourse}
              onChange={(e) => {
                set('interestCourse', e.target.value);
                set('feeStructureId', '');
              }}
              required
            >
              {COURSE_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <Box>
              <ToggleButtonGroup
                exclusive
                fullWidth
                value={values.learningMode}
                onChange={(_, v) => v && set('learningMode', v)}
                aria-label="How they will learn"
                color="primary"
                sx={{ height: 56 }}
              >
                <ToggleButton value="online_only" sx={{ textTransform: 'none' }}>Online</ToggleButton>
                <ToggleButton value="hybrid" sx={{ textTransform: 'none' }}>Hybrid</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>
          {studentPays && (
            <>
              {feeOptions.length > 0 ? (
                <TextField
                  select
                  label="Fee structure"
                  value={feeOptions.some((f) => f.id === values.feeStructureId) ? values.feeStructureId : ''}
                  onChange={(e) => set('feeStructureId', e.target.value)}
                  required
                  error={Boolean(errors.feeStructureId)}
                  helperText={errors.feeStructureId || 'The offer comes from this fee structure.'}
                  SelectProps={{ MenuProps: { PaperProps: { sx: { maxWidth: 480 } } } }}
                >
                  {feeOptions.map((fs) => (
                    <MenuItem key={fs.id} value={fs.id} sx={{ whiteSpace: 'normal' }}>
                      {fs.display_name} ({formatRupees(fs.fee_amount)})
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Alert severity="warning">
                  There is no active fee structure for this course yet. Add one in Fee structures, or choose Already received.
                </Alert>
              )}
              <MoneyField
                label="Extra discount (optional)"
                value={values.discount}
                onChange={(v) => set('discount', v)}
                error={errors.discount}
                helperText="Comes off both plans, on top of the pay in full saving."
              />
              {offer && <OfferPreview offer={offer} dueDays={offerDueDays} />}
            </>
          )}
          {!studentPays && feeOptions.length > 0 && (
            <TextField
              select
              label="Fee plan (fills the fee)"
              value={feeOptions.some((f) => f.id === values.feeStructureId) ? values.feeStructureId : ''}
              onChange={(e) => {
                const fs = feeOptions.find((f) => f.id === e.target.value);
                set('feeStructureId', e.target.value);
                if (fs) setFee('totalFee', String(fs.fee_amount));
              }}
              SelectProps={{ MenuProps: { PaperProps: { sx: { maxWidth: 480 } } } }}
            >
              <MenuItem value="">Type the fee myself</MenuItem>
              {feeOptions.map((fs) => (
                <MenuItem key={fs.id} value={fs.id} sx={{ whiteSpace: 'normal' }}>
                  {fs.display_name} ({formatRupees(fs.fee_amount)})
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>

        {!studentPays && (
          <>
        {/* Fee and payment plan */}
        <Typography component="h3" sx={SECTION_LABEL_SX}>Fee and payment plan</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <Box sx={TWO_COL}>
            <MoneyField
              label="Total fee"
              value={values.totalFee}
              onChange={(v) => setFee('totalFee', v)}
              error={errors.totalFee}
              required
            />
            <MoneyField label="Discount" value={values.discount} onChange={(v) => setFee('discount', v)} error={errors.discount} />
          </Box>
          {finalFee !== null && finalFee > 0 && (
            <Typography variant="body2" color="text.secondary">
              Fee after discount: <Box component="span" sx={{ color: 'text.primary', fontWeight: 700 }}>{formatRupees(finalFee)}</Box>
            </Typography>
          )}

          <ToggleButtonGroup
            exclusive
            fullWidth
            value={values.scheme}
            onChange={(_, v) => v && set('scheme', v)}
            aria-label="Payment plan"
            color="primary"
          >
            <ToggleButton value="full" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}>Paid in full</ToggleButton>
            <ToggleButton value="installment" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }}>Two installments</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={TWO_COL}>
            <MoneyField
              label={values.scheme === 'installment' ? 'Paid now (1st installment)' : 'Amount paid'}
              value={values.amountPaid}
              onChange={(v) => set('amountPaid', v)}
              error={errors.amountPaid}
              required
            />
            {values.scheme === 'installment' && (
              <TextField
                label="Balance (2nd installment)"
                value={plan.balance !== null && plan.balance > 0 ? Math.round(plan.balance).toLocaleString('en-IN') : ''}
                InputProps={{
                  readOnly: true,
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                }}
                helperText="Works itself out"
                sx={{ '& .MuiInputBase-root': { bgcolor: 'action.hover' } }}
              />
            )}
          </Box>

          {values.scheme === 'installment' && (
            <Box>
              <TextField
                label="Balance due by"
                type="date"
                value={values.balanceDueDate}
                onChange={(e) => set('balanceDueDate', e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: paymentDay }}
                error={Boolean(errors.balanceDueDate)}
                helperText={errors.balanceDueDate || 'Reminders start 3 days before. The student shows in Collections.'}
              />
              <ToggleButtonGroup
                exclusive
                size="small"
                color="primary"
                value={BALANCE_DUE_PRESETS.find((d) => addDaysToKey(paymentDay, d) === values.balanceDueDate) ?? null}
                onChange={(_, days) => days && set('balanceDueDate', addDaysToKey(paymentDay, days))}
                aria-label="Quick due dates, counted from the payment date"
                sx={{ mt: 1 }}
              >
                {BALANCE_DUE_PRESETS.map((days) => (
                  <ToggleButton key={days} value={days} sx={{ minHeight: 40, px: 2, textTransform: 'none' }}>
                    {days} days
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}

          {plan.paid !== null && plan.paid > 0 && finalFee !== null && finalFee > 0 && plan.errors.length === 0 && (
            <Paper
              variant="outlined"
              sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: 'action.hover' }}
              aria-live="polite"
            >
              <EventOutlinedIcon color="primary" />
              <Typography variant="body2">
                {values.scheme === 'installment' && plan.balance !== null && plan.balance > 0 ? (
                  <>
                    <strong>{formatRupees(plan.paid)}</strong> paid now, <strong>{formatRupees(plan.balance)}</strong>
                    {values.balanceDueDate ? ` due by ${formatDueDate(values.balanceDueDate)}` : ' later'}.
                  </>
                ) : (
                  <>
                    <strong>{formatRupees(plan.paid)}</strong> paid in full. Nothing left to collect.
                  </>
                )}
              </Typography>
            </Paper>
          )}
        </Box>

        {/* Payment received */}
        <Typography component="h3" sx={SECTION_LABEL_SX}>Payment received</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <Box sx={TWO_COL}>
            <TextField select label="Paid by" value={values.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Payment date"
              type="date"
              value={values.paymentDate}
              onChange={(e) => set('paymentDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: istToday() }}
              error={Boolean(errors.paymentDate)}
              helperText={errors.paymentDate}
            />
          </Box>
          {values.paymentMethod !== 'cash' && (
            <TextField
              label="Transaction reference (UTR)"
              value={values.transactionReference}
              onChange={(e) => set('transactionReference', e.target.value)}
              placeholder="Optional"
            />
          )}
          <ImageUploadField
            label="Payment proof (optional)"
            value={values.paymentProofUrl || null}
            onChange={(url) => set('paymentProofUrl', url || '')}
            upload={proofUpload}
            accept="image/*,.pdf"
            maxSizeMB={5}
          />
        </Box>
          </>
        )}

        {/* Notes */}
        <Typography component="h3" sx={SECTION_LABEL_SX}>Notes for staff</Typography>
        <TextField
          value={values.adminNotes}
          onChange={(e) => set('adminNotes', e.target.value)}
          fullWidth
          multiline
          minRows={2}
          placeholder="Only staff see this"
          inputProps={{ 'aria-label': 'Notes for staff' }}
        />
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          flexShrink: 0,
        }}
      >
        <Button onClick={onCancel} disabled={saving} sx={{ minHeight: 44 }}>
          {editingLink ? 'Back' : 'Cancel'}
        </Button>
        <Button
          variant="contained"
          onClick={submit}
          disabled={saving || !adminId}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : null}
          sx={{ minHeight: 44, minWidth: 160, fontWeight: 600 }}
        >
          {saving ? 'Saving' : editingLink ? 'Save changes' : 'Generate link'}
        </Button>
      </Box>
    </>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  error,
  required,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  helperText?: string;
}) {
  return (
    <TextField
      label={label}
      value={value ? Number(value).toLocaleString('en-IN') : ''}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
      required={required}
      inputProps={{ inputMode: 'numeric' }}
      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
      error={Boolean(error)}
      helperText={error || helperText}
    />
  );
}

// ─── link ready / view ────────────────────────────────────────────────────────

function LinkView({
  link,
  notice,
  adminId,
  onEdit,
  onReload,
  onLinkReplaced,
}: {
  link: any;
  notice: string | null;
  adminId: string;
  onEdit: () => void;
  onReload: (id: string, change?: EnrolmentLinkChange) => Promise<void>;
  onLinkReplaced: (link: any, change: EnrolmentLinkChange) => void;
}) {
  const { copied, copy } = useCopyToClipboard(2500);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [waBlock, setWaBlock] = useState<string | null | undefined>(undefined);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [verifyNote, setVerifyNote] = useState<{ kind: 'verify' | 'reject'; text: string } | null>(null);

  const status = STATUS[link.status] || STATUS.active;
  const isActive = link.status === 'active';
  const finalFee = Number(link.final_fee) || 0;
  const paid = Number(link.amount_paid) || 0;
  const scheme = link.payment_scheme === 'installment' || finalFee - paid > 0.01 ? 'installment' : 'full';
  const studentPays = link.payment_mode === 'student_pays';
  const waiting = link.status === 'payment_submitted';
  // Student pays and not verified yet: nothing is paid, so show the offer, not "Paid ₹0".
  const showOffer = studentPays && link.status !== 'used';
  const offer = showOffer ? offerFromLink(link) : null;
  const dueDays = Number(link.offer_balance_due_days) || 45;
  const planLines = offer
    ? [
        `Pay in full: ${formatRupees(offer.fullAmount)}${offer.savings > 0 ? ` (saves ${formatRupees(offer.savings)})` : ''}`,
        offer.allowsInstallments && offer.installment1 !== null && offer.installment2 !== null
          ? `Two installments: ${formatRupees(offer.installment1)} now, ${formatRupees(offer.installment2)} within ${dueDays} days`
          : 'Two installments: not offered',
        ...(Number(link.discount_amount) > 0 ? [`Extra discount: ${formatRupees(Number(link.discount_amount))}`] : []),
      ]
    : enrolmentPlanLines({ finalFee, amountPaid: paid, scheme, balanceDueDate: link.installment_2_due_date });
  const message = useMemo(
    () =>
      showOffer
        ? studentPayShareMessage(link)
        : enrolmentShareMessage({
            studentName: link.student_name,
            url: link.url,
            finalFee,
            amountPaid: paid,
            scheme,
            balanceDueDate: link.installment_2_due_date,
            expiresAt: link.expires_at,
          }),
    [link, finalFee, paid, scheme, showOffer],
  );

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    fetch(`/api/direct-enrollment/${link.id}/share`)
      .then((r) => (r.ok ? r.json() : { whatsappBlock: null }))
      .then((j) => !cancelled && setWaBlock(j.whatsappBlock ?? null))
      .catch(() => !cancelled && setWaBlock(null));
    return () => {
      cancelled = true;
    };
  }, [link.id, isActive]);

  const record = async (channel: string) => {
    const res = await fetch(`/api/direct-enrollment/${link.id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, adminId }),
    });
    const json = await readJson(res);
    if (!res.ok) throw new Error(json.error || 'Could not share the link.');
  };

  const share = async (channel: 'copy' | 'whatsapp_open' | 'email' | 'whatsapp_auto') => {
    setResult(null);
    if (channel === 'copy') {
      const ok = await copy(link.url);
      if (!ok) {
        setResult({ kind: 'error', text: 'Could not copy. Select the link and copy it by hand.' });
        return;
      }
      record('copy').then(() => onReload(link.id)).catch(() => undefined);
      return;
    }
    if (channel === 'whatsapp_open') {
      window.open(waUrl(link.student_phone, message), '_blank', 'noopener');
      record('whatsapp_open').then(() => onReload(link.id)).catch(() => undefined);
      return;
    }
    setBusy(channel);
    try {
      await record(channel);
      setResult({
        kind: 'success',
        text: channel === 'email' ? `Emailed to ${link.student_email}.` : 'Sent on WhatsApp.',
      });
      await onReload(link.id);
    } catch (err: any) {
      setResult({ kind: 'error', text: err?.message || 'Could not send.' });
      onReload(link.id).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const cancelLink = async () => {
    setBusy('cancel');
    try {
      const res = await fetch(`/api/direct-enrollment/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', adminId }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Could not cancel the link.');
      setConfirmCancel(false);
      await onReload(link.id, 'cancelled');
    } catch (err: any) {
      setResult({ kind: 'error', text: err?.message || 'Could not cancel the link.' });
    } finally {
      setBusy(null);
    }
  };

  const renew = async () => {
    setBusy('renew');
    setResult(null);
    try {
      const res = await fetch(`/api/direct-enrollment/${link.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error || 'Could not make a new link.');
      const res2 = await fetch(`/api/direct-enrollment/${json.data.id}`);
      const json2 = await readJson(res2);
      onLinkReplaced(res2.ok ? json2.data : json.data, 'regenerated');
      setResult({ kind: 'success', text: 'New link ready. The old one no longer works, so send this one.' });
    } catch (err: any) {
      setResult({ kind: 'error', text: err?.message || 'Could not make a new link.' });
    } finally {
      setBusy(null);
    }
  };

  const events: any[] = link.events || [];

  return (
    <>
      <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {notice && (
          <Alert severity={notice.startsWith('Link ready') || notice.startsWith('Saved') ? 'success' : 'info'} sx={{ mb: 2 }}>
            {notice}
          </Alert>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Chip label={status.label} color={status.color} size="small" sx={{ fontWeight: 600 }} />
          <Typography variant="body2" color="text.secondary">
            Made by {link.created_by_name || 'staff'} on {shortDate(link.created_at)}
            {isActive && link.expires_at ? `, works until ${shortDate(link.expires_at)}` : ''}
          </Typography>
        </Box>

        {verifyNote && (
          <Alert severity={verifyNote.kind === 'verify' ? 'success' : 'info'} role="status" sx={{ mb: 2 }} onClose={() => setVerifyNote(null)}>
            {verifyNote.text}
          </Alert>
        )}

        {waiting && (
          <Box sx={{ mb: 2 }}>
            <VerifyPaymentCard
              linkId={link.id}
              adminId={adminId}
              onChanged={(decision, text) => {
                setVerifyNote({ kind: decision, text });
                onReload(link.id, decision === 'verify' ? 'payment_verified' : 'payment_rejected').catch(() => undefined);
              }}
            />
          </Box>
        )}

        {isActive && studentPays && link.rejection_reason && !verifyNote && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Payment rejected: {String(link.rejection_reason).replace(/[.\s]+$/, '')}. Waiting for the student to pay again.
          </Alert>
        )}

        {link.status === 'used' && !verifyNote && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {link.student_name} completed enrolment{link.used_at ? ` on ${shortDate(link.used_at)}` : ''}.
          </Alert>
        )}
        {(link.status === 'expired' || link.status === 'cancelled') && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" onClick={renew} disabled={busy === 'renew'} startIcon={<RefreshIcon />} sx={{ minHeight: 44 }}>
                {busy === 'renew' ? 'Making' : 'Make a new link'}
              </Button>
            }
          >
            This link {link.status === 'expired' ? 'has expired' : 'was cancelled'} and no longer works.
          </Alert>
        )}

        {isActive && (
          <>
            <Typography component="h3" sx={SECTION_LABEL_SX}>Link</Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <TextField
                value={link.url}
                fullWidth
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                inputProps={{ 'aria-label': 'Enrolment link', onFocus: (e: any) => e.target.select() }}
              />
              <Button
                variant="contained"
                onClick={() => share('copy')}
                startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
                sx={{ minHeight: 48, minWidth: 128, fontWeight: 600, flexShrink: 0 }}
              >
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            </Box>

            <Typography component="h3" sx={SECTION_LABEL_SX}>Send to the student</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1, mb: 1 }}>
              <Tooltip title={link.student_email ? `To ${link.student_email}` : 'Add an email with Edit details first'}>
                <span>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={busy === 'email' ? <CircularProgress size={18} /> : <EmailOutlinedIcon />}
                    onClick={() => share('email')}
                    disabled={!link.student_email || busy !== null}
                    sx={{ minHeight: 48 }}
                  >
                    Email
                  </Button>
                </span>
              </Tooltip>
              <Button
                fullWidth
                variant="outlined"
                color="success"
                startIcon={<WhatsAppIcon />}
                onClick={() => share('whatsapp_open')}
                disabled={busy !== null}
                sx={{ minHeight: 48 }}
              >
                Open WhatsApp
              </Button>
              <Tooltip title={waBlock ? 'Held: our WhatsApp account cannot send automatically yet' : 'Send from the Neram WhatsApp number'}>
                <span>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={busy === 'whatsapp_auto' ? <CircularProgress size={18} /> : <SendOutlinedIcon />}
                    onClick={() => share('whatsapp_auto')}
                    disabled={!link.student_phone || Boolean(waBlock) || waBlock === undefined || busy !== null}
                    sx={{ minHeight: 48 }}
                  >
                    Send auto
                  </Button>
                </span>
              </Tooltip>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              {waBlock
                ? 'Automatic WhatsApp is on hold while Meta blocks our account. Open WhatsApp sends from your own phone.'
                : 'Open WhatsApp starts a chat from your phone with the message ready to send.'}
              {link.share_count > 0 && link.last_shared_at ? ` Shared ${link.share_count} times, last on ${dateTime(link.last_shared_at)}.` : ''}
            </Typography>
            {result && (
              <Alert severity={result.kind} sx={{ mb: 2 }} role={result.kind === 'error' ? 'alert' : 'status'} onClose={() => setResult(null)}>
                {result.text}
              </Alert>
            )}
          </>
        )}
        {!isActive && result && (
          <Alert severity={result.kind} sx={{ mb: 2 }} onClose={() => setResult(null)}>
            {result.text}
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
          <Typography component="h3" sx={{ ...SECTION_LABEL_SX, mb: 0 }}>Course and fees</Typography>
          {!showOffer && (
          <InvoiceDownload
            linkData={{
              studentName: link.student_name,
              studentPhone: link.student_phone || '',
              courseName: COURSE_LABEL[link.interest_course] || link.interest_course,
              totalFee: Number(link.total_fee) || 0,
              discountAmount: Number(link.discount_amount) || 0,
              finalFee,
              amountPaid: paid,
              paymentMethod: PAYMENT_METHOD_OPTIONS.find((m) => m.value === link.payment_method)?.label || link.payment_method,
              transactionReference: link.transaction_reference || '',
              paymentDate: link.payment_date || link.created_at,
              token: link.token,
            }}
            variant="text"
            size="small"
          />
          )}
        </Box>
        <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 1 }}>
          <Row label="Course" value={`${COURSE_LABEL[link.interest_course] || link.interest_course}, ${link.learning_mode === 'online_only' ? 'Online' : 'Hybrid'}`} />
          {planLines.map((line) => {
            const at = line.indexOf(':');
            return <Row key={line} label={line.slice(0, at)} value={line.slice(at + 1).trim()} strong={line.startsWith('Balance')} />;
          })}
          {showOffer && (
            <Row
              label="Payment"
              value={waiting ? 'Student paid online, waiting for you to verify' : 'Student pays online, not paid yet'}
            />
          )}
          {!showOffer && (
          <Row
            label="Paid by"
            value={[
              PAYMENT_METHOD_OPTIONS.find((m) => m.value === link.payment_method)?.label || link.payment_method,
              link.payment_date ? shortDate(link.payment_date) : null,
              link.transaction_reference ? `Ref ${link.transaction_reference}` : null,
            ]
              .filter(Boolean)
              .join(', ')}
          />
          )}
          {link.payment_proof_url && !showOffer && (
            <>
              <Typography component="dt" variant="body2" color="text.secondary">Proof</Typography>
              <Typography component="dd" variant="body2" sx={{ m: 0 }}>
                <Box component="a" href={link.payment_proof_url} target="_blank" rel="noopener noreferrer" sx={{ color: 'primary.main', display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 32 }}>
                  View payment proof <OpenInNewIcon sx={{ fontSize: 16 }} />
                </Box>
              </Typography>
            </>
          )}
          {link.student_phone && <Row label="Phone" value={link.student_phone} />}
          {link.student_email && <Row label="Email" value={link.student_email} />}
        </Box>
        {link.admin_notes && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, whiteSpace: 'pre-wrap' }}>
            {link.admin_notes}
          </Typography>
        )}

        {events.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography component="h3" sx={SECTION_LABEL_SX}>Activity</Typography>
            <Box component="ol" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {events.map((e) => (
                <Box component="li" key={e.id} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                    {EVENT_LABEL[e.kind] || e.kind}
                    {e.actor_name ? ` by ${e.actor_name}` : ''}
                    {e.kind.endsWith('_failed') && e.meta?.error ? (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {String(e.meta.error).slice(0, 160)}
                      </Typography>
                    ) : null}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {dateTime(e.created_at)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </>
        )}

        <Box sx={{ mt: 2 }}>
          <Button
            component="a"
            href={`/direct-enrollment?highlight=${link.id}`}
            size="small"
            endIcon={<OpenInNewIcon />}
            sx={{ minHeight: 44 }}
          >
            Open in Direct Enroll
          </Button>
        </Box>
      </Box>

      {isActive && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1.5,
            px: { xs: 2, sm: 3 },
            py: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            flexShrink: 0,
          }}
        >
          <Button color="error" onClick={() => setConfirmCancel(true)} disabled={busy !== null} sx={{ minHeight: 44 }}>
            Cancel link
          </Button>
          <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEdit} disabled={busy !== null} sx={{ minHeight: 44, fontWeight: 600 }}>
            Edit details
          </Button>
        </Box>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancelLink}
        title="Cancel this link?"
        message={`${link.student_name} will not be able to use this link any more. You can make a new one later.`}
        confirmLabel={busy === 'cancel' ? 'Cancelling' : 'Cancel link'}
        loading={busy === 'cancel'}
      />
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
      <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: strong ? 700 : 500, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </>
  );
}
