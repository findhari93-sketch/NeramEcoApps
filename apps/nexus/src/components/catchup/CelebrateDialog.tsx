'use client';

/**
 * The preview before a classroom hears who is caught up.
 *
 * Modelled on NudgeDialog next door, with one difference that is the reason it
 * is a separate component: a nudge is a private message to one person, and this
 * is a public post naming children in front of their whole batch. The names are
 * therefore shown in full before anything is sent, not summarised as "and 6
 * more", because the thing a teacher needs to check is precisely the list.
 *
 * The server re-derives that list anyway and can only ever shorten it, so what
 * comes back after a send is the truth and is reported rather than assumed.
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';
import { timeAgo } from './shared';

export interface CelebrateOutcome {
  ok: boolean;
  named?: string[];
  error?: string | null;
  /**
   * False when the post went out but the record of it could not be saved, so
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
  /** Selected students who were already congratulated, named in the warning. */
  repeats?: CelebrateRepeat[];
  busy?: boolean;
  outcome: CelebrateOutcome | null;
  onClose: () => void;
  onSend: (message: string, postToTeams: 'both' | 'channel') => void;
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
  const [message, setMessage] = useState('');
  const [alsoChat, setAlsoChat] = useState(true);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 800 }}>Congratulate in Teams</DialogTitle>
      <DialogContent>
        {outcome ? (
          <Stack spacing={1.5}>
            <Alert severity={outcome.ok ? 'success' : 'error'} sx={{ borderRadius: 2 }}>
              {outcome.ok
                ? `Posted, naming ${outcome.named?.length ?? 0} ${
                    (outcome.named?.length ?? 0) === 1 ? 'student' : 'students'
                  }.`
                : outcome.error || 'Could not post to Teams.'}
            </Alert>
            {outcome.ok && outcome.recorded === false && (
              <Alert severity="warning" sx={{ borderRadius: 2 }}>
                The post went out, but Nexus could not save that these students were congratulated.
                Select them and use Mark as congratulated so they are not named again.
              </Alert>
            )}
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              These {names.length === 1 ? 'name goes' : 'names go'} into the class Teams channel,
              tagged so they land in each student&apos;s activity feed. Nothing about anyone who is
              behind is included.
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
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {names.join(', ')}
              </Typography>
            </Box>

            <TextField
              label="Add a line of your own"
              placeholder="Nothing left on their catch-up list. If you have a class waiting, this is a good week to clear it."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              multiline
              minRows={2}
              fullWidth
              // 16px stops iOS zooming the whole page when the field is focused.
              inputProps={{ style: { fontSize: 16 } }}
            />

            <FormControlLabel
              control={
                <Checkbox checked={alsoChat} onChange={(e) => setAlsoChat(e.target.checked)} />
              }
              label="Also post in the classroom group chat"
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
            disabled={busy || names.length === 0}
            onClick={() => onSend(message.trim(), alsoChat ? 'both' : 'channel')}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
          >
            {busy ? 'Posting...' : 'Post to Teams'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/**
 * Says who is being named again, and when they were last named, so a repeat is
 * a choice the teacher sees rather than one they stumble into.
 */
export function describeRepeats(repeats: CelebrateRepeat[]): string {
  if (repeats.length === 1) {
    const [r] = repeats;
    const when = timeAgo(r.lastAt);
    return `${r.name} was already congratulated${when ? ` ${when}` : ''} and will be named again.`;
  }
  const names = repeats.map((r) => r.name);
  const list =
    names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list} were already congratulated and will be named again.`;
}
