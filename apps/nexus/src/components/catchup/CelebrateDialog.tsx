'use client';

/**
 * A personal note to students who have nothing left to catch up on.
 *
 * This used to preview a class-group Teams post naming everyone who was clear.
 * That post is gone (2026-10): students are congratulated automatically and
 * individually by Neram Assistant as they clear each class, and naming the same
 * students in front of the whole batch week after week had become repetitive.
 *
 * What the teacher sends from here goes to each student ONE TO ONE, as a Neram
 * Assistant card that says it is from them and carries a "Message <teacher>"
 * button. Nothing is sent from the teacher's own Teams, and nobody sees who
 * else received it. The message is prefilled so one tap is enough, and
 * editable because the point of a note is that it sounds like a person.
 *
 * The server re-derives the recipients and can only ever shorten the list, so
 * what comes back after a send is reported rather than assumed.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { timeAgo } from './shared';

export const DEFAULT_NOTE =
  'Well done, {firstName}. You have caught up on every class you missed. That takes real discipline. Keep it going.';

export interface CelebrateOutcome {
  ok: boolean;
  named?: string[];
  error?: string | null;
  /**
   * False when the note went out but the record of it could not be saved, so
   * the wall will still show these students as not congratulated.
   */
  recorded?: boolean;
}

/** A selected student who has been congratulated before. */
export interface CelebrateRepeat {
  name: string;
  lastAt: string;
}

export interface CelebrateDialogProps {
  open: boolean;
  names: string[];
  /** Selected students who were already congratulated, named in the note. */
  repeats?: CelebrateRepeat[];
  busy?: boolean;
  outcome: CelebrateOutcome | null;
  onClose: () => void;
  onSend: (message: string) => void;
}

export default function CelebrateDialog({
  open,
  names,
  repeats = [],
  busy,
  outcome,
  onClose,
  onSend,
}: CelebrateDialogProps) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [message, setMessage] = useState(DEFAULT_NOTE);
  // A fresh note each time the composer opens, so last week's words do not
  // quietly go to this week's students.
  useEffect(() => {
    if (open) setMessage(DEFAULT_NOTE);
  }, [open]);

  const count = names.length;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle sx={{ fontWeight: 800 }}>
        {count === 1 ? `Send ${names[0]} a note` : `Send ${count} students a note`}
      </DialogTitle>
      <DialogContent>
        {outcome ? (
          <Stack spacing={1.5}>
            <Alert severity={outcome.ok ? 'success' : 'error'} sx={{ borderRadius: 2 }}>
              {outcome.ok
                ? `Sent to ${outcome.named?.length ?? 0} ${
                    (outcome.named?.length ?? 0) === 1 ? 'student' : 'students'
                  }, each one privately.`
                : outcome.error || 'Could not send the note.'}
            </Alert>
            {outcome.ok && outcome.recorded === false && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                The note went out, but Nexus could not save that these students were congratulated.
                Select them and use Mark as congratulated so they are not sent another.
              </Alert>
            )}
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Each student gets this privately from Neram Assistant, with your name on it and a
              button to message you. They already get an automatic well done when they clear each
              class; this is your own word on top.
            </Typography>

            {repeats.length > 0 && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                {describeRepeats(repeats)}
              </Alert>
            )}

            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                maxHeight: 140,
                overflowY: 'auto',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                To
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {names.join(', ')}
              </Typography>
            </Box>

            <TextField
              label="Your note"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              helperText="{firstName} becomes each student's first name."
              multiline
              minRows={3}
              fullWidth
              // 16px stops iOS zooming the whole page when the field is focused.
              inputProps={{ style: { fontSize: 16 } }}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={busy} sx={{ minHeight: 44, textTransform: 'none' }}>
          {outcome ? 'Close' : 'Cancel'}
        </Button>
        {!outcome && (
          <Button
            variant="contained"
            color="success"
            disabled={busy || count === 0 || !message.trim()}
            onClick={() => onSend(message.trim())}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
          >
            {busy ? 'Sending...' : count === 1 ? 'Send note' : `Send ${count} notes`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Says who already heard from us, and when, so a second note is a choice the
 * teacher sees rather than one they stumble into.
 */
export function describeRepeats(repeats: CelebrateRepeat[]): string {
  if (repeats.length === 1) {
    const [r] = repeats;
    const when = timeAgo(r.lastAt);
    return `${r.name} was already congratulated${when ? ` ${when}` : ''} and will get another note.`;
  }
  const names = repeats.map((r) => r.name);
  const list =
    names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} were already congratulated and will get another note.`;
}
