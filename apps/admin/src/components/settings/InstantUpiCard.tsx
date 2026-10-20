'use client';

/**
 * Settings › Instant UPI: the switches and the policy for auto-confirming fees
 * from bank alerts, the watcher settings, and a short setup guide. Starts off
 * and in shadow mode; the founder flips both after the ₹1 live test. Secrets
 * are never here: they live in the Vercel env PAYMENT_WATCHER_SECRETS.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, FormControlLabel, Paper, TextField, Typography } from '@neram/ui';
import Switch from '@mui/material/Switch';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import PhoneAndroidOutlinedIcon from '@mui/icons-material/PhoneAndroidOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import type { PaymentMethodsSettings, PaymentWatchersSettings, WatcherHealth } from '@neram/database/payments';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { OpsSkeleton, StatusChip, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';

interface Form {
  enabled: boolean;
  shadowMode: boolean;
  orderMinutes: string;
  instantCapRupees: string;
  twoChannelRupees: string;
  silentAfterMinutes: string;
  upiProof: boolean;
  bankProof: boolean;
  smsKeywords: string;
  emailDomains: string;
  deviceIds: string;
  accountTail: string;
}

const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

function toForm(m: PaymentMethodsSettings, w: PaymentWatchersSettings): Form {
  return {
    enabled: m.upiAuto.enabled,
    shadowMode: m.upiAuto.shadowMode,
    orderMinutes: String(m.upiAuto.orderMinutes),
    instantCapRupees: String(Math.round(m.upiAuto.instantCapPaise / 100)),
    twoChannelRupees: String(Math.round(m.upiAuto.twoChannelAbovePaise / 100)),
    silentAfterMinutes: String(m.upiAuto.silentAfterMinutes),
    upiProof: m.upiProof.enabled,
    bankProof: m.bankProof.enabled,
    smsKeywords: w.smsSenderKeywords.join(', '),
    emailDomains: w.emailFromDomains.join(', '),
    deviceIds: w.deviceIds.join(', '),
    accountTail: w.accountTail || '',
  };
}

function fromForm(f: Form, m: PaymentMethodsSettings) {
  return {
    methods: {
      ...m,
      upiAuto: {
        enabled: f.enabled,
        shadowMode: f.shadowMode,
        orderMinutes: Number(f.orderMinutes),
        instantCapPaise: Math.round(Number(f.instantCapRupees) * 100),
        twoChannelAbovePaise: Math.round(Number(f.twoChannelRupees) * 100),
        silentAfterMinutes: Number(f.silentAfterMinutes),
      },
      upiProof: { enabled: f.upiProof },
      bankProof: { enabled: f.bankProof },
    },
    watchers: { smsSenderKeywords: list(f.smsKeywords), emailFromDomains: list(f.emailDomains), deviceIds: list(f.deviceIds), accountTail: f.accountTail.trim() || null },
  };
}

const same = (a: Form | null, b: Form | null) => JSON.stringify(a) === JSON.stringify(b);
const ago = (minutes: number) => (minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`);

export default function InstantUpiCard() {
  const { supabaseUserId } = useAdminProfile();
  const [methods, setMethods] = useState<PaymentMethodsSettings | null>(null);
  const [health, setHealth] = useState<WatcherHealth | null>(null);
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState(false);
  const [guide, setGuide] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/settings/payment-methods', { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the Instant UPI settings.');
      setMethods(json.methods);
      setHealth(json.health);
      const f = toForm(json.methods, json.watchers);
      setSaved(f);
      setForm(f);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load the Instant UPI settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => (prev[key] || prev.form ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key && k !== 'form')) : prev));
    setNotice(false);
  };

  const validate = (f: Form) => {
    const e: Record<string, string> = {};
    const num = (v: string, min: number, max: number) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max;
    };
    if (!num(f.orderMinutes, 5, 120)) e.orderMinutes = 'Between 5 and 120 minutes.';
    if (!num(f.instantCapRupees, 1, 10000000)) e.instantCapRupees = 'A rupee amount.';
    if (!num(f.twoChannelRupees, 1, 10000000)) e.twoChannelRupees = 'A rupee amount.';
    if (!num(f.silentAfterMinutes, 2, 120)) e.silentAfterMinutes = 'Between 2 and 120 minutes.';
    if (f.accountTail && !/^\d{4}$/.test(f.accountTail.trim())) e.accountTail = 'The last four digits, or leave it empty.';
    if (f.enabled && !f.shadowMode && list(f.deviceIds).length === 0) e.deviceIds = 'Add a watcher device id before going live.';
    return e;
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !methods) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setNotice(false);
    try {
      const res = await fetch('/api/settings/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fromForm(form, methods), adminId: supabaseUserId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors({ ...(json.fieldErrors || {}), form: json.error || 'Could not save.' });
        return;
      }
      setMethods(json.methods);
      setHealth(json.health);
      const f = toForm(json.methods, json.watchers);
      setSaved(f);
      setForm(f);
      setNotice(true);
    } catch {
      setErrors({ form: 'Could not save. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof Form, label: string, help: string, extra?: { numeric?: boolean; multiline?: boolean }) => (
    <TextField
      key={key}
      label={label}
      value={(form?.[key] as string) ?? ''}
      onChange={(e) => update(key, e.target.value as Form[typeof key])}
      error={Boolean(errors[key])}
      helperText={errors[key] || help}
      inputProps={{ 'aria-invalid': Boolean(errors[key]), ...(extra?.numeric ? { inputMode: 'numeric' as const } : {}) }}
      multiline={extra?.multiline}
      minRows={extra?.multiline ? 2 : undefined}
      fullWidth
    />
  );

  const mode = !form ? null : !form.enabled ? 'off' : form.shadowMode ? 'shadow' : 'live';

  return (
    <Paper id="instant-upi" variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', scrollMarginTop: 80 }}>
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <BoltOutlinedIcon color="primary" aria-hidden sx={{ mt: 0.25 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" fontWeight={700}>
            Instant UPI
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Students pay an exact tagged amount (₹25,000.37) and the bank alert confirms them, no screenshot. Start in shadow mode: every match is held for you to confirm with one click, nothing enrols on its own, until two weeks of real credits match correctly.
          </Typography>
        </Box>
      </Box>
      <Divider />

      {loading ? (
        <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }} aria-busy="true" aria-label="Loading the Instant UPI settings">
          {[0, 1, 2, 3].map((i) => (
            <OpsSkeleton key={i} variant="rounded" height={56} />
          ))}
        </Box>
      ) : loadError || !form ? (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
          <Alert severity="error" action={<Button color="inherit" startIcon={<RefreshIcon />} onClick={load} sx={{ textTransform: 'none', ...TARGET_44 }}>Try again</Button>}>
            {loadError || 'Could not load the Instant UPI settings.'}
          </Alert>
        </Box>
      ) : (
        <Box component="form" noValidate onSubmit={save} sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
          {/* Status */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            {mode === 'live' ? <StatusChip icon={BoltOutlinedIcon} label="Live: students see Instant UPI" tone="success" /> : mode === 'shadow' ? <StatusChip icon={BoltOutlinedIcon} label="Shadow: students see it, you confirm each match" tone="info" /> : <StatusChip icon={BoltOutlinedIcon} label="Off" tone="neutral" />}
            {health && health.sources.length === 0 && <StatusChip icon={PhoneAndroidOutlinedIcon} label="No watcher has reported yet" tone="warning" />}
            {health?.sources.map((s) => (
              <StatusChip key={s.source} icon={s.source.startsWith('email') ? MailOutlineIcon : PhoneAndroidOutlinedIcon} label={`${s.source.startsWith('email') ? 'Gmail script' : `Phone ${s.source.replace(/^sms:/, '')}`} · ${ago(s.minutesAgo)}`} tone={s.minutesAgo <= Number(form.silentAfterMinutes || 10) ? 'success' : 'warning'} />
            ))}
          </Box>

          {errors.form && (
            <Alert severity="error" role="alert">
              {errors.form}
            </Alert>
          )}
          {notice && <Alert severity="success">Saved. The payment page picks it up within a minute.</Alert>}

          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => update('enabled', e.target.checked)} />} label={<Typography fontWeight={600}>Instant UPI on (watchers, matcher and the desk run)</Typography>} />
            <FormControlLabel control={<Switch checked={form.shadowMode} onChange={(e) => update('shadowMode', e.target.checked)} disabled={!form.enabled} />} label={<Typography fontWeight={600}>Shadow mode: hold every match for a person, never enrol on its own</Typography>} />
            {form.enabled && !form.shadowMode && <Alert severity="warning">Live: a matched credit under the cap enrols the student with no staff step. Keep the daily tick list clean.</Alert>}
          </Box>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {field('orderMinutes', 'Order window (minutes)', 'How long a tagged amount waits for the bank alert. 30 is right for most.', { numeric: true })}
            {field('silentAfterMinutes', 'Hide after silence (minutes)', 'No heartbeat for this long hides Instant UPI and rings the bell.', { numeric: true })}
            {field('instantCapRupees', 'Instant cap (₹)', 'Above this a matched credit waits for your confirmation.', { numeric: true })}
            {field('twoChannelRupees', 'Two-channel line (₹)', 'Above this, the KVB SMS alone waits for you; SMS plus the Google Pay notification together confirm.', { numeric: true })}
          </Box>

          <Divider />
          <Typography variant="subtitle2" fontWeight={700}>
            Watchers
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {field('smsKeywords', 'SMS sender keywords', 'Matched inside the sender id, comma separated. KVB alerts come from ids like JD-KVBUPI-S.')}
            {field('emailDomains', 'Email from-domains', 'Comma separated. KVB mails from kvb.bank.in.')}
            {field('deviceIds', 'Watcher device ids', 'Comma separated, for your records. A device is admitted by its secret in PAYMENT_WATCHER_SECRETS on Vercel; remove it there to revoke it.')}
            {field('accountTail', 'Account ends with', 'Last four digits of the receiving account. Alerts for other accounts are ignored.', { numeric: true })}
          </Box>

          <Divider />
          <Typography variant="subtitle2" fontWeight={700}>
            Other ways to pay
          </Typography>
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            <FormControlLabel control={<Switch checked={form.upiProof} onChange={(e) => update('upiProof', e.target.checked)} />} label="UPI QR with a screenshot (staff verify)" />
            <FormControlLabel control={<Switch checked={form.bankProof} onChange={(e) => update('bankProof', e.target.checked)} />} label="Bank transfer with a screenshot (staff verify)" />
          </Box>

          <Box>
            <Button type="button" onClick={() => setGuide((g) => !g)} startIcon={guide ? <ExpandLessIcon /> : <ExpandMoreIcon />} aria-expanded={guide} aria-controls="instant-upi-guide" sx={{ textTransform: 'none', fontWeight: 600, ...TARGET_44, ...FOCUS_RING }}>
              Setup guide: office phone and Gmail
            </Button>
            {guide && (
              <Box id="instant-upi-guide" sx={{ mt: 1, p: 2, bgcolor: 'action.hover', borderRadius: 1, display: 'grid', gap: 1.5 }}>
                <Typography variant="body2" fontWeight={700}>
                  Office phone (UPI credits arrive by SMS and the Google Pay notification; they are never emailed)
                </Typography>
                <Typography variant="body2" component="ol" sx={{ pl: 2.5, m: 0, display: 'grid', gap: 0.5 }}>
                  <li>A spare Android phone with the SIM that receives the KVB credit SMS. Charged, on Wi-Fi, battery optimisation off for the forwarder app.</li>
                  <li>Install a forwarder (MacroDroid, or the YouPI observer app). Forward every incoming SMS and every Google Pay notification to the marketing site, endpoint <code>/api/payments/ingest/sms</code>, with the headers <code>x-neram-device</code> (the device id) and <code>x-neram-token</code> (its secret). A second rule posts to <code>/api/payments/ingest/heartbeat</code> every 5 minutes.</li>
                  <li>Add the device id above. Put its secret in the Vercel env <code>PAYMENT_WATCHER_SECRETS</code> (marketing project, Production and Preview). Secrets are never stored here.</li>
                </Typography>
                <Typography variant="body2" fontWeight={700}>
                  Gmail (NEFT, IMPS and cash deposits arrive by email)
                </Typography>
                <Typography variant="body2" component="ol" sx={{ pl: 2.5, m: 0, display: 'grid', gap: 0.5 }}>
                  <li>In the mailbox that receives KVB alerts, open script.google.com and paste <code>tools/payment-watchers/gmail-forwarder.gs</code> from the repo.</li>
                  <li>Set the Script Properties DEVICE_ID, SECRET and ENDPOINT, run it once to authorise, then add a time trigger every minute. It checks DKIM and posts only credit alerts.</li>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Exact field names, test commands and the ₹1 live test are in <code>tools/payment-watchers/README.md</code>.
                </Typography>
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            {!same(form, saved) && <Chip size="small" label="Unsaved changes" color="warning" variant="outlined" />}
            <Button type="button" onClick={() => { setForm(saved); setErrors({}); }} disabled={saving || same(form, saved)} sx={{ textTransform: 'none', ...TARGET_44, ...FOCUS_RING }}>
              Discard
            </Button>
            <Button type="submit" variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} disabled={saving || same(form, saved)} sx={{ textTransform: 'none', fontWeight: 600, boxShadow: 'none', ...TARGET_44, ...FOCUS_RING }}>
              {saving ? 'Saving' : 'Save'}
            </Button>
          </Box>
        </Box>
      )}
    </Paper>
  );
}
