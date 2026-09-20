'use client';

/**
 * "Tell your teacher why", for a test the student owed and did not sit.
 *
 * WHY THIS EXISTS. Twenty students did not sit the 18 Aug exam. The founder's
 * question was simply "why", and the only way to ask was a Teams message asking
 * them to reply in chat, which nothing in Nexus ever read back. The answer now
 * lands on the teacher's Students tab, on the student's own row.
 *
 * A bottom sheet on a phone, a small dialog from 600px up (ResponsiveSheet).
 * Six answers as full-width 48px rows, the likeliest first. A note is asked for
 * only where the answer is useless without one (a broken test, something else).
 *
 * NO DISABLED SEND. Pressing Send with nothing chosen, or without the note a
 * reason needs, says what is missing next to the thing that is missing and moves
 * focus there. A greyed button that silently refuses is the dead end this app
 * has spent a release removing from the test card.
 *
 * A REASON IS NOT AN EXCUSE. It moves no deadline and opens no door (see
 * api/student/tests/reasons), so the sheet says so, and points at "Ask my
 * teacher" for another sitting.
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@neram/ui';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import { MISSED_TEST_REASONS, testReasonRequiresNote, type TestReasonCode } from '@/lib/test-reasons';
import { TELL_WHY_LINK_LABEL } from '@/lib/test-message-templates';
import type { StudentTest } from './StudentTestCard';

const MAX_NOTE = 500;

export interface GivenReason {
  reason_code: string;
  reason_note: string | null;
  updated_at: string | null;
}

export default function TellTeacherWhySheet({
  test,
  onClose,
  submit,
  onSent,
}: {
  /** The test being explained. Null closes the sheet. */
  test: StudentTest | null;
  onClose: () => void;
  /** Posts to /api/student/tests/reasons and returns what was stored. */
  submit: (input: {
    test_id: string;
    placement_id: string | null;
    reason_code: TestReasonCode;
    reason_note: string;
  }) => Promise<GivenReason>;
  onSent: (test: StudentTest, reason: GivenReason) => void;
}) {
  const headingId = useId();
  const choiceErrorId = useId();
  const [code, setCode] = useState<TestReasonCode | null>(null);
  const [note, setNote] = useState('');
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const firstRadioRef = useRef<HTMLInputElement | null>(null);

  // Opening on "Change" starts from what they said last time.
  useEffect(() => {
    if (!test) return;
    const given = test.skip_reason?.reason_code;
    setCode((MISSED_TEST_REASONS.some((r) => r.code === given) ? given : null) as TestReasonCode | null);
    setNote(test.skip_reason?.reason_note ?? '');
    setChoiceError(null);
    setNoteError(null);
    setSendError(null);
  }, [test]);

  const needsNote = testReasonRequiresNote(code);

  const close = () => {
    if (busyRef.current) return;
    onClose();
  };

  const send = async () => {
    if (!test || busyRef.current) return;
    if (!code) {
      setChoiceError('Pick the answer closest to what happened.');
      firstRadioRef.current?.focus();
      return;
    }
    if (needsNote && note.trim().length === 0) {
      setNoteError(
        code === 'technical_problem'
          ? 'Say what went wrong, for example "Submit kept spinning". Your teacher needs it to fix the test.'
          : 'A sentence is enough, so your teacher knows what happened.',
      );
      noteRef.current?.focus();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setSendError(null);
    try {
      const reason = await submit({
        test_id: test.id,
        placement_id: test.placement_id,
        reason_code: code,
        reason_note: note.trim(),
      });
      onSent(test, reason);
    } catch (err) {
      // The sheet stays open, so what they chose and typed survives a retry.
      setSendError(err instanceof Error ? err.message : 'That did not send. Check your connection and try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <ResponsiveSheet
      open={Boolean(test)}
      onClose={close}
      disableClose={busy}
      maxWidth="xs"
      title={TELL_WHY_LINK_LABEL}
      description={
        test
          ? `${test.title}. Your teacher sees your answer beside your name. It does not reopen the test: for another sitting, use Ask my teacher.`
          : undefined
      }
      actions={
        <>
          <Button onClick={close} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={send}
            aria-busy={busy}
            data-testid="why-send"
            sx={{ textTransform: 'none' }}
          >
            {busy ? 'Sending' : 'Send'}
          </Button>
        </>
      }
    >
      <Typography id={headingId} variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
        Why did you not sit it?
      </Typography>

      <RadioGroup
        aria-labelledby={headingId}
        aria-describedby={choiceError ? choiceErrorId : undefined}
        value={code ?? ''}
        onChange={(e) => {
          setCode(e.target.value as TestReasonCode);
          setChoiceError(null);
          setNoteError(null);
        }}
        sx={{ gap: 1 }}
      >
        {MISSED_TEST_REASONS.map((r, i) => {
          const selected = code === r.code;
          return (
            <FormControlLabel
              key={r.code}
              value={r.code}
              control={
                <Radio
                  inputRef={i === 0 ? firstRadioRef : undefined}
                  inputProps={{ 'data-testid': `why-option-${r.code}` } as never}
                  // A visible ring for a keyboard, on top of MUI's focus ripple.
                  sx={{ '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -4 } }}
                />
              }
              label={r.missedLabel}
              sx={{
                m: 0,
                // A full-width row a thumb cannot miss, not a 20px circle.
                minHeight: 48,
                pr: 1.5,
                borderRadius: 2,
                border: 1,
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'action.selected' : 'background.paper',
                '& .MuiFormControlLabel-label': { fontSize: '1rem', fontWeight: selected ? 600 : 400, lineHeight: 1.4, py: 1 },
                '@media (prefers-reduced-motion: no-preference)': {
                  transition: 'border-color 150ms ease, background-color 150ms ease',
                },
              }}
            />
          );
        })}
      </RadioGroup>

      {choiceError && (
        <Typography id={choiceErrorId} role="alert" variant="body2" color="error" sx={{ mt: 1 }}>
          {choiceError}
        </Typography>
      )}

      {code && (
        <TextField
          fullWidth
          multiline
          minRows={2}
          sx={{ mt: 2 }}
          inputRef={noteRef}
          label={needsNote ? 'What happened?' : 'Anything to add? (optional)'}
          required={needsNote}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (noteError && e.target.value.trim()) setNoteError(null);
          }}
          inputProps={{ maxLength: MAX_NOTE, 'data-testid': 'why-note' }}
          InputProps={{ sx: { fontSize: '1rem' } }}
          error={Boolean(noteError)}
          helperText={noteError ?? (needsNote ? 'Your teacher needs this to act on it.' : ' ')}
          FormHelperTextProps={noteError ? { role: 'alert' } : undefined}
        />
      )}

      {sendError && (
        <Alert severity="error" role="alert" sx={{ mt: 2 }}>
          {sendError}
        </Alert>
      )}
    </ResponsiveSheet>
  );
}
