'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, CircularProgress, TextField, Typography } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import type { AintraCard, CardLink } from '@/lib/aintra/cards';

export type GetToken = () => Promise<string | null>;

const buttonSx = { minHeight: 48, fontWeight: 700, textTransform: 'none', fontSize: '1rem', justifyContent: 'center' } as const;

function Frame({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Box
      component="section"
      aria-label={title}
      sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', p: { xs: 1.75, sm: 2 }, display: 'grid', gap: 1.5, minWidth: 0 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', color: 'primary.main' }}>
          {icon}
        </Box>
        <Typography component="h3" sx={{ fontWeight: 800, fontSize: '1.0625rem', lineHeight: 1.3 }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

function LinkButton({ link }: { link: CardLink }) {
  const common = { variant: link.primary ? ('contained' as const) : ('outlined' as const), disableElevation: true, fullWidth: true, sx: buttonSx };
  return link.external ? (
    <Button {...common} href={link.href} target="_blank" rel="noopener" endIcon={<OpenInNewRoundedIcon aria-hidden />}>
      {link.label}
    </Button>
  ) : (
    <Button {...common} component={Link} href={link.href}>
      {link.label}
    </Button>
  );
}

function LinksCard({ card }: { card: Extract<AintraCard, { kind: 'links' }> }) {
  return (
    <Frame icon={<AccountCircleOutlinedIcon />} title={card.title}>
      {card.lines.length > 0 && (
        <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1.25, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
          {card.lines.map((l, i) => (
            <Box key={`${l.label}-${i}`}>
              <Box component="dt" sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }}>
                {l.label}
              </Box>
              {l.value && (
                <Box component="dd" sx={{ m: 0, fontSize: '1rem', fontWeight: 700, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
                  {l.value}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
      {card.links.map((l) => (
        <LinkButton key={`${l.label}-${l.href}`} link={l} />
      ))}
      {card.note && (
        <Typography variant="caption" color="text.secondary">
          {card.note}
        </Typography>
      )}
    </Frame>
  );
}

function TicketCard({ card, getToken }: { card: Extract<AintraCard, { kind: 'ticket' }>; getToken: GetToken }) {
  const [subject, setSubject] = useState(card.subject);
  const [description, setDescription] = useState(card.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const ok = subject.trim().length >= 2 && description.trim().length >= 10;

  const send = async () => {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ category: card.category, subject: subject.trim(), description: description.trim(), page_url: window.location.pathname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not raise the ticket. Please try again.');
      setNumber(data?.ticketNumber ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise the ticket. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (number !== null) {
    return (
      <Frame icon={<CheckCircleRoundedIcon />} title="Ticket raised">
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {number ? `Your ticket number is ${number}. ` : ''}Our team will reply here in the app.
        </Typography>
        <Button component={Link} href="/support" variant="outlined" sx={{ ...buttonSx, justifySelf: 'start' }}>
          View my tickets
        </Button>
      </Frame>
    );
  }

  return (
    <Frame icon={<SupportAgentOutlinedIcon />} title="Raise a support ticket">
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} fullWidth inputProps={{ maxLength: 120, style: { fontSize: 16 } }} />
      <TextField
        label="What went wrong?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        multiline
        minRows={3}
        error={description.trim().length > 0 && description.trim().length < 10}
        helperText={description.trim().length > 0 && description.trim().length < 10 ? 'Write at least a sentence' : undefined}
        inputProps={{ maxLength: 2000, style: { fontSize: 16 } }}
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
        onClick={send}
        disabled={busy || !ok}
        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        sx={buttonSx}
      >
        {busy ? 'Sending' : 'Raise ticket'}
      </Button>
    </Frame>
  );
}

function ExamYearCard({ card, getToken }: { card: Extract<AintraCard, { kind: 'exam-year' }>; getToken: GetToken }) {
  const [year, setYear] = useState<number | null>(card.year && card.choices.includes(card.year) ? card.year : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const save = async () => {
    if (!year) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/exam-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'save', year }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Could not save. Please try again.');
      setSaved(data?.year ?? year);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <Frame icon={<CheckCircleRoundedIcon />} title="Exam year saved">
        <Typography role="status" sx={{ fontSize: '1rem', lineHeight: 1.5 }}>
          You are preparing for the {saved} exam. Your plan and reminders follow this year.
        </Typography>
      </Frame>
    );
  }

  return (
    <Frame icon={<EventNoteOutlinedIcon />} title="Your exam year">
      <Typography sx={{ fontSize: '1rem' }}>Which year will you write NATA or JEE B.Arch?</Typography>
      <Box role="group" aria-label="Exam year" sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1 }}>
        {card.choices.map((y) => (
          <ButtonBase
            key={y}
            onClick={() => setYear(y)}
            aria-pressed={year === y}
            sx={{
              minHeight: 48,
              borderRadius: 2,
              border: 2,
              borderColor: year === y ? 'primary.main' : 'divider',
              bgcolor: year === y ? 'primary.main' : 'background.paper',
              color: year === y ? 'primary.contrastText' : 'text.primary',
              fontWeight: 700,
              fontSize: '1rem',
              fontFamily: 'inherit',
              transition: 'background-color 150ms, border-color 150ms',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            {y}
          </ButtonBase>
        ))}
      </Box>
      {error && (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      )}
      <Button
        variant="contained"
        disableElevation
        fullWidth
        onClick={save}
        disabled={busy || !year}
        startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        sx={buttonSx}
      >
        {busy ? 'Saving' : year ? `Save ${year}` : 'Pick a year'}
      </Button>
    </Frame>
  );
}

/** One card from a tool, by kind. */
export default function AintraCardView({ card, getToken }: { card: AintraCard; getToken: GetToken }) {
  switch (card.kind) {
    case 'links':
      return <LinksCard card={card} />;
    case 'ticket':
      return <TicketCard card={card} getToken={getToken} />;
    case 'exam-year':
      return <ExamYearCard card={card} getToken={getToken} />;
    default:
      return null;
  }
}
