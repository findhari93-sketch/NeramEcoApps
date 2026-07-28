'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  Divider,
  SwipeableDrawer,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import { RADIUS } from './timetable-theme';

export interface ReschedulePayload {
  scheduled_date: string;
  start_time: string;
  end_time: string;
}

interface RescheduleDialogProps {
  open: boolean;
  onClose: () => void;
  cls: {
    id: string;
    title: string;
    scheduled_date: string;
    start_time: string;
    end_time: string;
    teams_meeting_id?: string | null;
  } | null;
  onSubmit: (payload: ReschedulePayload) => void;
  submitting?: boolean;
  /** Server-side failure, shown in place rather than as a passing toast. */
  error?: string | null;
}

function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatTime(time: string): string {
  const [h, m] = (time || '').split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return time;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

/**
 * Moving a class to another day or time.
 *
 * Its own action rather than a field inside Edit, because "something came up,
 * push tonight to tomorrow" is the single most common change a teacher makes and
 * it was previously buried among thirteen other fields with no label suggesting
 * it could be done at all.
 *
 * Deliberately narrow: date and the two times, nothing else. Everything about
 * the class that is not "when" stays in Edit, so this screen can be read and
 * acted on in a few seconds on a phone.
 *
 * Bottom sheet below sm, centred dialog above, matching RsvpReasonDialog.
 */
export default function RescheduleDialog({
  open,
  onClose,
  cls,
  onSubmit,
  submitting,
  error,
}: RescheduleDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  // Reset from the class every time it opens, so a dialog closed without saving
  // never carries a half-typed date into the next class the teacher taps.
  useEffect(() => {
    if (open && cls) {
      setDate(cls.scheduled_date);
      setStart(cls.start_time.slice(0, 5));
      setEnd(cls.end_time.slice(0, 5));
    }
  }, [open, cls]);

  const changed =
    !!cls &&
    (date !== cls.scheduled_date ||
      start !== cls.start_time.slice(0, 5) ||
      end !== cls.end_time.slice(0, 5));

  const endsBeforeItStarts = useMemo(() => !!start && !!end && end <= start, [start, end]);
  const canSubmit = !!date && !!start && !!end && changed && !endsBeforeItStarts && !submitting;

  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '88vh' : undefined }}>
      <Box sx={{ p: 2.5, pb: 0 }}>
        <Typography
          sx={{
            fontSize: '0.6563rem',
            fontWeight: 700,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: 'primary.main',
          }}
        >
          Reschedule
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '1.1875rem', lineHeight: 1.25, mt: 0.25 }}>
          Move this class
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {cls?.title}
        </Typography>
      </Box>

      <Box sx={{ p: 2.5, pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Old slot to new slot, so the change is visible before it is committed. */}
        {cls && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              p: 1.25,
              borderRadius: RADIUS.control,
              bgcolor: 'action.hover',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Now</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatDay(cls.scheduled_date)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatTime(cls.start_time)}
              </Typography>
            </Box>
            <ArrowRightAltIcon sx={{ color: changed ? 'primary.main' : 'text.disabled' }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary">Moving to</Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: changed ? 'primary.main' : 'text.disabled' }}
              >
                {date ? formatDay(date) : 'Pick a day'}
              </Typography>
              <Typography variant="caption" color={changed ? 'primary.main' : 'text.disabled'}>
                {start ? formatTime(start) : ''}
              </Typography>
            </Box>
          </Box>
        )}

        <TextField
          label="New date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          fullWidth
          InputLabelProps={{ shrink: true }}
          inputProps={{ style: { minHeight: 32 } }}
        />

        {/* One field per row below sm: two date pickers side by side on a 375px
            screen leaves each too narrow to tap accurately. */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
          <TextField
            label="Starts"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Ends"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            error={endsBeforeItStarts}
            helperText={endsBeforeItStarts ? 'The class cannot end before it starts.' : ' '}
          />
        </Box>

        <Typography variant="caption" color="text.secondary">
          {cls?.teams_meeting_id
            ? 'The Teams meeting moves with the class, and the card in the channel and the group chat is replaced with the new time. Students are notified.'
            : 'Students are notified. This class has no Teams meeting yet, so nothing needs to move in Teams.'}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ borderRadius: RADIUS.control }}>
            {error}
          </Alert>
        )}
      </Box>

      <Divider />

      {/* Keeping the current slot is the quiet first action, matching the RSVP
          sheet: backing out of a destructive-feeling change should be easy. */}
      <Box sx={{ p: 2, display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{ textTransform: 'none', minHeight: 48, borderRadius: RADIUS.control, fontWeight: 600 }}
        >
          Keep it as it is
        </Button>
        <Button
          variant="contained"
          onClick={() => canSubmit && onSubmit({ scheduled_date: date, start_time: start, end_time: end })}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', minHeight: 48, borderRadius: RADIUS.control, fontWeight: 700 }}
        >
          {submitting ? 'Moving...' : 'Move the class'}
        </Button>
      </Box>
    </Box>
  );

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open}
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        PaperProps={{ sx: { borderTopLeftRadius: 18, borderTopRightRadius: 18 } }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
          <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'grey.300' }} />
        </Box>
        {body}
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 2.25 } }}>
      {body}
    </Dialog>
  );
}
