'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';

/**
 * Sending the message, with the teacher able to see exactly what goes where.
 *
 * The old nudge was one button that fired one generic sentence, "You have
 * classes waiting on your catch-up list", and reported "Nudge sent." A teacher
 * had no idea what was said, to whom, or through what, which is why the button
 * read as decorative. This dialog is small on purpose: it states the three
 * things that actually happen, lets the wording be changed, and afterwards says
 * which channels landed.
 */

export interface NudgeOutcome {
  counts: { total: number; chat?: number; teams: number; inapp: number; failed: number };
  parents?: { emailed?: number; notified?: number };
  teamsPost?: { channel: boolean; chat: boolean; error?: string | null };
}

interface NudgeDialogProps {
  open: boolean;
  onClose: () => void;
  classTitle: string;
  classDateLabel: string;
  /** Names in the order they will be mentioned, for the preview. */
  names: string[];
  sending: boolean;
  outcome: NudgeOutcome | null;
  onSend: (input: { message: string; postToTeams: boolean }) => void;
  /**
   * A message written for who is selected: asking for a reason when none of
   * them gave one, a gentler push when they all did. Editable; empty means the
   * server's default.
   */
  presetMessage?: string;
}

export function summarise(o: NudgeOutcome): string {
  const parts: string[] = [];
  const chat = o.counts.chat ?? 0;
  if (chat) parts.push(`${chat} in your Teams chat`);
  if (o.counts.teams) parts.push(`${o.counts.teams} pinged in Teams`);
  const onlyInApp = o.counts.inapp - chat - o.counts.teams;
  if (onlyInApp > 0) parts.push(`${onlyInApp} in Nexus only`);
  const parents = o.parents?.notified ?? o.parents?.emailed ?? 0;
  if (parents) parts.push(`${parents} parent${parents === 1 ? '' : 's'} told in Nexus`);
  if (o.teamsPost?.channel) parts.push('posted to the class channel');
  if (o.teamsPost?.chat) parts.push('posted to the group chat');
  if (o.counts.failed) parts.push(`${o.counts.failed} could not be reached`);
  return parts.length ? parts.join(', ') : 'Nothing was sent.';
}

export default function NudgeDialog({
  open,
  onClose,
  classTitle,
  classDateLabel,
  names,
  sending,
  outcome,
  onSend,
  presetMessage,
}: NudgeDialogProps) {
  const [message, setMessage] = useState(presetMessage ?? '');
  // Reload the preset every time the dialog opens, so a message written for the
  // silent group does not go to the next selection unchanged.
  useEffect(() => {
    if (open) setMessage(presetMessage ?? '');
  }, [open, presetMessage]);

  const preview = names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : '');

  return (
    <Dialog open={open} onClose={sending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
        Ask {names.length} {names.length === 1 ? 'student' : 'students'} to catch up
      </DialogTitle>
      <DialogContent>
        {outcome ? (
          <Alert severity={outcome.counts.failed ? 'warning' : 'success'} sx={{ borderRadius: 2 }}>
            {summarise(outcome)}
            {outcome.teamsPost?.error && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                The Teams post did not go: {outcome.teamsPost.error}
              </Typography>
            )}
          </Alert>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {preview}
            </Typography>

            <TextField
              label="What to say"
              placeholder={`You missed ${classTitle} on ${classDateLabel}. Watch the recording in Nexus and take the short check.`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              // 16px stops iOS zooming the whole dialog on focus.
              inputProps={{ style: { fontSize: 16 } }}
              helperText="Leave it blank to send the default, which names this class and its date. A link straight to this class in Nexus is added either way."
            />

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Each student gets it privately from Neram Assistant in Teams, with your name on it,
              and as a Nexus notification. Nothing is posted in the class group. Every message
              carries a link that opens this class&rsquo;s catch-up page, so they can start from
              it. A parent is copied only for anyone who has already been nudged about this class
              once.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={sending} sx={{ minHeight: 44, textTransform: 'none' }}>
          {outcome ? 'Done' : 'Cancel'}
        </Button>
        {!outcome && (
          <Button
            variant="contained"
            onClick={() => onSend({ message: message.trim(), postToTeams: false })}
            disabled={sending || names.length === 0}
            startIcon={sending ? <CircularProgress size={16} /> : <SendIcon />}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            {sending ? 'Sending...' : 'Send'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
