'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  Divider,
  SwipeableDrawer,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import { RSVP_REASONS, reasonRequiresNote, type RsvpReasonCode } from '@/lib/rsvp-reasons';
import { RADIUS } from './timetable-theme';

export interface RsvpDeclinePayload {
  reasonCode: RsvpReasonCode;
  note: string;
  wantsCatchup: boolean;
  /**
   * 'class' is this one evening, the original behaviour and still the default.
   * 'window' is a stretch of days, for the student sitting school exams who
   * would otherwise have to decline eight classes one at a time.
   */
  scope: DeclineScope;
  /** Scope 'window' only: the last day away, or null for "I do not know yet". */
  endsOn: string | null;
}

export type DeclineScope = 'class' | 'window';

interface RsvpReasonDialogProps {
  open: boolean;
  onClose: () => void;
  classTitle: string;
  /** Optional "Thu 23, 7 PM" line under the title. */
  classSubtitle?: string;
  /**
   * The class's own date as YYYY-MM-DD. An away window declared from here starts
   * on it, so "I am away from this class onwards" means what it says. Without it
   * the scope step is hidden rather than guessed at.
   */
  classDate?: string;
  onSubmit: (payload: RsvpDeclinePayload) => void;
  submitting?: boolean;
}

/**
 * The one place a student steps out of a class.
 *
 * Because everyone attends by default, this is the only moment their intent is
 * ever captured, so it has to be fast: four tappable rows, and typing required
 * only for "Other". The free-text box it replaces was mandatory on every
 * decline, which is real friction on a phone and produced reasons nobody could
 * aggregate.
 *
 * Renders as a bottom sheet on mobile and a centred dialog on desktop.
 */
export default function RsvpReasonDialog({
  open,
  onClose,
  classTitle,
  classSubtitle,
  classDate,
  onSubmit,
  submitting,
}: RsvpReasonDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [reasonCode, setReasonCode] = useState<RsvpReasonCode>('unwell');
  const [note, setNote] = useState('');
  const [wantsCatchup, setWantsCatchup] = useState(true);
  const [touched, setTouched] = useState(false);
  const [scope, setScope] = useState<DeclineScope>('class');
  const [endsOn, setEndsOn] = useState('');
  const [openEnded, setOpenEnded] = useState(false);

  // Reset per opening, so last week's reason is never pre-filled onto this week.
  useEffect(() => {
    if (open) {
      setReasonCode('unwell');
      setNote('');
      setWantsCatchup(true);
      setTouched(false);
      setScope('class');
      setEndsOn('');
      setOpenEnded(false);
    }
  }, [open]);

  const needsNote = reasonRequiresNote(reasonCode);
  const noteMissing = needsNote && !note.trim();
  const isWindow = scope === 'window';
  // A window needs either a return date or an explicit "I do not know yet". It
  // asks rather than defaulting to open-ended, because an open-ended window
  // explains every future class and a student who actually knows their return
  // date should not have to be asked for it twice.
  const returnMissing = isWindow && !openEnded && !endsOn;
  const returnBeforeStart = isWindow && !openEnded && !!endsOn && !!classDate && endsOn < classDate;
  const canSubmit = !noteMissing && !returnMissing && !returnBeforeStart && !submitting;

  const handleSubmit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({
      reasonCode,
      note: note.trim(),
      wantsCatchup,
      scope,
      endsOn: isWindow && !openEnded ? endsOn : null,
    });
  };

  const body = (
    <Box sx={{ display: 'flex', flexDirection: 'column', maxHeight: isMobile ? '88vh' : undefined }}>
      {/* Header */}
      <Box sx={{ p: 2.5, pb: 0, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: '0.6563rem',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'primary.main',
            }}
          >
            RSVP
          </Typography>
          <Typography sx={{ mt: 0.5, fontWeight: 800, fontSize: '1.1875rem', lineHeight: 1.25 }}>
            Cannot make this class?
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {classTitle}
            {classSubtitle ? `, ${classSubtitle}` : ''}
          </Typography>
        </Box>
        <Button
          onClick={onClose}
          aria-label="Close"
          sx={{
            minWidth: 40,
            minHeight: 40,
            p: 0,
            borderRadius: RADIUS.control,
            color: 'text.secondary',
            bgcolor: alpha(theme.palette.text.primary, 0.04),
          }}
        >
          <CloseIcon fontSize="small" />
        </Button>
      </Box>

      {/* Reasons */}
      <Box sx={{ p: 2.5, pt: 2, overflowY: 'auto' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          You are marked attending by default. Pick a reason so your teacher knows. You will still
          get the recording and the assignment.
        </Typography>

        <Box role="radiogroup" aria-label="Reason for not attending" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {RSVP_REASONS.map((r) => {
            const selected = reasonCode === r.code;
            return (
              <Box
                key={r.code}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => setReasonCode(r.code)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setReasonCode(r.code);
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.25,
                  minHeight: 52,
                  px: 1.625,
                  borderRadius: RADIUS.control,
                  cursor: 'pointer',
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'background.paper',
                  border: selected
                    ? `1.5px solid ${theme.palette.primary.main}`
                    : `1px solid ${theme.palette.divider}`,
                  transition: 'background-color 150ms ease, border-color 150ms ease',
                  '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                }}
              >
                <Box
                  sx={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1.5px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
                  }}
                >
                  {selected && (
                    <Box sx={{ width: 9, height: 9, borderRadius: 999, bgcolor: 'primary.main' }} />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{r.label}</Typography>
              </Box>
            );
          })}
        </Box>

        {needsNote && (
          <TextField
            label="What came up?"
            fullWidth
            multiline
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={touched && noteMissing}
            helperText={touched && noteMissing ? 'Add a short note so your teacher knows.' : ' '}
            sx={{ mt: 1.5 }}
          />
        )}


        {/*
          How long for. Only shown when we know the class's date, because an away
          window has to start somewhere and guessing is worse than not offering.

          "Just this class" is preselected and listed first, so the common case
          stays exactly as fast as it was: pick a reason, send. The fortnight case
          is one extra tap for the people who need it, rather than a question put
          to everyone.
        */}
        {classDate && (
          <Box sx={{ mt: 2.5 }}>
            <Typography
              sx={{
                fontSize: '0.6563rem',
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'text.secondary',
                mb: 1,
              }}
            >
              How long for
            </Typography>
            <Box
              role="radiogroup"
              aria-label="How long you will be away"
              sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
            >
              {(
                [
                  { value: 'class' as DeclineScope, label: 'Just this class' },
                  { value: 'window' as DeclineScope, label: 'I will be away for a while' },
                ]
              ).map((opt) => {
                const selected = scope === opt.value;
                return (
                  <Box
                    key={opt.value}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={0}
                    onClick={() => setScope(opt.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setScope(opt.value);
                      }
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      minHeight: 52,
                      px: 1.625,
                      borderRadius: RADIUS.control,
                      cursor: 'pointer',
                      bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'background.paper',
                      border: selected
                        ? `1.5px solid ${theme.palette.primary.main}`
                        : `1px solid ${theme.palette.divider}`,
                      transition: 'background-color 150ms ease, border-color 150ms ease',
                      '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.04) },
                      '&:focus-visible': {
                        outline: `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: `1.5px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
                      }}
                    >
                      {selected && (
                        <Box sx={{ width: 9, height: 9, borderRadius: 999, bgcolor: 'primary.main' }} />
                      )}
                    </Box>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{opt.label}</Typography>
                  </Box>
                );
              })}
            </Box>

            {isWindow && (
              <Box sx={{ mt: 1.5 }}>
                <TextField
                  type="date"
                  label="Back on"
                  fullWidth
                  disabled={openEnded}
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  // Cannot return before you leave. The browser enforces it on
                  // the picker and the check above enforces it on submit, since
                  // a typed date bypasses the picker entirely.
                  inputProps={{ min: classDate }}
                  InputLabelProps={{ shrink: true }}
                  error={touched && (returnMissing || returnBeforeStart)}
                  helperText={
                    touched && returnBeforeStart
                      ? 'That is before the class you are missing.'
                      : touched && returnMissing
                        ? 'Give a date, or tick that you do not know yet.'
                        : ' '
                  }
                />
                <Box
                  component="label"
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
                >
                  <Checkbox
                    checked={openEnded}
                    onChange={(e) => {
                      setOpenEnded(e.target.checked);
                      if (e.target.checked) setEndsOn('');
                    }}
                    sx={{ p: 1 }}
                  />
                  <Typography variant="body2">I do not know yet</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Every class in this period will show your teacher that you told
                  them in advance. You will still get the recordings.
                </Typography>
              </Box>
            )}
          </Box>
        )}
        <Box
          component="label"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, cursor: 'pointer' }}
        >
          <Checkbox
            checked={wantsCatchup}
            onChange={(e) => setWantsCatchup(e.target.checked)}
            sx={{ p: 1 }}
          />
          <Typography variant="body2">
            Send me the recording and the assignment to catch up
          </Typography>
        </Box>
      </Box>

      <Divider />

      {/* Actions. "Stay attending" is first and quiet: backing out should be the
          easy path, since the default is the one we want most students on. */}
      <Box sx={{ p: 2, display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{ textTransform: 'none', minHeight: 48, borderRadius: RADIUS.control, fontWeight: 600 }}
        >
          Stay attending
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ textTransform: 'none', minHeight: 48, borderRadius: RADIUS.control, fontWeight: 700 }}
        >
          {submitting ? 'Saving...' : isWindow ? 'Save away dates' : 'Mark not attending'}
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
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 2.25 } }}
    >
      {body}
    </Dialog>
  );
}
