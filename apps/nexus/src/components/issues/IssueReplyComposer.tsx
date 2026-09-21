'use client';

/**
 * The box you answer a ticket in.
 *
 * Shared by both sides, because the thing a student types and the thing a
 * teacher types are the same thing: a message on a ticket. The staff extra is
 * the internal-note switch, which is absent for a student rather than disabled,
 * since a control that refuses is a dead end.
 *
 * 16px input text, deliberately: anything smaller makes iOS Safari zoom the
 * page on focus and the student then has to pinch back out to read their own
 * reply.
 */

import React, { useState } from 'react';
import { Box, CircularProgress, FormControlLabel, IconButton, Switch, TextField, Typography } from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';

export interface IssueReplyComposerProps {
  /** Resolves when the message is sent. Throwing leaves the draft in the box. */
  onSend: (text: string, internal: boolean) => Promise<void>;
  placeholder?: string;
  /** Staff only: offer the internal-note switch. */
  allowInternal?: boolean;
  disabled?: boolean;
  /** One line under the box, for "your teacher will be told" style reassurance. */
  helperText?: string;
}

export default function IssueReplyComposer({
  onSend,
  placeholder = 'Write a reply...',
  allowInternal = false,
  disabled = false,
  helperText,
}: IssueReplyComposerProps) {
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);

  const canSend = text.trim().length > 0 && !sending && !disabled;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(text.trim(), internal);
      // Cleared only on success. A failed send that also ate the message is the
      // one thing a support box must never do.
      setText('');
      setInternal(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <TextField
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          fullWidth
          multiline
          maxRows={5}
          disabled={disabled || sending}
          inputProps={{ 'aria-label': placeholder }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line. Only on a pointer-sized
            // screen: on a phone the Enter key is the newline key and hijacking
            // it sends half-written messages.
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
              e.preventDefault();
              void send();
            }
          }}
          sx={{
            '& .MuiInputBase-root': { borderRadius: 2, py: 1 },
            '& .MuiInputBase-input': { fontSize: 16, lineHeight: 1.5 },
          }}
        />
        <IconButton
          color="primary"
          onClick={() => void send()}
          disabled={!canSend}
          aria-label={sending ? 'Sending reply' : 'Send reply'}
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            border: 1,
            borderColor: canSend ? 'primary.main' : 'divider',
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {sending ? <CircularProgress size={20} /> : <SendIcon fontSize="small" />}
        </IconButton>
      </Box>

      {allowInternal && (
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={internal}
              onChange={(e) => setInternal(e.target.checked)}
              disabled={sending}
            />
          }
          label={
            <Typography variant="caption" sx={{ color: internal ? 'warning.dark' : 'text.secondary' }}>
              {internal
                ? 'Internal note. The student will not see this and gets no message.'
                : 'Internal note (staff only)'}
            </Typography>
          }
          sx={{ mt: 0.5, ml: 0, minHeight: 44, alignItems: 'center' }}
        />
      )}

      {helperText && !internal && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
