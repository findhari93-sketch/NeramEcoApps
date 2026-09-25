'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';
import { summarise, type NudgeOutcome } from './NudgeDialog';
import { HOMEWORK_REMIND_EVERY_DAYS, homeworkPhrase, shortIstDate } from '@/lib/homework-reminders';

/**
 * Reminding the students who came to a class and have not handed its homework
 * in. One message now, from Neram Assistant with the teacher's name on it, and
 * (switched on by default) again every 3 days until each student hands it in.
 *
 * It says who, about what, and what happens next, because a repeating message
 * that nobody can see the schedule of is the kind a teacher turns off in a panic.
 */

export interface HomeworkReminderOutcome extends NudgeOutcome {
  repeat: { everyDays: number; nextOn: string } | null;
  skipped?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  classTitle: string;
  classDateLabel: string;
  names: string[];
  /** Titles of the homework at least one of them still owes. */
  homework: string[];
  sending: boolean;
  outcome: HomeworkReminderOutcome | null;
  onSend: (input: { message: string; repeat: boolean }) => void;
}

export default function HomeworkReminderDialog({
  open,
  onClose,
  classTitle,
  classDateLabel,
  names,
  homework,
  sending,
  outcome,
  onSend,
}: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [message, setMessage] = useState('');
  const [repeat, setRepeat] = useState(true);
  useEffect(() => {
    if (open) {
      setMessage('');
      setRepeat(true);
    }
  }, [open]);

  const count = names.length;
  const preview = names.slice(0, 6).join(', ') + (count > 6 ? ` and ${count - 6} more` : '');
  const when = classDateLabel ? `${classTitle} on ${classDateLabel}` : classTitle;
  const what = homeworkPhrase(homework);

  return (
    <Dialog open={open} onClose={sending ? undefined : onClose} fullWidth maxWidth="sm" fullScreen={phone}>
      <DialogTitle sx={{ fontWeight: 800, pb: 0.5 }}>
        Remind {count} {count === 1 ? 'student' : 'students'} about the homework
      </DialogTitle>
      <DialogContent>
        {outcome ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Alert severity={outcome.counts.failed ? 'warning' : 'success'} sx={{ borderRadius: 2 }}>
              {summarise(outcome)}
            </Alert>
            {outcome.repeat && (
              <Typography variant="body2" data-testid="homework-next-reminder">
                Next reminder on <b>{shortIstDate(outcome.repeat.nextOn)}</b>, then every{' '}
                {outcome.repeat.everyDays} days until each of them hands it in.
              </Typography>
            )}
            {!!outcome.skipped && (
              <Typography variant="caption" color="text.secondary">
                {outcome.skipped} you picked had already handed it in, so they were left out.
              </Typography>
            )}
          </Box>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {preview}
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              Not in yet: <b>{what}</b>
            </Typography>

            <TextField
              label="What to say"
              placeholder={`Hi (first name), you came to ${when}, but ${what} is not handed in yet. Please hand it in on Nexus.`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              fullWidth
              multiline
              minRows={3}
              // 16px stops iOS zooming the whole dialog on focus.
              inputProps={{ style: { fontSize: 16 }, maxLength: 2000 }}
              helperText="Leave it blank to send this, with each student's first name and the homework they still owe. A button to open the homework is added either way."
            />

            <Box
              sx={{
                mt: 2,
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: repeat ? 'primary.main' : 'divider',
                transition: 'border-color 150ms',
              }}
            >
              <FormControlLabel
                sx={{ m: 0, minHeight: 44, width: '100%', alignItems: 'center', gap: 1 }}
                control={
                  <Switch
                    checked={repeat}
                    onChange={(e) => setRepeat(e.target.checked)}
                    inputProps={{ 'aria-describedby': 'homework-repeat-hint' }}
                  />
                }
                label={
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Remind again every {HOMEWORK_REMIND_EVERY_DAYS} days until they hand it in
                  </Typography>
                }
              />
              <Typography id="homework-repeat-hint" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                At 7 pm, from Neram Assistant. Each student drops off the day they hand it in. You can
                stop it any time from the Attended tab.
              </Typography>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Each student gets this privately from Neram Assistant in Teams, with your name on it, and
              as a Nexus notification. Nothing is posted in the class group.
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
            onClick={() => onSend({ message: message.trim(), repeat })}
            disabled={sending || count === 0}
            startIcon={sending ? <CircularProgress size={16} /> : <SendIcon />}
            sx={{ minHeight: 44, textTransform: 'none' }}
            data-testid="homework-reminder-send"
          >
            {sending ? 'Sending' : 'Send reminder'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
