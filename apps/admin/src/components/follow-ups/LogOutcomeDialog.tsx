'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Paper, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@neram/ui';
import {
  FOLLOW_UP_OUTCOME_LABELS,
  FOLLOW_UP_TOPICS,
  FOLLOW_UP_TOPIC_LABELS,
  INTEREST_LABELS,
  type FollowUpChannel,
  type FollowUpOutcome,
  type FollowUpTopic,
  type InterestLevel,
} from '@neram/database/demo-follow-up';
import { formatDemoDateTime, istDateKey, istDateTime } from '@neram/database/demo-schedule';

const CHIP_SX = {
  gap: 1,
  flexWrap: 'wrap',
  '& .MuiToggleButton-root': {
    minHeight: 44,
    px: 2,
    border: 1,
    borderColor: 'divider',
    borderRadius: '8px !important',
    textTransform: 'none',
    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
  },
} as const;

/** Quick reasons for stopping a follow-up; a tap fills the reason box. */
const STOP_REASONS = ['Joined another institute', 'Fees', 'Next year', 'Not reachable', 'Other'];

const CALL_OUTCOMES: FollowUpOutcome[] = ['thinking', 'will_join', 'no_answer', 'not_interested', 'joined'];
/** On WhatsApp: what we sent, or what they replied. Waiting for a reply puts "No reply" first. */
const WHATSAPP_OUTCOMES: FollowUpOutcome[] = ['message_sent', 'thinking', 'will_join', 'not_interested', 'joined', 'no_answer'];
const REPLY_OUTCOMES: FollowUpOutcome[] = ['no_answer', 'thinking', 'will_join', 'not_interested', 'joined', 'message_sent'];
const REPLIED = new Set<FollowUpOutcome>(['thinking', 'will_join', 'not_interested', 'joined']);

function whatsappLabel(o: FollowUpOutcome, awaiting: boolean): string {
  switch (o) {
    case 'message_sent':
      return awaiting ? 'Sent another message' : 'I sent a message';
    case 'no_answer':
      return 'No reply';
    case 'thinking':
      return 'Replied: thinking it over';
    case 'will_join':
      return 'Replied: will join on a date';
    case 'not_interested':
      return 'Replied: not interested';
    default:
      return 'Replied: joined';
  }
}

export default function LogOutcomeDialog({
  open,
  name,
  callbackId,
  interest: currentInterest,
  stopMode = false,
  awaiting = null,
  onClose,
  onSaved,
}: {
  open: boolean;
  name: string;
  callbackId: string;
  interest: InterestLevel | null;
  /** "Stop follow-up": only the not-interested outcome, with quick reasons. */
  stopMode?: boolean;
  /** The last attempt was a WhatsApp message: ask whether they replied. */
  awaiting?: { at: string; message: string | null } | null;
  onClose: () => void;
  /** Called after saving, with a short line for the activity log. */
  onSaved: (summary: string) => void;
}) {
  const [channel, setChannel] = useState<FollowUpChannel>('call');
  const [outcome, setOutcome] = useState<FollowUpOutcome | null>(null);
  const [interest, setInterest] = useState<InterestLevel | null>(currentInterest);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('11:00');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [topic, setTopic] = useState<FollowUpTopic | null>(null);
  const [messageSent, setMessageSent] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyed on the message time: callers build the awaiting object on each render.
  const awaitingAt = awaiting?.at ?? null;
  useEffect(() => {
    if (!open) return;
    setChannel(awaitingAt ? 'whatsapp' : 'call');
    setOutcome(stopMode ? 'not_interested' : null);
    setInterest(currentInterest);
    setDate(istDateKey(new Date(Date.now() + 2 * 86_400_000)));
    setTime('11:00');
    setNote('');
    setReason('');
    setTopic(null);
    setMessageSent('');
    setReply('');
    setError(null);
  }, [open, currentInterest, stopMode, awaitingAt]);

  const whatsapp = channel === 'whatsapp';
  const options = whatsapp ? (awaiting ? REPLY_OUTCOMES : WHATSAPP_OUTCOMES) : CALL_OUTCOMES;
  const labelOf = (o: FollowUpOutcome) => (whatsapp ? whatsappLabel(o, !!awaiting) : FOLLOW_UP_OUTCOME_LABELS[o]);
  const sending = outcome === 'message_sent';
  const replied = whatsapp && !!outcome && REPLIED.has(outcome);

  const needsDate = outcome === 'thinking' || outcome === 'will_join' || sending;
  const next = needsDate && date && /^\d{2}:\d{2}$/.test(time) ? istDateTime(date, time) : null;
  const ok =
    !!outcome &&
    (!needsDate || (!!next && next.getTime() > Date.now())) &&
    (outcome !== 'not_interested' || reason.trim().length > 1);

  const summary = (): string => {
    if (stopMode) return 'Follow-up stopped';
    if (sending) return `WhatsApp message sent${topic ? ` (${FOLLOW_UP_TOPIC_LABELS[topic]})` : ''}, waiting for a reply`;
    if (whatsapp && outcome) return `WhatsApp: ${labelOf(outcome)}`;
    return 'Follow-up call logged';
  };

  const save = async () => {
    if (!outcome) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/follow-ups/${callbackId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          nextAt: next?.toISOString(),
          note: note.trim(),
          reason: reason.trim(),
          interest,
          channel: stopMode ? 'call' : channel,
          topic: sending ? topic : null,
          messageSent: sending ? messageSent.trim() : '',
          reply: replied ? reply.trim() : '',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not save.');
      onSaved(summary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const first = name.trim().split(/\s+/)[0] || name;
  const title = stopMode ? `Stop following up ${name}?` : awaiting ? `Did ${first} reply?` : `Follow-up with ${name}`;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="outcome-title">
      <DialogTitle id="outcome-title">{title}</DialogTitle>
      <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
        {stopMode && (
          <Typography variant="body2" color="text.secondary">
            They move to Closed with this reason. You can restart the follow-up later.
          </Typography>
        )}
        {!stopMode && awaiting && (
          <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              Your WhatsApp message, {formatDemoDateTime(new Date(awaiting.at))}
            </Typography>
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', mt: 0.5, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {awaiting.message || 'Message text was not saved.'}
            </Typography>
          </Paper>
        )}
        {!stopMode && (
          <Box>
            <Typography variant="body2" id="channel-label" sx={{ mb: 1 }}>How did you reach them?</Typography>
            <ToggleButtonGroup
              exclusive
              value={channel}
              onChange={(_, v: FollowUpChannel | null) => {
                if (!v) return;
                setChannel(v);
                setOutcome(null);
              }}
              aria-labelledby="channel-label"
              sx={CHIP_SX}
            >
              <ToggleButton value="call">Call</ToggleButton>
              <ToggleButton value="whatsapp">WhatsApp message</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        )}
        <Box sx={{ display: stopMode ? 'none' : 'block' }}>
          <Typography variant="body2" id="outcome-label" sx={{ mb: 1 }}>
            {whatsapp ? 'What happened?' : 'How did it go?'}
          </Typography>
          <ToggleButtonGroup exclusive value={outcome} onChange={(_, v) => setOutcome(v)} aria-labelledby="outcome-label" sx={CHIP_SX}>
            {options.map((o) => (
              <ToggleButton key={o} value={o}>{labelOf(o)}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        {sending && (
          <>
            <Box>
              <Typography variant="body2" id="topic-label" sx={{ mb: 1 }}>What was it about?</Typography>
              <ToggleButtonGroup exclusive value={topic} onChange={(_, v) => setTopic(v)} aria-labelledby="topic-label" sx={CHIP_SX}>
                {FOLLOW_UP_TOPICS.map((t) => (
                  <ToggleButton key={t} value={t}>{FOLLOW_UP_TOPIC_LABELS[t]}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <TextField
              label="Message we sent"
              helperText="Paste it here, so the next person sees exactly what they were told."
              value={messageSent}
              onChange={(e) => setMessageSent(e.target.value)}
              multiline
              minRows={4}
              inputProps={{ maxLength: 2000 }}
            />
          </>
        )}
        {replied && (
          <TextField
            label="Their reply (optional)"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            multiline
            minRows={2}
            inputProps={{ maxLength: 2000 }}
          />
        )}
        {needsDate && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField
              label={sending ? 'Check for a reply on' : outcome === 'will_join' ? 'They will join on' : 'Next follow-up'}
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              InputLabelProps={{ shrink: true }} inputProps={{ min: istDateKey(new Date()) }} required
            />
            <TextField label="Time (India)" type="time" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} required />
          </Box>
        )}
        {outcome === 'no_answer' && (
          <Typography variant="body2" color="text.secondary">
            {whatsapp ? 'We will remind you to check again in 2 days.' : 'We will remind you to try again in 2 days.'}
          </Typography>
        )}
        {outcome === 'not_interested' && (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <Box>
              <Typography variant="body2" id="stop-reason-label" sx={{ mb: 1 }}>Reason</Typography>
              <ToggleButtonGroup
                exclusive
                value={STOP_REASONS.includes(reason) ? reason : null}
                onChange={(_, v) => v && setReason(v === 'Other' ? '' : v)}
                aria-labelledby="stop-reason-label"
                sx={CHIP_SX}
              >
                {STOP_REASONS.map((r) => (
                  <ToggleButton key={r} value={r}>{r}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <TextField label="Why not? (required)" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 300 }} required />
          </Box>
        )}
        {outcome && outcome !== 'not_interested' && !sending && (
          <Box>
            <Typography variant="body2" id="interest2-label" sx={{ mb: 1 }}>Interest now</Typography>
            <ToggleButtonGroup exclusive value={interest} onChange={(_, v) => v && setInterest(v)} aria-labelledby="interest2-label" sx={CHIP_SX}>
              {(Object.keys(INTEREST_LABELS) as InterestLevel[]).map((k) => (
                <ToggleButton key={k} value={k}>{INTEREST_LABELS[k]}</ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        )}
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} inputProps={{ maxLength: 1000 }} />
        {error && <Alert severity="error" role="alert">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>Back</Button>
        <Button variant="contained" color={stopMode ? 'error' : 'primary'} onClick={save} disabled={!ok || busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined} sx={{ minHeight: 44 }}>
          {busy ? 'Saving' : stopMode ? 'Stop follow-up' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
