'use client';

/**
 * "Payment details": where students pay through a student-pays enrolment link.
 * The enrol page reads this live, so a save applies to every open link at once.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Divider, MenuItem, Paper, TextField, Typography } from '@neram/ui';
import PaymentQrCodesField, { qrRowsToSetting, qrSettingToRows, type QrCodeRow } from './PaymentQrCodesField';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { OpsSkeleton, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

interface PayeeForm {
  upiId: string;
  payeeName: string;
  gpayNumber: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch: string;
  accessUntilLabel: string;
  whatsappNumber: string;
  /** How long a new enrolment link stays open: 7, 14 or 30 days. */
  linkDays: string;
}

type PayeeErrors = Partial<Record<keyof PayeeForm | 'form', string>>;

function toForm(p: any, linkDays?: number): PayeeForm {
  return {
    whatsappNumber: p?.whatsappNumber || '',
    linkDays: String(linkDays || 14),
    upiId: p?.upiId || '',
    payeeName: p?.payeeName || '',
    gpayNumber: p?.gpayNumber || '',
    accountName: p?.bank?.accountName || '',
    accountNumber: p?.bank?.accountNumber || '',
    ifsc: p?.bank?.ifsc || '',
    bankName: p?.bank?.bankName || '',
    branch: p?.bank?.branch || '',
    accessUntilLabel: p?.accessUntilLabel || '',
  };
}

const sameForm = (a: PayeeForm | null, b: PayeeForm | null) => JSON.stringify(a) === JSON.stringify(b);

export default function PaymentDetailsCard() {
  const { supabaseUserId } = useAdminProfile();
  const [saved, setSaved] = useState<PayeeForm | null>(null);
  const [form, setForm] = useState<PayeeForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<PayeeErrors>({});
  const [notice, setNotice] = useState(false);
  const [qrRows, setQrRows] = useState<QrCodeRow[]>([]);
  const [savedQr, setSavedQr] = useState<QrCodeRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/settings/payment-payee', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the payment details.');
      const next = toForm(json.payee, json.linkDays);
      setSaved(next);
      setForm(next);
      const rows = qrSettingToRows(json.qrCodes);
      setSavedQr(rows);
      setQrRows(rows);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load the payment details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => !sameForm(form, saved) || JSON.stringify(qrRows) !== JSON.stringify(savedQr), [form, saved, qrRows, savedQr]);

  const update = (key: keyof PayeeForm, value: string) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => (e[key] || e.form ? { ...e, [key]: undefined, form: undefined } : e));
    setNotice(false);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    setNotice(false);
    try {
      const res = await fetch('/api/settings/payment-payee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: supabaseUserId || undefined,
          payee: {
            upiId: form.upiId.trim(),
            payeeName: form.payeeName.trim(),
            // An empty number means "do not show one", not "use the default".
            gpayNumber: form.gpayNumber.trim() || null,
            bank: {
              accountName: form.accountName.trim(),
              accountNumber: form.accountNumber.replace(/\s/g, ''),
              ifsc: form.ifsc.trim().toUpperCase(),
              bankName: form.bankName.trim(),
              branch: form.branch.trim(),
            },
            accessUntilLabel: form.accessUntilLabel.trim(),
            whatsappNumber: form.whatsappNumber.trim() || null,
          },
          qrCodes: qrRowsToSetting(qrRows),
          linkDays: Number(form.linkDays) || 14,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors({ ...(json.fieldErrors || {}), form: json.error || 'Could not save.' });
        return;
      }
      const next = toForm(json.payee, json.linkDays);
      setSaved(next);
      setForm(next);
      const rows = qrSettingToRows(json.qrCodes);
      setSavedQr(rows);
      setQrRows(rows);
      setNotice(true);
    } catch (err: any) {
      setErrors({ form: err?.message || 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof PayeeForm, label: string, extra?: { help?: string; numeric?: boolean; upper?: boolean }) => (
    <TextField
      id={`payee-${key}`}
      label={label}
      value={form?.[key] ?? ''}
      onChange={(e) => update(key, extra?.upper ? e.target.value.toUpperCase() : e.target.value)}
      error={Boolean(errors[key])}
      helperText={errors[key] || extra?.help || ' '}
      inputProps={{
        'aria-invalid': Boolean(errors[key]),
        ...(extra?.numeric ? { inputMode: 'numeric' as const } : {}),
      }}
      fullWidth
    />
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <AccountBalanceOutlinedIcon color="primary" aria-hidden sx={{ mt: 0.25 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Payment details
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Students see these on the payment page. A personal UPI ID is limited to about ₹1 lakh and 20 payments a day; switch to a
            business UPI ID linked to the trust account when you have one.
          </Typography>
        </Box>
      </Box>
      <Divider />

      {loading ? (
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }} aria-busy="true" aria-label="Loading the payment details">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={56} />
          ))}
        </Box>
      ) : loadError || !form ? (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none', ...TARGET_44 }}>
                Try again
              </Button>
            }
          >
            {loadError || 'Could not load the payment details.'}
          </Alert>
        </Box>
      ) : (
        <Box component="form" noValidate onSubmit={save} sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
          {errors.form && (
            <Alert severity="error" role="alert">
              {errors.form}
            </Alert>
          )}

          <Typography variant="subtitle2" component="h3" fontWeight={700}>
            UPI
          </Typography>
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {field('upiId', 'UPI ID', { help: 'Like name@bank. The QR and pay button use it.' })}
            {field('payeeName', 'Payee name', { help: 'The name the UPI app shows.' })}
            {field('gpayNumber', 'GPay number', { numeric: true, help: 'Optional. Leave empty to hide it.' })}
            {field('whatsappNumber', 'WhatsApp for screenshots', { help: 'With the country code, like +91 88074 37399. Students can send the payment screenshot here instead of uploading it. Leave empty to hide that option.' })}
          </Box>

          <Typography variant="subtitle2" component="h3" fontWeight={700}>
            Official QR codes
          </Typography>
          <PaymentQrCodesField rows={qrRows} onChange={(rows) => { setQrRows(rows); setNotice(false); }} disabled={saving} />

          <Typography variant="subtitle2" component="h3" fontWeight={700}>
            Bank transfer
          </Typography>
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {field('accountName', 'Account name')}
            {field('accountNumber', 'Account number', { numeric: true })}
            {field('ifsc', 'IFSC', { upper: true, help: '11 characters, like KVBL0001928.' })}
            {field('bankName', 'Bank name')}
            {field('branch', 'Branch')}
          </Box>

          <Typography variant="subtitle2" component="h3" fontWeight={700}>
            Course access
          </Typography>
          <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {field('accessUntilLabel', 'Access until', { help: 'Shown with the pay in full benefits, like September 2027.' })}
            <TextField
              id="payee-linkDays"
              select
              label="New enrolment links stay open for"
              value={form?.linkDays ?? '14'}
              onChange={(e) => update('linkDays', e.target.value)}
              helperText="Staff can pick a different length per link, and extend any link later."
              fullWidth
            >
              <MenuItem value="7">7 days</MenuItem>
              <MenuItem value="14">14 days</MenuItem>
              <MenuItem value="30">30 days</MenuItem>
            </TextField>
          </Box>

          {notice && !dirty && (
            <Alert severity="success" role="status">
              Saved. Every open payment page uses these details now.
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
            {dirty && (
              <Typography variant="body2" color="text.secondary" role="status">
                Unsaved changes
              </Typography>
            )}
            <Button
              type="button"
              onClick={() => {
                setForm(saved);
                setQrRows(savedQr);
                setErrors({});
              }}
              disabled={saving || !dirty}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none' }}
            >
              Discard
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || !dirty}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', px: 3 }}
            >
              {saving ? 'Saving' : 'Save payment details'}
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
