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
import {
  PREWORK_REASONS,
  preworkReasonRequiresNote,
  preworkReasonShortLabel,
  type PreworkReasonCode,
} from '@/lib/prework-reasons';
import { RADIUS } from './timetable-theme';

export interface PreworkReasonPayload {
  reasonCode: PreworkReasonCode;
  note: string;
  started: boolean;
}

interface PreworkReasonDialogProps {
  open: boolean;
  onClose: () => void;
  assignmentTitle: string;
  /** "for Isometric Drawing at 7:00 PM" line under the title. */
  contextLine?: string;
  /** Existing answer, so reopening prefills instead of starting blank. */
  existing?: { reasonCode: string | null; note: string | null; started: boolean } | null;
  /** After the class ends the answer is read-only: the teacher already acted on it. */
  locked?: boolean;
  onSubmit: (payload: PreworkReasonPayload) => void;
  submitting?: boolean;
  error?: string | null;
}

/**
 * The one place a student says why the pre-class work is not done.
 *
 * Structurally a copy of RsvpReasonDialog, on purpose: a student who has used
 * the "I cannot make it" sheet already knows how this one works, and both are
 * one-thumb operations on a phone.
 *
 * What it is NOT is a gate. Sending a reason unlocks nothing and skipping it
 * blocks nothing, the Join button is untouched either way. The teacher's own
 * framing was that most students will give a reason rather than do the work, and
 * that a reason before the class is still worth far more than silence.
 */
export default function PreworkReasonDialog({
  open,
  onClose,
  assignmentTitle,
  contextLine,
  existing,
  locked,
  onSubmit,
  submitting,
  error,
}: PreworkReasonDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [reasonCode, setReasonCode] = useState<PreworkReasonCode>('no_time');
  const [note, setNote] = useState('');
  const [started, setStarted] = useState(false);
  const [touched, setTouched] = useState(false);

  // Reset per opening. Prefills from an existing answer so "change my answer"
  // starts where the student left off, never blank.
  useEffect(() => {
    if (!open) return;
    const code = PREWORK_REASONS.find((r) => r.code === existing?.reasonCode)?.code;
    setReasonCode(code ?? 'no_time');
    setNote(existing?.note ?? '');
    setStarted(existing?.started ?? false);
    setTouched(false);
  }, [open, existing]);

  const needsNote = preworkReasonRequiresNote(reasonCode);
  const noteMissing = needsNote && !note.trim();
  const canSubmit = !noteMissing && !submitting && !locked;
  const isEditing = !!existing?.reasonCode;

  const handleSubmit = () => {
    setTouched(true);
    if (!canSubmit) return;
    onSubmit({ reasonCode, note: note.trim(), started });
  };

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
          Pre-class work
        </Typography>
        <Typography sx={{ fontWeight: 800, fontSize: '1.1875rem', lineHeight: 1.25, mt: 0.25 }}>
          {locked ? 'Your answer' : 'Not done yet?'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {assignmentTitle}
          {contextLine ? `, ${contextLine}` : ''}
        </Typography>
      </Box>

      <Box sx={{ p: 2.5, pt: 2, display: 'flex', flexDirection: 'column' }}>
        {locked ? (
          <Typography variant="body2" color="text.secondary">
            Locked after the class. You told us: {preworkReasonShortLabel(existing?.reasonCode)}.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Tell your teacher why before the class starts. You can still finish it, and you can
              still join the class either way.
            </Typography>

            {/* 52px rows, radio semantics for screen readers. Tapping the row, not
                a small circle, is the target: this is a phone-first sheet. */}
            <Box role="radiogroup" aria-label="Why is the work not done" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {PREWORK_REASONS.map((r) => {
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
                      minHeight: 52,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      px: 1.5,
                      borderRadius: RADIUS.control,
                      cursor: 'pointer',
                      border: '1px solid',
                      borderColor: selected ? 'primary.main' : 'divider',
                      bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                      transition: 'background-color .2s, border-color .2s',
                      '&:hover': { borderColor: 'primary.light' },
                    }}
                  >
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: '2px solid',
                        borderColor: selected ? 'primary.main' : 'text.disabled',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {selected && (
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main' }} />
                      )}
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>
                      {r.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>

            {needsNote && (
              <TextField
                label="What happened?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                fullWidth
                multiline
                minRows={2}
                error={touched && noteMissing}
                helperText={
                  touched && noteMissing
                    ? 'Add a short note so your teacher knows.'
                    : 'Add a short note so your teacher knows.'
                }
                sx={{ mt: 1.5 }}
              />
            )}

            {/* The state the teacher specifically asked to be able to see: the
                student who is genuinely working, just slower. */}
            <Box
              component="label"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, cursor: 'pointer' }}
            >
              <Checkbox checked={started} onChange={(e) => setStarted(e.target.checked)} sx={{ p: 1 }} />
              <Typography variant="body2">I have started it, I just need more time</Typography>
            </Box>

            {error && (
              <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                {error}
              </Typography>
            )}
          </>
        )}
      </Box>

      <Divider />

      {/* "I will do it now" is the quiet first action: the outcome we actually
          want is the work getting done, not the form getting filled in. */}
      <Box sx={{ p: 2, display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
        <Button
          onClick={onClose}
          disabled={submitting}
          sx={{ textTransform: 'none', minHeight: 48, borderRadius: RADIUS.control, fontWeight: 600 }}
        >
          {locked ? 'Close' : isEditing ? 'Keep it' : 'I will do it now'}
        </Button>
        {!locked && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!canSubmit}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 48, borderRadius: RADIUS.control, fontWeight: 700 }}
          >
            {submitting ? 'Sending...' : isEditing ? 'Update my reason' : 'Send my reason'}
          </Button>
        )}
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
