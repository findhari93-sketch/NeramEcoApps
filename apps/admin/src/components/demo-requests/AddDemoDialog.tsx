'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@neram/ui';
import { istDateKey, istDateTime } from '@neram/database/demo-schedule';
import { STAFF_DEMO_CHANNELS, STAFF_DEMO_PLATFORMS } from '@/lib/demo/staff-add';
import type { DeskSettings } from './types';

type Mode = 'request' | 'agreed' | 'held';

interface Person {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  user_type?: string;
}

const MODES: Array<{ id: Mode; title: string; body: string }> = [
  { id: 'request', title: 'Wants a demo', body: 'Goes to New. Call them and confirm a time as usual.' },
  { id: 'agreed', title: 'Time already agreed', body: 'Next you pick the exact time, the team and the meeting.' },
  { id: 'held', title: 'Demo already held', body: 'Record a demo done outside the desk, for example on Google Meet.' },
];

const CLASSES = [
  { id: '10th', label: 'Class 10' },
  { id: '11th', label: 'Class 11' },
  { id: '12th', label: 'Class 12' },
  { id: '12th-pass', label: 'Drop year' },
  { id: 'other', label: 'Other' },
];

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mt: 2.5, mb: 1 }}>
      {children}
    </Typography>
  );
}

function nowIstTime(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

/**
 * Staff add a demo for someone who reached us outside the website: WhatsApp to
 * the office, a call, a walk-in. Finds the person (or creates them in People),
 * records where they came from, and either starts the normal flow or records a
 * demo that already happened.
 */
export default function AddDemoDialog({
  open,
  settings,
  onClose,
  onAdded,
}: {
  open: boolean;
  settings: DeskSettings;
  onClose: () => void;
  onAdded: (id: string, mode: Mode) => void;
}) {
  const [person, setPerson] = useState<Person | null>(null);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [currentClass, setCurrentClass] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [mode, setMode] = useState<Mode>('request');
  const [date, setDate] = useState('');
  const [window, setWindow] = useState('anytime');
  const [sendAck, setSendAck] = useState(true);
  const [heldDate, setHeldDate] = useState('');
  const [heldTime, setHeldTime] = useState('');
  const [platform, setPlatform] = useState('google_meet');
  const [joinUrl, setJoinUrl] = useState('');
  const [outcome, setOutcome] = useState<'attended' | 'no_show'>('attended');
  const [note, setNote] = useState('');
  const [sendFollowUp, setSendFollowUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const today = istDateKey(new Date());
    setPerson(null);
    setQuery('');
    setOptions([]);
    setName('');
    setPhone('');
    setEmail('');
    setCurrentClass('');
    setParentName('');
    setParentPhone('');
    setChannel('whatsapp');
    setMode('request');
    setDate(today);
    setWindow('anytime');
    setSendAck(true);
    setHeldDate(today);
    setHeldTime(nowIstTime());
    setPlatform('google_meet');
    setJoinUrl('');
    setOutcome('attended');
    setNote('');
    setSendFollowUp(false);
    setError(null);
    setTouched({});
  }, [open]);

  // Search People as staff type (debounced).
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2 || (person && q === person.name)) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/crm/users?search=${encodeURIComponent(q)}&limit=8`)
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => {
          if (!cancelled) setOptions((d.users ?? []) as Person[]);
        })
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open, person]);

  const pick = (p: Person | null) => {
    setPerson(p);
    if (p) {
      setName(p.name || '');
      setPhone((p.phone || '').replace(/\D/g, '').slice(-10));
      setEmail(p.email || '');
    }
  };

  const phone10 = phone.replace(/\D/g, '').slice(-10);
  const phoneOk = /^[6-9]\d{9}$/.test(phone10);
  const nameOk = name.trim().length >= 2;
  const linkOk = !joinUrl.trim() || /^https:\/\/\S+\.\S+/.test(joinUrl.trim());
  const heldAt = heldDate && /^\d{2}:\d{2}$/.test(heldTime) ? istDateTime(heldDate, heldTime) : null;
  const heldInFuture = heldAt ? heldAt.getTime() > Date.now() + 5 * 60_000 : false;
  const windows = useMemo(() => settings.schedule.windows, [settings.schedule.windows]);

  const canSave =
    nameOk &&
    phoneOk &&
    !!channel &&
    (mode !== 'request' || window === 'anytime' || !!date) &&
    (mode !== 'held' || (!!heldAt && !heldInFuture && linkOk));

  const save = async () => {
    setTouched({ name: true, phone: true });
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          userId: person?.id,
          name: name.trim(),
          phone: phone10,
          email: email.trim(),
          currentClass,
          parentName: parentName.trim(),
          parentPhone: parentPhone.replace(/\D/g, ''),
          channel,
          ...(mode === 'request' ? { window, date: window === 'anytime' ? null : date, sendAck } : {}),
          ...(mode === 'held'
            ? { heldAt: heldAt?.toISOString(), platform, joinUrl: joinUrl.trim(), outcome, note: note.trim(), sendFollowUp }
            : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not add the demo.');
      onAdded(d.id, mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the demo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby="add-demo-title">
      <DialogTitle id="add-demo-title">Add a demo</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary">
          For students who reached us outside the website, for example a WhatsApp message to the office or a phone call.
        </Typography>

        <SectionLabel>Who</SectionLabel>
        <Autocomplete
          options={options}
          value={person}
          onChange={(_, v) => pick(v)}
          inputValue={query}
          onInputChange={(_, v) => setQuery(v)}
          getOptionLabel={(o) => o.name || o.phone || ''}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          filterOptions={(x) => x}
          loading={searching}
          noOptionsText={query.trim().length < 2 ? 'Type at least 2 letters' : 'Nobody found. Fill in the details below to add them.'}
          renderOption={(props, o) => (
            <Box component="li" {...props} key={o.id} sx={{ display: 'block !important', minHeight: 48, py: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {o.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {[o.phone, o.email, o.user_type].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search People (name, phone or email)"
              helperText={person ? 'Existing person. Their record is updated, not duplicated.' : 'Not in People yet? Skip this and fill in the details below.'}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {searching ? <CircularProgress color="inherit" size={18} aria-label="Searching" /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 2 }}>
          <TextField
            label="Student name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            error={touched.name && !nameOk}
            helperText={touched.name && !nameOk ? 'Enter the student name' : ' '}
            required
            autoComplete="off"
          />
          <TextField
            label="Mobile (WhatsApp)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            error={touched.phone && !phoneOk}
            helperText={touched.phone && !phoneOk ? '10-digit Indian mobile number' : ' '}
            required
            inputProps={{ inputMode: 'tel' }}
            autoComplete="off"
          />
          <TextField label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          <TextField select label="Class (optional)" value={currentClass} onChange={(e) => setCurrentClass(e.target.value)}>
            <MenuItem value="">Not known</MenuItem>
            {CLASSES.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Parent name (optional)" value={parentName} onChange={(e) => setParentName(e.target.value)} autoComplete="off" />
          <TextField
            label="Parent mobile (optional)"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            inputProps={{ inputMode: 'tel' }}
            helperText="Gets copies of the WhatsApp messages"
            autoComplete="off"
          />
        </Box>

        <SectionLabel>Where they came from</SectionLabel>
        <TextField
          select
          label="Came from"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          helperText="Counts in Leads by channel. Pick Google Ads only if they said they saw our ad."
          fullWidth
          required
        >
          {STAFF_DEMO_CHANNELS.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.label}
            </MenuItem>
          ))}
        </TextField>

        <SectionLabel>What happened</SectionLabel>
        <RadioGroup
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          aria-label="What happened"
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1 }}
        >
          {MODES.map((m) => (
            <FormControlLabel
              key={m.id}
              value={m.id}
              control={<Radio sx={{ alignSelf: 'flex-start' }} />}
              label={
                <Box sx={{ py: 0.5 }}>
                  <Typography fontWeight={700}>{m.title}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {m.body}
                  </Typography>
                </Box>
              }
              sx={{
                m: 0,
                p: 1,
                pr: 1.5,
                alignItems: 'flex-start',
                border: 1,
                borderRadius: 2,
                borderColor: mode === m.id ? 'primary.main' : 'divider',
                bgcolor: mode === m.id ? 'action.selected' : 'transparent',
                cursor: 'pointer',
                transition: 'border-color 150ms, background-color 150ms',
              }}
            />
          ))}
        </RadioGroup>

        {mode === 'request' && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField select label="When suits them" value={window} onChange={(e) => setWindow(e.target.value)}>
                <MenuItem value="anytime">Any time, we will call</MenuItem>
                {windows.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.label} ({w.start} to {w.end})
                  </MenuItem>
                ))}
              </TextField>
              {window !== 'anytime' && (
                <TextField
                  label="Day"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: istDateKey(new Date()) }}
                  required
                />
              )}
            </Box>
            <FormControlLabel
              control={<Checkbox checked={sendAck} onChange={(e) => setSendAck(e.target.checked)} />}
              label='Send the "request received" WhatsApp'
              sx={{ mt: 1, minHeight: 44 }}
            />
          </Box>
        )}

        {mode === 'agreed' && (
          <Alert severity="info" sx={{ mt: 2 }}>
            After saving, Confirm opens. Pick the time, the team, and a Teams meeting or your own link.
          </Alert>
        )}

        {mode === 'held' && (
          <Box sx={{ mt: 2, display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              <TextField
                label="Date"
                type="date"
                value={heldDate}
                onChange={(e) => setHeldDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: istDateKey(new Date()) }}
                required
              />
              <TextField
                label="Start time (India)"
                type="time"
                value={heldTime}
                onChange={(e) => setHeldTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                error={heldInFuture}
                helperText={heldInFuture ? 'This is in the future. Use Time already agreed.' : ' '}
                required
              />
              <TextField select label="Held on" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                {STAFF_DEMO_PLATFORMS.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <TextField
              label="Meeting link (optional)"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.target.value)}
              error={!linkOk}
              helperText={linkOk ? 'For the record, e.g. the Google Meet link you shared' : 'Paste the full link, starting with https://'}
              type="url"
            />
            <Box>
              <Typography variant="body2" sx={{ mb: 1 }} id="held-outcome">
                Did they join?
              </Typography>
              <ToggleButtonGroup
                exclusive
                value={outcome}
                onChange={(_, v) => v && setOutcome(v)}
                aria-labelledby="held-outcome"
                sx={{ gap: 1, '& .MuiToggleButton-root': { minHeight: 44, px: 2.5, border: 1, borderColor: 'divider', borderRadius: '8px !important', textTransform: 'none' } }}
              >
                <ToggleButton value="attended">Attended</ToggleButton>
                <ToggleButton value="no_show">No-show</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <TextField
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Interested, asked about fees. Mother joined."
              multiline
              minRows={2}
              inputProps={{ maxLength: 1000 }}
            />
            <FormControlLabel
              control={<Checkbox checked={sendFollowUp} onChange={(e) => setSendFollowUp(e.target.checked)} />}
              label={outcome === 'attended' ? 'Send the thank-you and feedback WhatsApp' : 'Send the "we missed you" WhatsApp'}
              sx={{ minHeight: 44 }}
            />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44 }}>
          Back
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || !canSave}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44 }}
        >
          {saving ? 'Saving' : mode === 'agreed' ? 'Save and confirm' : mode === 'held' ? 'Record demo' : 'Add request'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
