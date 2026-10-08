'use client';

import { useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Box, IconButton, InputBase, alpha, useTheme } from '@neram/ui';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import { parseMathAnswer } from '@neram/database';
import MathAnswerPreview from '@/components/common/MathAnswerPreview';
import { focusRing } from '@/components/assistant/focusRing';

interface TutorComposerProps {
  /** The open check wants a number: decimal keypad, and the "Reads as" line. */
  numberMode: boolean;
  disabled: boolean;
  onSend: (text: string) => void;
}

/**
 * Type an answer or a question, in one rounded box that grows to five lines
 * with the send button inside it. 16px so iOS does not zoom. Enter sends and
 * Shift+Enter starts a new line (a phone's keyboard shows "send"). Text stays
 * in the box while a turn is in flight and clears once it is sent.
 */
export default function TutorComposer({ numberMode, disabled, onSend }: TutorComposerProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const parses = useMemo(() => numberMode && !!trimmed && !!parseMathAnswer(trimmed), [numberMode, trimmed]);
  const canSend = !!trimmed && !disabled;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    onSend(trimmed);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Not mid-composition (an IME's Enter picks a word).
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <Box component="form" onSubmit={submit}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          pl: 2,
          pr: 0.75,
          py: 0.75,
          borderRadius: '26px',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          boxShadow: `0 1px 2px ${alpha(theme.palette.common.black, 0.06)}`,
          transition: 'border-color 150ms, box-shadow 150ms',
          '&:focus-within': {
            borderColor: 'primary.main',
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.16)}`,
          },
        }}
      >
        <InputBase
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          onKeyDown={onKeyDown}
          placeholder={numberMode ? 'Type a number' : 'Type your answer, or ask why'}
          multiline
          maxRows={5}
          fullWidth
          autoComplete="off"
          inputProps={{
            'aria-label': numberMode ? 'Your answer' : 'Message the tutor',
            inputMode: numberMode ? 'decimal' : 'text',
            enterKeyHint: 'send',
            maxLength: 500,
            'data-testid': 'tutor-composer',
          }}
          // The theme pads inputs 14px top and bottom; one line here sits level with the send button.
          sx={{ flex: 1, minWidth: 0, py: 1.25, fontSize: 16, lineHeight: 1.5, '& textarea': { fontSize: 16, lineHeight: 1.5, p: 0 } }}
        />
        <IconButton
          type="submit"
          aria-label="Send"
          disabled={!canSend}
          sx={{
            width: 44,
            height: 44,
            flexShrink: 0,
            bgcolor: canSend ? 'primary.main' : 'action.disabledBackground',
            color: canSend ? 'primary.contrastText' : 'text.disabled',
            transition: 'background-color 150ms',
            '@media (hover: hover)': { '&:hover': { bgcolor: canSend ? 'primary.dark' : 'action.disabledBackground' } },
            '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'text.disabled' },
            '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
          }}
        >
          <ArrowUpwardRoundedIcon />
        </IconButton>
      </Box>
      {parses && (
        <Box sx={{ px: 2, pt: 0.5 }}>
          <MathAnswerPreview value={trimmed} compact />
        </Box>
      )}
    </Box>
  );
}
