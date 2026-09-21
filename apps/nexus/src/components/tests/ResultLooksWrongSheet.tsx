'use client';

/**
 * "Something looks wrong with my result."
 *
 * WHY THIS EXISTS. Publishing a result used to be the end of the conversation:
 * a Teams message with a number in it and nowhere to reply. The founder asked
 * what happens when a student disagrees, and named the two disputes they
 * expected. Both are real, and both are answerable from data the app already
 * holds, so pressing send here tells the class teacher immediately AND carries
 * the working with it: which attempt was counted, the arithmetic behind the
 * percentage, the sitting the rank was taken in, and every other attempt the
 * student has on the paper.
 *
 * Built on the same bones as TellTeacherWhySheet, deliberately: a bottom sheet
 * on a phone and a small dialog from 600px up (ResponsiveSheet), answers as
 * full-width 48px rows, a note asked for only where the answer is useless
 * without one. A student who has met one of these has met both.
 *
 * NO DISABLED SEND. Pressing Send with nothing chosen says what is missing next
 * to the thing that is missing and moves focus there, rather than greying out a
 * button that silently refuses.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Radio, RadioGroup, TextField, Typography } from '@neram/ui';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import {
  RESULT_QUERY_REASONS,
  resultQueryRequiresNote,
  type ResultQueryReason,
} from '@/lib/exam-result-explain';

const MAX_NOTE = 1000;

export interface ResultQuerySent {
  issueId: string;
  ticketNumber: string | null;
  alreadyOpen: boolean;
}

export default function ResultLooksWrongSheet({
  open,
  examTitle,
  onClose,
  submit,
}: {
  open: boolean;
  examTitle: string;
  onClose: () => void;
  /** Posts to /api/student/exams/[examId]/query. */
  submit: (input: { reason_code: ResultQueryReason; note: string }) => Promise<ResultQuerySent>;
}) {
  const headingId = useId();
  const choiceErrorId = useId();
  const [code, setCode] = useState<ResultQueryReason | null>(null);
  const [note, setNote] = useState('');
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sent, setSent] = useState<ResultQuerySent | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const firstRadioRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setCode(null);
    setNote('');
    setChoiceError(null);
    setNoteError(null);
    setSendError(null);
    setSent(null);
  }, [open]);

  const needsNote = resultQueryRequiresNote(code);

  const close = () => {
    if (busyRef.current) return;
    onClose();
  };

  const send = async () => {
    if (busyRef.current) return;
    if (!code) {
      setChoiceError('Pick what looks wrong, so your teacher knows where to look.');
      firstRadioRef.current?.focus();
      return;
    }
    if (needsNote && note.trim().length === 0) {
      setNoteError(
        code === 'question_marked_wrong'
          ? 'Say which question, and what you think the right answer is.'
          : 'A sentence is enough, so your teacher knows what to check.',
      );
      noteRef.current?.focus();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setSendError(null);
    try {
      setSent(await submit({ reason_code: code, note: note.trim() }));
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
      open={open}
      onClose={close}
      disableClose={busy}
      maxWidth="xs"
      title={sent ? 'Your teacher knows' : 'Something looks wrong'}
      description={
        sent
          ? undefined
          : `${examTitle}. Your teacher gets this straight away, with the working behind your result attached, so they can check it without asking you for anything.`
      }
      actions={
        sent ? (
          <Button variant="contained" onClick={close} sx={{ textTransform: 'none', minHeight: 48 }}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={close} sx={{ textTransform: 'none', minHeight: 48 }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={send}
              aria-busy={busy}
              data-testid="result-query-send"
              sx={{ textTransform: 'none', minHeight: 48 }}
            >
              {busy ? 'Sending' : 'Send to my teacher'}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <Alert severity="success" sx={{ '& .MuiAlert-message': { width: '100%' } }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {sent.alreadyOpen ? 'You have already asked about this one.' : 'Sent to your teacher.'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {sent.alreadyOpen
              ? 'They still have it open, so there is nothing more to do. They will come back to you.'
              : 'They can see exactly how your result was worked out. You can follow it under My Issues.'}
          </Typography>
          {sent.ticketNumber && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Reference {sent.ticketNumber}
            </Typography>
          )}
        </Alert>
      ) : (
        <>
          <Typography id={headingId} variant="body2" sx={{ fontWeight: 700, mb: 1 }}>
            What looks wrong?
          </Typography>

          <RadioGroup
            aria-labelledby={headingId}
            aria-describedby={choiceError ? choiceErrorId : undefined}
            value={code ?? ''}
            onChange={(e) => {
              setCode(e.target.value as ResultQueryReason);
              setChoiceError(null);
              setNoteError(null);
            }}
            sx={{ gap: 1 }}
          >
            {RESULT_QUERY_REASONS.map((r, i) => {
              const selected = code === r.code;
              return (
                <FormControlLabel
                  key={r.code}
                  value={r.code}
                  control={
                    <Radio
                      inputRef={i === 0 ? firstRadioRef : undefined}
                      inputProps={{ 'data-testid': `result-query-${r.code}` } as never}
                      // A visible ring for a keyboard, on top of MUI's ripple.
                      sx={{ '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -4 } }}
                    />
                  }
                  label={r.label}
                  sx={{
                    m: 0,
                    // A full-width row a thumb cannot miss, not a 20px circle.
                    minHeight: 48,
                    pr: 1.5,
                    borderRadius: 2,
                    border: 1,
                    borderColor: selected ? 'primary.main' : 'divider',
                    bgcolor: selected ? 'action.selected' : 'background.paper',
                    '& .MuiFormControlLabel-label': {
                      fontSize: '1rem',
                      fontWeight: selected ? 600 : 400,
                      lineHeight: 1.4,
                      py: 1,
                      // A long answer wraps rather than widening the sheet.
                      overflowWrap: 'anywhere',
                    },
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
              label={needsNote ? 'Say a bit more' : 'Anything to add? (optional)'}
              required={needsNote}
              value={note}
              onChange={(e) => {
                setNote(e.target.value.slice(0, MAX_NOTE));
                if (noteError && e.target.value.trim()) setNoteError(null);
              }}
              error={Boolean(noteError)}
              helperText={noteError || `${note.length} of ${MAX_NOTE}`}
              FormHelperTextProps={noteError ? ({ role: 'alert' } as never) : undefined}
            />
          )}

          {sendError && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="error" role="alert">
                {sendError}
              </Alert>
            </Box>
          )}
        </>
      )}
    </ResponsiveSheet>
  );
}
