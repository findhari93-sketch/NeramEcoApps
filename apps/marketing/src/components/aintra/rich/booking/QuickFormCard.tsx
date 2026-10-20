'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, TextField, Typography } from '@neram/ui';
import { useFirebaseAuth } from '@neram/auth';
import StoreMallDirectoryOutlinedIcon from '@mui/icons-material/StoreMallDirectoryOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { addDays, cleanIndianMobile, dayLabel, istToday, maskPhone, type BookSuggestion } from '@/lib/aintra/booking';
import { touchAttribution } from '@/lib/attribution';
import { ensureAccount, type EnsuredAccount } from '@/lib/ensure-account';
import { currentIdToken } from '@/components/demo-class/demo-client';
import { BookingCardFrame, ChoicePill, FieldLabel, PillRow, SummaryList } from './BookingContext';

type QuickKind = 'visit' | 'college-enquiry' | 'message';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "10:00 AM - 12:00 PM" as "10 am to 12 pm": short enough for a pill on a phone, like the callback card. */
export function slotLabel(slot: string): string {
  return slot
    .replace(/:00\b/g, '')
    .replace(/\s*(AM|PM)\b/gi, (_, m: string) => ` ${m.toLowerCase()}`)
    .replace(/\s*-\s*/, ' to ')
    .trim();
}
const inputProps = (max: number) => ({ maxLength: max, style: { fontSize: 16 } });
const buttonSx = { minHeight: 48, fontWeight: 800, textTransform: 'none', fontSize: '1rem' } as const;

/**
 * The short public forms Aintra filled in (2026-10-20): a centre visit, an
 * admission enquiry to a college, a message to our team. What Aintra checked
 * (the centre, the college, the date, the message) shows as a summary; the
 * visitor's own name and number are typed here, never in the chat, and the
 * button posts to the form's usual route.
 */
export default function QuickFormCard({ suggestion }: { suggestion: BookSuggestion & { kind: QuickKind } }) {
  const { user } = useFirebaseAuth();
  const f = suggestion.draft?.fields ?? {};
  const kind = suggestion.kind;
  const [now] = useState(() => new Date());
  const [account, setAccount] = useState<EnsuredAccount | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [editPhone, setEditPhone] = useState(false);
  const [text, setText] = useState(kind === 'visit' ? f.purpose ?? '' : f.message ?? '');
  const [date, setDate] = useState<string | null>(suggestion.date);
  const [slot, setSlot] = useState<string | null>(f.slot ?? null);
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAccount(null);
      return;
    }
    let cancelled = false;
    ensureAccount().then((acc) => {
      if (cancelled || !acc) return;
      setAccount(acc);
      const accountName = acc.name && acc.name !== 'User' ? acc.name : '';
      setName((n) => n || accountName);
      setPhone((p) => p || (acc.phone || '').replace(/\D/g, '').slice(-10));
      setEmail((e) => e || acc.email || '');
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const slots = useMemo(() => (f.slots ? f.slots.split('|').filter(Boolean) : []), [f.slots]);
  const visitDays = useMemo(() => {
    const today = istToday(now);
    const week = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));
    // Aintra may have picked a day further out (up to 30 days): keep it on the row.
    return suggestion.date && !week.includes(suggestion.date) ? [...week, suggestion.date] : week;
  }, [now, suggestion.date]);

  const accountPhone = cleanIndianMobile(account?.phone || '');
  const usingAccountPhone = !!accountPhone && !editPhone;
  const cleanPhone = usingAccountPhone ? accountPhone : cleanIndianMobile(phone);
  const nameOk = name.trim().length >= 2;
  const emailOk = EMAIL.test(email.trim());
  const needsPhone = kind !== 'message';
  const ready =
    nameOk &&
    (!needsPhone || !!cleanPhone) &&
    (kind !== 'message' || (emailOk && text.trim().length >= 10)) &&
    (kind !== 'visit' || (!!date && !!slot)) &&
    (kind !== 'college-enquiry' || consent);

  const config = {
    visit: { icon: <StoreMallDirectoryOutlinedIcon />, title: 'Book a centre visit', button: 'Book my visit', id: 'aintra-visit-title' },
    'college-enquiry': { icon: <SchoolOutlinedIcon />, title: `Ask ${f.collegeName ?? 'the college'} about admission`, button: 'Send my enquiry', id: 'aintra-enquiry-title' },
    message: { icon: <MailOutlineRoundedIcon />, title: 'Message our team', button: 'Send message', id: 'aintra-message-title' },
  }[kind];

  const send = async () => {
    setTouched(true);
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const token = user ? await currentIdToken() : null;
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      let url = '';
      let body: Record<string, unknown> = {};
      if (kind === 'visit') {
        url = '/api/centers/visit';
        body = {
          center_id: f.centreId,
          visitor_name: name.trim(),
          visitor_phone: cleanPhone,
          visitor_email: emailOk ? email.trim() : undefined,
          visit_date: date,
          visit_time_slot: slot,
          purpose: text.trim() || undefined,
          ...touchAttribution('AI-VIS'),
        };
      } else if (kind === 'college-enquiry') {
        url = '/api/colleges/leads';
        body = {
          college_id: f.collegeId,
          name: name.trim(),
          phone: cleanPhone,
          email: emailOk ? email.trim() : undefined,
          message: text.trim() || undefined,
          consent_given: true,
          firebase_uid: user?.id ?? undefined,
        };
      } else {
        url = '/api/contact';
        body = {
          name: name.trim(),
          email: email.trim(),
          phone: cleanPhone || undefined,
          subject: f.subject || 'Message from the Aintra chat',
          message: text.trim(),
        };
      }
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.error || 'Could not send. Please try again.');
      setDone(
        kind === 'visit'
          ? `Visit booked for ${date ? dayLabel(date, istToday(now)) : ''}, ${slot ? slotLabel(slot) : ''}. Our team will call ${maskPhone(cleanPhone)} to confirm.`
          : kind === 'college-enquiry'
            ? data?.duplicate
              ? `${f.collegeName} already has your enquiry from this month.`
              : `Sent to ${f.collegeName}. Their admissions team will contact you on ${maskPhone(cleanPhone)}.`
            : `Sent. Our team will reply to ${email.trim()}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <BookingCardFrame icon={<CheckCircleRoundedIcon />} title={kind === 'visit' ? 'Visit booked' : 'Sent'} labelledBy={`${config.id}-done`}>
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {done}
        </Typography>
      </BookingCardFrame>
    );
  }

  // The college is already in the title, so its card needs no summary.
  const summary =
    kind === 'visit'
      ? [{ label: 'Centre', value: f.centreName ?? '' }]
      : kind === 'college-enquiry'
        ? []
        : [{ label: 'Subject', value: f.subject ?? 'Message from the Aintra chat' }];

  return (
    <BookingCardFrame icon={config.icon} title={config.title} labelledBy={config.id}>
      {summary.some((r) => r.value) && <SummaryList rows={summary.filter((r) => r.value)} />}

      {kind === 'visit' && (
        <>
          <Box>
            <FieldLabel>Which day?</FieldLabel>
            <PillRow label="Which day?">
              {visitDays.map((d) => (
                <ChoicePill key={d} selected={date === d} onClick={() => setDate(d)}>
                  {dayLabel(d, istToday(now))}
                </ChoicePill>
              ))}
            </PillRow>
          </Box>
          <Box>
            <FieldLabel>What time?</FieldLabel>
            <PillRow label="What time?" layout="grid" columns={Math.min(Math.max(slots.length, 1), 2)}>
              {slots.map((s) => (
                <ChoicePill key={s} selected={slot === s} onClick={() => setSlot(s)} compact label={s}>
                  {slotLabel(s)}
                </ChoicePill>
              ))}
            </PillRow>
          </Box>
        </>
      )}

      <TextField
        label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        fullWidth
        autoComplete="name"
        error={touched && !nameOk}
        helperText={touched && !nameOk ? 'Enter your name' : undefined}
        inputProps={inputProps(100)}
      />

      {needsPhone &&
        (usingAccountPhone ? (
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.9375rem' }}>
              Using <b>{maskPhone(accountPhone)}</b>
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
            helperText={touched && !cleanPhone ? 'Enter a 10-digit Indian mobile number' : undefined}
            inputProps={{ ...inputProps(15), inputMode: 'tel' }}
            InputProps={{ startAdornment: <Typography sx={{ mr: 1, color: 'text.secondary' }}>+91</Typography> }}
          />
        ))}

      {kind === 'message' && (
        <TextField
          label="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
          type="email"
          autoComplete="email"
          error={touched && !emailOk}
          helperText={touched && !emailOk ? 'Enter your email so we can reply' : 'We reply to this address.'}
          inputProps={inputProps(150)}
        />
      )}

      <TextField
        label={kind === 'visit' ? 'What would you like to see? (optional)' : kind === 'message' ? 'Your message' : 'Your question to the college (optional)'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        fullWidth
        multiline
        minRows={kind === 'message' ? 3 : 1}
        required={kind === 'message'}
        error={kind === 'message' && touched && text.trim().length < 10}
        helperText={kind === 'message' && touched && text.trim().length < 10 ? 'Write at least a sentence' : undefined}
        inputProps={inputProps(kind === 'message' ? 1000 : 500)}
      />

      {kind === 'college-enquiry' && (
        <FormControlLabel
          sx={{ alignItems: 'flex-start', m: 0, gap: 1 }}
          control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} sx={{ p: 1, mt: -0.5 }} />}
          label={
            <Typography component="span" sx={{ fontSize: '0.9375rem', lineHeight: 1.5 }}>
              I agree to share my details with {f.collegeName ?? 'this college'} so their admissions team can contact me.
            </Typography>
          }
        />
      )}

      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}

      <Button
        variant="contained"
        disableElevation
        fullWidth
        onClick={send}
        disabled={busy || (kind === 'college-enquiry' && !consent)}
        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        sx={buttonSx}
      >
        {busy ? 'Sending' : config.button}
      </Button>
      {kind === 'visit' && (!date || !slot) && touched && (
        <Typography variant="caption" color="error">
          Pick a day and a time.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start' }}>
        <LockOutlinedIcon aria-hidden sx={{ fontSize: 16, mt: '1px' }} />
        {kind === 'college-enquiry'
          ? 'Your details go only to this college, and only because you ticked the box.'
          : 'We only use your details to reply to you about Neram Classes.'}
      </Typography>
    </BookingCardFrame>
  );
}
