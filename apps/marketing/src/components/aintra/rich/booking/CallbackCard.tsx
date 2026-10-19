'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import PhoneCallbackRoundedIcon from '@mui/icons-material/PhoneCallbackRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  CALLBACK_SLOT_LABELS,
  aintraCallbackNote,
  callbackDays,
  cleanIndianMobile,
  describeCallbackTime,
  maskPhone,
  pickCallbackDefault,
  type BookSuggestion,
  type CallbackSlot,
} from '@/lib/aintra/booking';
import { leadAttribution, touchAttribution } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import { ensureAccount, type EnsuredAccount } from '@/lib/ensure-account';
import { BookingCardFrame, ChoicePill, FieldLabel, PillRow, useAintraBooking } from './BookingContext';

type Done = { when: string; phone: string; already?: boolean };

/**
 * "Call me back", confirmed inside the Aintra chat. Signed in: the account's
 * name and phone are used (the number can be changed). A guest types both here,
 * in the card, so the number never goes into the chat or to the AI.
 */
export default function CallbackCard({ suggestion }: { suggestion: BookSuggestion }) {
  const ctx = useAintraBooking();
  const { user } = useFirebaseAuth();
  const [account, setAccount] = useState<EnsuredAccount | null>(null);
  const [now] = useState(() => new Date());
  const days = useMemo(() => callbackDays(now), [now]);
  const initial = useMemo(() => pickCallbackDefault(days, suggestion), [days, suggestion]);
  const [date, setDate] = useState(initial?.date ?? '');
  const [slot, setSlot] = useState<CallbackSlot | null>(initial?.slot ?? null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [editPhone, setEditPhone] = useState(false);
  const [topic, setTopic] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  // Signed in: the account fills in the name and number.
  useEffect(() => {
    if (!user) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    ensureAccount().then((acc) => {
      if (cancelled || !acc) return;
      setAccount(acc);
      const accountName = acc.name && acc.name !== 'User' ? acc.name : user.name && user.name !== 'User' ? user.name : '';
      setName((n) => n || accountName);
      setPhone((p) => p || (acc.phone || '').replace(/\D/g, '').slice(-10));
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const day = days.find((d) => d.date === date) ?? null;
  const accountPhone = cleanIndianMobile(account?.phone || '');
  const hasAccountName = !!account?.name && account.name !== 'User';
  const usingAccountPhone = !!accountPhone && !editPhone;
  const cleanPhone = usingAccountPhone ? accountPhone : cleanIndianMobile(phone);
  const nameOk = name.trim().length >= 2;
  const ready = !!day && !!slot && day.slots.includes(slot) && nameOk && !!cleanPhone;
  const when = day && slot ? describeCallbackTime(day.date, slot, now) : '';

  const submit = async () => {
    setTouched(true);
    if (!ready || !cleanPhone || !slot) return;
    setBusy(true);
    setError(null);
    try {
      let token: string | null = null;
      if (user) {
        const { getFirebaseAuth } = await import('@neram/auth');
        token = (await getFirebaseAuth().currentUser?.getIdToken()) ?? null;
      }
      const res = await fetch('/api/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          name: name.trim(),
          phone: cleanPhone,
          email: account?.email || undefined,
          preferred_date: date,
          preferred_slot: slot,
          query_type: 'aintra_chat',
          source: 'aintra',
          notes: aintraCallbackNote(ctx?.sessionId ?? null, topic),
          ...leadAttribution(),
          ...touchAttribution('AI-CBK'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || (res.status === 400 && /already requested/i.test(data.error || ''))) {
        setDone({ when, phone: cleanPhone, already: true });
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not send the request. Please try again.');
      trackTaxonomyEvent('callback_requested', { source: 'aintra_chat', slot, signed_in: !!user });
      setDone({ when, phone: cleanPhone });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <BookingCardFrame icon={<CheckCircleRoundedIcon />} title={done.already ? 'Your callback is already booked' : 'Callback booked'} labelledBy="aintra-callback-done">
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {done.already
            ? `We already have your request. Our team will call you on ${maskPhone(done.phone)} soon.`
            : `We will call you ${done.when} on ${maskPhone(done.phone)}.`}
        </Typography>
      </BookingCardFrame>
    );
  }

  if (!days.length || !initial) return null;

  return (
    <BookingCardFrame icon={<PhoneCallbackRoundedIcon />} title="Request a callback" labelledBy="aintra-callback-title">
      <Box>
        <FieldLabel id="aintra-cb-day">Which day?</FieldLabel>
        <PillRow label="Which day?">
          {days.map((d) => (
            <ChoicePill
              key={d.date}
              selected={date === d.date}
              onClick={() => {
                setDate(d.date);
                if (slot && !d.slots.includes(slot)) setSlot(d.slots[0]);
              }}
            >
              {d.label}
            </ChoicePill>
          ))}
        </PillRow>
      </Box>

      <Box>
        <FieldLabel id="aintra-cb-slot">What time?</FieldLabel>
        <PillRow label="What time?" layout="grid">
          {(['morning', 'afternoon', 'evening'] as CallbackSlot[]).map((s) => (
            <ChoicePill
              key={s}
              selected={slot === s}
              disabled={!day?.slots.includes(s)}
              onClick={() => setSlot(s)}
              compact
              sub={CALLBACK_SLOT_LABELS[s].range}
            >
              {CALLBACK_SLOT_LABELS[s].label}
            </ChoicePill>
          ))}
        </PillRow>
      </Box>

      {!hasAccountName && (
        <TextField
          label="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          fullWidth
          autoComplete="name"
          error={touched && !nameOk}
          helperText={touched && !nameOk ? 'Enter your name' : undefined}
          inputProps={{ maxLength: 100, style: { fontSize: 16 } }}
        />
      )}

      {usingAccountPhone ? (
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
          <Typography sx={{ fontSize: '0.9375rem' }}>
            We will call <b>{maskPhone(accountPhone)}</b>
          </Typography>
          <Button size="small" onClick={() => setEditPhone(true)} sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}>
            Use another number
          </Button>
        </Box>
      ) : (
        <TextField
          label="Mobile number"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))}
          onBlur={() => setTouched(true)}
          required
          fullWidth
          autoComplete="tel-national"
          error={touched && !cleanPhone}
          helperText={touched && !cleanPhone ? 'Enter a 10-digit Indian mobile number' : 'We call this number. It is not shared.'}
          inputProps={{ inputMode: 'tel', maxLength: 15, style: { fontSize: 16 } }}
          InputProps={{ startAdornment: <Typography sx={{ mr: 1, color: 'text.secondary' }}>+91</Typography> }}
        />
      )}

      <TextField
        label="What should we help with? (optional)"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        fullWidth
        inputProps={{ maxLength: 300, style: { fontSize: 16 } }}
      />

      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        disableElevation
        fullWidth
        onClick={submit}
        disabled={busy}
        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        sx={{ minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' }}
      >
        {busy ? 'Sending' : when ? `Call me ${when}` : 'Call me'}
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
        <LockOutlinedIcon aria-hidden sx={{ fontSize: 16, mt: '1px' }} />
        We only use your number to call you about Neram Classes. Free, no payment.
      </Typography>
    </BookingCardFrame>
  );
}
