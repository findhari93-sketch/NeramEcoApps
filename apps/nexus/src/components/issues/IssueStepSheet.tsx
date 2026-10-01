'use client';

/**
 * The three ticket steps that need words from staff: Mark resolved, Close now,
 * and Ask student.
 *
 * Each one says, before it is sent, exactly what the student will get and what
 * happens if they never answer. A support step whose consequences you only learn
 * afterwards is one people stop trusting.
 *
 * A bottom sheet on a phone and a small dialog from 600px up (ResponsiveSheet),
 * so a teacher answering from the bus does it with a thumb. The draft survives a
 * failed send: onSubmit throws, and the sheet stays open with the text in it.
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, TextField, Typography, alpha } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import {
  CONFIRM_DAYS,
  STAFF_OUTCOMES,
  STUDENT_REOPEN_DAYS,
  WAITING_DAYS,
} from '@/lib/issue-status';
import {
  defaultNote,
  mayReplaceNote,
  quickReplies,
  readLastNote,
  saveLastNote,
} from '@/lib/issue-reply-templates';
import type { FoundationIssueResolutionCode } from '@neram/database/types';

export type IssueStepMode = 'resolve' | 'close' | 'ask';

export interface IssueStepSheetProps {
  open: boolean;
  mode: IssueStepMode;
  /** The reporter's first name, so the consequence line reads as a person. */
  studentFirstName: string;
  onClose: () => void;
  /** Resolves when sent. Throw to keep the sheet open with the draft. */
  onSubmit: (input: { code: FoundationIssueResolutionCode | null; note: string }) => Promise<void>;
}

/** One tap fills a common question; the teacher can still edit it. */
const ASK_TEMPLATES = [
  'Could you send a screenshot of what you see?',
  'Could you refresh the page and try once more?',
  'Which device and browser are you using?',
];

const COPY: Record<IssueStepMode, { title: string; submit: string; noteLabel: string }> = {
  resolve: { title: 'Mark as resolved', submit: 'Mark resolved', noteLabel: 'Note to the student' },
  close: { title: 'Close this ticket', submit: 'Close ticket', noteLabel: 'Note to the student' },
  ask: { title: 'Ask the student', submit: 'Send question', noteLabel: 'Your question' },
};

export default function IssueStepSheet({ open, mode, studentFirstName, onClose, onSubmit }: IssueStepSheetProps) {
  const [code, setCode] = useState<FoundationIssueResolutionCode | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupLabelId = useId();
  // What we last put in the box ourselves, so picking another outcome swaps the
  // template but never throws away words the teacher typed.
  const autoFill = useRef('');

  const fillFor = (next: FoundationIssueResolutionCode | null) => {
    if (mode === 'ask') return '';
    return defaultNote(mode, next, readLastNote(mode, next));
  };

  // A fresh sheet every time it opens. Resolve suggests "Fixed", the common
  // case, with its note already written; Close suggests nothing, because
  // closing without asking is a choice.
  useEffect(() => {
    if (!open) return;
    const initial: FoundationIssueResolutionCode | null = mode === 'resolve' ? 'fixed' : null;
    const text = fillFor(initial);
    autoFill.current = text;
    setCode(initial);
    setNote(text);
    setError(null);
    setSending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const pickOutcome = (next: FoundationIssueResolutionCode) => {
    setCode(next);
    if (mayReplaceNote(note, autoFill.current)) {
      const text = fillFor(next);
      autoFill.current = text;
      setNote(text);
    }
  };

  const replies = mode === 'ask' ? [] : quickReplies(mode, code, readLastNote(mode, code));

  const needsOutcome = mode !== 'ask';
  const canSubmit = note.trim().length > 0 && (!needsOutcome || code !== null) && !sending;
  const hint = STAFF_OUTCOMES.find((o) => o.code === code)?.hint;
  const name = studentFirstName || 'The student';

  const consequence =
    mode === 'resolve'
      ? `${name} will be asked to confirm it works. If there is no answer, the ticket closes on its own in ${CONFIRM_DAYS} days.`
      : mode === 'close'
        ? `${name} will not be asked to confirm. They can still reopen it for ${STUDENT_REOPEN_DAYS} days.`
        : `${name} gets this in your Teams chat with them and as a Nexus alert, and the ticket waits for their reply. If there is none, it closes on its own in ${WAITING_DAYS} days.`;

  const submit = async () => {
    if (!canSubmit) return;
    setSending(true);
    setError(null);
    try {
      await onSubmit({ code: needsOutcome ? code : null, note: note.trim() });
      if (mode !== 'ask') saveLastNote(mode, code, note);
    } catch {
      setError('That did not go through. Your text is still here, so try again.');
      setSending(false);
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title={COPY[mode].title}
      disableClose={sending}
      actions={
        <>
          <Button onClick={onClose} disabled={sending} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={mode === 'ask' ? 'primary' : 'success'}
            onClick={submit}
            disabled={!canSubmit}
            startIcon={sending ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {sending ? 'Sending...' : COPY[mode].submit}
          </Button>
        </>
      }
    >
      {needsOutcome && (
        <Box sx={{ mb: 2 }}>
          <Typography id={groupLabelId} variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Outcome
          </Typography>
          <Box role="radiogroup" aria-labelledby={groupLabelId} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {STAFF_OUTCOMES.map((o) => {
              const selected = code === o.code;
              return (
                <Chip
                  key={o.code}
                  role="radio"
                  aria-checked={selected}
                  label={o.label}
                  clickable
                  onClick={() => pickOutcome(o.code)}
                  icon={selected ? <CheckIcon /> : undefined}
                  variant="outlined"
                  // Styled explicitly: the theme's filled chip is a pale grey that
                  // reads as unselected, and the choice must be unmistakable.
                  sx={{
                    height: 44,
                    fontSize: '0.875rem',
                    fontWeight: selected ? 700 : 500,
                    px: 0.5,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? 'primary.main' : 'divider',
                    color: selected ? 'primary.main' : 'text.primary',
                    bgcolor: (t) => (selected ? alpha(t.palette.primary.main, 0.1) : 'transparent'),
                    '& .MuiChip-icon': { color: 'primary.main' },
                  }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {mode === 'ask' && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          {ASK_TEMPLATES.map((t) => (
            <Chip
              key={t}
              label={t}
              clickable
              variant="outlined"
              onClick={() => setNote(t)}
              sx={{
                height: 'auto',
                minHeight: 44,
                maxWidth: '100%',
                '& .MuiChip-label': { whiteSpace: 'normal', py: 0.75, lineHeight: 1.35 },
              }}
            />
          ))}
        </Box>
      )}

      <TextField
        label={COPY[mode].noteLabel}
        placeholder={mode === 'ask' ? 'What do you need from them?' : undefined}
        helperText={needsOutcome && hint ? hint : ' '}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        required
        fullWidth
        multiline
        minRows={3}
        autoFocus
        // 16px, or iOS Safari zooms the page on focus.
        inputProps={{ style: { fontSize: 16 } }}
      />

      {replies.length > 0 && (
        <Box sx={{ mt: 0.5, mb: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
            Quick replies
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {replies.map((r) => {
              const inUse = note === r.text;
              return (
                <Chip
                  key={r.text}
                  label={r.mine ? `Your last note: ${r.text}` : r.text}
                  clickable
                  variant="outlined"
                  aria-pressed={inUse}
                  onClick={() => {
                    autoFill.current = r.text;
                    setNote(r.text);
                  }}
                  sx={{
                    height: 'auto',
                    minHeight: 44,
                    maxWidth: '100%',
                    justifyContent: 'flex-start',
                    borderColor: inUse ? 'primary.main' : 'divider',
                    bgcolor: (t) => (inUse ? alpha(t.palette.primary.main, 0.06) : 'transparent'),
                    '& .MuiChip-label': { whiteSpace: 'normal', py: 0.75, lineHeight: 1.4, textAlign: 'left' },
                  }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, lineHeight: 1.5 }}>
        {consequence}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </ResponsiveSheet>
  );
}
