'use client';

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
  counts: { total: number; teams: number; inapp: number; email: number; failed: number };
  parents?: { emailed: number };
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
}

function summarise(o: NudgeOutcome): string {
  const parts: string[] = [];
  if (o.counts.teams) parts.push(`${o.counts.teams} pinged in Teams`);
  if (o.counts.email) parts.push(`${o.counts.email} emailed`);
  const onlyInApp = o.counts.inapp - o.counts.teams - o.counts.email;
  if (onlyInApp > 0) parts.push(`${onlyInApp} in Nexus only`);
  if (o.parents?.emailed) parts.push(`${o.parents.emailed} parent emailed`);
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
}: NudgeDialogProps) {
  const [message, setMessage] = useState('');
  const [postToTeams, setPostToTeams] = useState(true);

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

            <FormControlLabel
              sx={{ mt: 1 }}
              control={
                <Checkbox checked={postToTeams} onChange={(e) => setPostToTeams(e.target.checked)} />
              }
              label={
                <Box>
                  <Typography variant="body2">Also post in the class Teams channel</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Mentions each of them by name, so it shows in their Teams activity as well.
                  </Typography>
                </Box>
              }
            />

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Each student gets a Teams ping and a Nexus notification, and an email if Teams cannot
              reach them. Every one of them carries a link that opens this class&rsquo;s catch-up page,
              so they can start from the message. A parent is copied only for anyone who has already
              been nudged about this class once.
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
            onClick={() => onSend({ message: message.trim(), postToTeams })}
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
