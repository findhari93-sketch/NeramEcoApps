'use client';

/**
 * "Something looks wrong with this question."
 *
 * The one escape hatch in a checkpoint the student cannot close. Two things
 * happen when they send it: the teacher gets told, and the question comes out
 * of the paper in front of them, so a wrong answer key stops being a gate that
 * can never be passed.
 *
 * Deliberately a short list of reasons rather than a free-text box. A teacher
 * fixing this has to know what to change, and "wrong answer" versus "never
 * taught" are different fixes. The note is optional and stays optional: a
 * student stuck at a checkpoint at ten at night will not write an essay, and
 * requiring one would just mean nobody reports anything.
 *
 * Rendered as a bottom sheet on a phone and a centred dialog above that, which
 * is the house pattern for a decision taken on top of something else.
 */
import { useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  Drawer,
  Stack,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';

export type ReportReason =
  | 'wrong_answer'
  | 'no_correct_option'
  | 'unclear_question'
  | 'not_taught'
  | 'other';

const REASONS: Array<{ value: ReportReason; label: string; hint: string }> = [
  {
    value: 'wrong_answer',
    label: 'The marked answer is wrong',
    hint: 'One of the other options is the right one',
  },
  {
    value: 'no_correct_option',
    label: 'None of the options is right',
    hint: 'The correct answer is not among the four',
  },
  {
    value: 'unclear_question',
    label: 'I cannot tell what is being asked',
    hint: 'The wording does not make sense',
  },
  {
    value: 'not_taught',
    label: 'This was not taught in the class',
    hint: 'The recording does not cover it',
  },
  { value: 'other', label: 'Something else', hint: 'Tell us below' },
];

interface Props {
  open: boolean;
  questionText: string;
  onClose: () => void;
  onSubmit: (reason: ReportReason, note: string) => Promise<void>;
}

export default function ReportQuestionSheet({ open, questionText, onClose, onSubmit }: Props) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason(null);
    setNote('');
    setError(null);
    onClose();
  };

  const send = async () => {
    if (!reason) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit(reason, note.trim());
      setReason(null);
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that. Try once more.');
    } finally {
      setSending(false);
    }
  };

  const body = (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 520 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '1.05rem' }}>
        What is wrong with it?
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: 'text.secondary',
          mb: 2,
          p: 1.25,
          borderRadius: 1.5,
          bgcolor: alpha(theme.palette.text.primary, 0.04),
        }}
      >
        {questionText}
      </Typography>

      <Stack spacing={1} sx={{ mb: 2 }}>
        {REASONS.map((r) => {
          const selected = reason === r.value;
          return (
            <Box
              key={r.value}
              component="button"
              type="button"
              aria-pressed={selected}
              onClick={() => setReason(r.value)}
              sx={{
                textAlign: 'left',
                width: '100%',
                minHeight: 48,
                px: 1.75,
                py: 1.25,
                cursor: 'pointer',
                borderRadius: 1.5,
                font: 'inherit',
                color: 'inherit',
                bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                border: `1px solid ${
                  selected
                    ? theme.palette.primary.main
                    : alpha(theme.palette.text.primary, 0.15)
                }`,
                transition: theme.transitions.create(['background-color', 'border-color'], {
                  duration: 180,
                }),
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Typography
                variant="body2"
                sx={{ fontWeight: selected ? 700 : 600, lineHeight: 1.35 }}
              >
                {r.label}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {r.hint}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      <TextField
        fullWidth
        multiline
        minRows={2}
        size="small"
        label="Anything else? (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        sx={{ mb: 2 }}
      />

      {error && (
        <Typography variant="caption" sx={{ color: 'error.main', display: 'block', mb: 1.5 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={close} disabled={sending} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={send}
          disabled={!reason || sending}
          sx={{ minHeight: 44 }}
        >
          {sending ? 'Sending' : 'Send and skip it'}
        </Button>
      </Stack>

      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', display: 'block', mt: 1.5, lineHeight: 1.5 }}
      >
        Your teacher will see this. The question will not be counted against you.
      </Typography>
    </Box>
  );

  if (isPhone) {
    return (
      <Drawer
        anchor="bottom"
        open={open}
        onClose={close}
        PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
      >
        {body}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="sm">
      {body}
    </Dialog>
  );
}
