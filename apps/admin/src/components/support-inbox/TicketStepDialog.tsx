'use client';

/**
 * The one dialog behind Resolve, Close, Ask requester and Reopen: an outcome
 * (with a hint for each), a note with templates, and for a duplicate the
 * ticket it duplicates. Checked on submit; the server checks again.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@neram/ui';
import type { SupportTicketResolutionCode } from '@neram/database';
import { TICKET_CONFIRM_DAYS, TICKET_STAFF_OUTCOMES, TICKET_WAITING_DAYS } from '@neram/database/support-ticket-status';
import { CHIP_SX } from './bits';
import { applyTemplate, templatesFor, type TemplateUse } from '@/lib/support-inbox/reply-templates';

export type StepMove = 'resolve' | 'close' | 'request_info' | 'reopen';

export interface StepPayload {
  resolution_code?: SupportTicketResolutionCode;
  note?: string;
  reason?: string;
  duplicate_of_ref?: string;
}

const MIN_NOTE = 10;

const COPY: Record<StepMove, { title: string; submit: string; noteLabel: string; help: string; use: TemplateUse }> = {
  resolve: {
    title: 'Resolve ticket',
    submit: 'Resolve',
    noteLabel: 'Note for the requester',
    help: `They are asked to confirm. If they do not answer, it closes on its own in ${TICKET_CONFIRM_DAYS} days.`,
    use: 'resolve',
  },
  close: {
    title: 'Close ticket',
    submit: 'Close ticket',
    noteLabel: 'Note for the requester',
    help: 'Closes now without asking them to confirm. They can still say Still happening for 7 days.',
    use: 'close',
  },
  request_info: {
    title: 'Ask the requester',
    submit: 'Send question',
    noteLabel: 'Your question',
    help: `They get a bell and an email. If they do not reply in ${TICKET_WAITING_DAYS} days, it closes as No reply.`,
    use: 'ask',
  },
  reopen: {
    title: 'Reopen ticket',
    submit: 'Reopen',
    noteLabel: 'Why (staff only, optional)',
    help: 'It goes back to In progress if someone owns it, otherwise to New.',
    use: 'note',
  },
};

export function TicketStepDialog({
  move,
  ticketNumber,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  move: StepMove | null;
  ticketNumber: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (payload: StepPayload) => void;
}) {
  const [code, setCode] = useState<SupportTicketResolutionCode | ''>('');
  const [note, setNote] = useState('');
  const [dup, setDup] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!move) return;
    setCode('');
    setNote('');
    setDup('');
    setTried(false);
  }, [move]);

  if (!move) return null;
  const copy = COPY[move];
  const needsOutcome = move === 'resolve' || move === 'close';
  const outcomes = TICKET_STAFF_OUTCOMES.filter((o) => move === 'close' || o.code !== 'duplicate');
  const isDup = move === 'close' && code === 'duplicate';
  const hint = outcomes.find((o) => o.code === code)?.hint;

  const errors = {
    code: needsOutcome && !code ? 'Pick an outcome.' : null,
    note:
      move === 'request_info' && !note.trim()
        ? 'Write what you need from them.'
        : needsOutcome && !isDup && note.trim().length < MIN_NOTE
          ? `Write at least ${MIN_NOTE} characters.`
          : null,
    dup: isDup && !/^NERAM-TKT-\d{3,}$/i.test(dup.trim()) ? 'Give a ticket number like NERAM-TKT-00012.' : isDup && dup.trim().toUpperCase() === ticketNumber ? 'A ticket cannot duplicate itself.' : null,
  };
  const valid = !errors.code && !errors.note && !errors.dup;

  const submit = () => {
    setTried(true);
    if (!valid) return;
    if (move === 'reopen') onSubmit({ reason: note.trim() || undefined });
    else if (move === 'request_info') onSubmit({ note: note.trim() });
    else onSubmit({ resolution_code: code as SupportTicketResolutionCode, note: note.trim(), duplicate_of_ref: isDup ? dup.trim().toUpperCase() : undefined });
  };

  const templates = templatesFor(copy.use);

  return (
    <Dialog open onClose={busy ? undefined : onCancel} fullWidth maxWidth="sm" aria-labelledby="ticket-step-title">
      <DialogTitle id="ticket-step-title" sx={{ fontWeight: 700 }}>
        {copy.title}{' '}
        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: 14, color: 'text.secondary' }}>
          {ticketNumber}
        </Typography>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Typography variant="body2" color="text.secondary">
          {copy.help}
        </Typography>

        {needsOutcome && (
          <FormControl error={tried && !!errors.code}>
            <FormLabel id="outcome-label" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
              Outcome
            </FormLabel>
            <RadioGroup aria-labelledby="outcome-label" value={code} onChange={(e) => setCode(e.target.value as SupportTicketResolutionCode)}>
              {outcomes.map((o) => (
                <FormControlLabel
                  key={o.code}
                  value={o.code}
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography component="span" sx={{ fontWeight: 600, fontSize: 14 }}>
                        {o.label}
                      </Typography>
                      <Typography component="span" sx={{ display: 'block', fontSize: 12, color: 'text.secondary' }}>
                        {o.hint}
                      </Typography>
                    </Box>
                  }
                  sx={{ minHeight: 48, alignItems: 'center', mr: 0 }}
                />
              ))}
            </RadioGroup>
            {tried && errors.code && <FormHelperText>{errors.code}</FormHelperText>}
          </FormControl>
        )}

        {isDup && (
          <TextField
            label="Duplicate of"
            placeholder="NERAM-TKT-00012"
            value={dup}
            onChange={(e) => setDup(e.target.value)}
            error={tried && !!errors.dup}
            helperText={(tried && errors.dup) || 'The ticket that already covers this. The requester is told to follow it there.'}
            inputProps={{ autoCapitalize: 'characters', spellCheck: false }}
            sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
          />
        )}

        <Box>
          {templates.length > 0 && (
            <Box role="group" aria-label="Templates" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              {templates.map((t) => (
                <Chip key={t.id} label={t.label} variant="outlined" clickable onClick={() => setNote((n) => applyTemplate(n, t))} sx={CHIP_SX} />
              ))}
            </Box>
          )}
          <TextField
            label={copy.noteLabel}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={4}
            fullWidth
            autoFocus
            error={tried && !!errors.note}
            helperText={(tried && errors.note) || (hint && !isDup ? hint : isDup ? 'Optional. A standard note is sent if you leave it empty.' : ' ')}
            inputProps={{ maxLength: 5000 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onCancel} disabled={busy} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disableElevation
          onClick={submit}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44, fontWeight: 700 }}
        >
          {copy.submit}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
