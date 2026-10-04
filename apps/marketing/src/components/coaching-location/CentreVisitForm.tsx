'use client';

/**
 * "Book a centre visit" on a centre's city page. Posts to /api/centers/visit
 * (the same API the centres page uses). The only client JS in the visit card.
 */
import { useState } from 'react';
import { Box, Button, TextField, Typography, MenuItem, Alert } from '@neram/ui';
import { leadAttribution, touchAttribution } from '@/lib/attribution';

const SLOTS = ['10:00 AM - 12:00 PM', '2:00 PM - 5:00 PM'];

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function CentreVisitForm({ centreId, centreLabel }: { centreId: string; centreLabel: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState(SLOTS[0]);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  if (!open) {
    return (
      <Button variant="contained" onClick={() => setOpen(true)} sx={{ minHeight: 48, fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
        Book a centre visit
      </Button>
    );
  }

  if (state === 'done') {
    return (
      <Alert severity="success" sx={{ width: '100%' }}>
        Your visit to {centreLabel} is booked. We will call you to confirm the time.
      </Alert>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError('');
    try {
      const res = await fetch('/api/centers/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_id: centreId,
          visitor_name: name.trim(),
          visitor_phone: phone.trim(),
          visit_date: date,
          visit_time_slot: slot,
          purpose: 'Tour',
          ...leadAttribution(),
          ...touchAttribution(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setState('done');
      else {
        setError(data.error || 'Could not book the visit. Please try again.');
        setState('error');
      }
    } catch {
      setError('Could not book the visit. Please check your connection and try again.');
      setState('error');
    }
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ width: '100%', display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
      <Typography sx={{ gridColumn: '1 / -1', fontWeight: 600 }}>Book a visit to {centreLabel}</Typography>
      <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" inputProps={{ minLength: 2 }} />
      <TextField
        label="Mobile number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
        autoComplete="tel"
        inputProps={{ inputMode: 'numeric', pattern: '[0-9+ ]{10,14}' }}
      />
      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        InputLabelProps={{ shrink: true }}
        inputProps={{ min: tomorrow() }}
      />
      <TextField select label="Time" value={slot} onChange={(e) => setSlot(e.target.value)}>
        {SLOTS.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>
      {state === 'error' && (
        <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>
          {error}
        </Alert>
      )}
      <Button type="submit" variant="contained" disabled={state === 'sending'} sx={{ gridColumn: '1 / -1', minHeight: 48, fontWeight: 600 }}>
        {state === 'sending' ? 'Booking...' : 'Book the visit'}
      </Button>
    </Box>
  );
}
