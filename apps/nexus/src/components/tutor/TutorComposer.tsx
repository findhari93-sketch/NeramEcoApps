'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Box, IconButton, TextField, useTheme } from '@neram/ui';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
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
 * Type an answer or a question. 16px so iOS does not zoom; Enter sends.
 * Text stays in the box while a turn is in flight and clears once it is sent.
 */
export default function TutorComposer({ numberMode, disabled, onSend }: TutorComposerProps) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const parses = useMemo(() => numberMode && !!trimmed && !!parseMathAnswer(trimmed), [numberMode, trimmed]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <Box component="form" onSubmit={submit} sx={{ px: 2, pt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
        <TextField
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 500))}
          placeholder={numberMode ? 'Type your answer' : 'Ask, or type an answer'}
          fullWidth
          size="small"
          autoComplete="off"
          inputProps={{
            'aria-label': numberMode ? 'Your answer' : 'Message the tutor',
            inputMode: numberMode ? 'decimal' : 'text',
            enterKeyHint: 'send',
            maxLength: 500,
            'data-testid': 'tutor-composer',
          }}
          sx={{ '& .MuiInputBase-root': { minHeight: 48, borderRadius: 3 }, '& input': { fontSize: 16 } }}
        />
        <IconButton
          type="submit"
          aria-label="Send"
          disabled={disabled || !trimmed}
          color="primary"
          sx={{
            width: 48,
            height: 48,
            flexShrink: 0,
            bgcolor: trimmed && !disabled ? 'primary.main' : 'action.disabledBackground',
            color: trimmed && !disabled ? 'primary.contrastText' : 'text.disabled',
            '@media (hover: hover)': { '&:hover': { bgcolor: 'primary.dark' } },
            '&.Mui-focusVisible': focusRing(theme.palette.primary.dark),
          }}
        >
          <SendRoundedIcon />
        </IconButton>
      </Box>
      {parses && <MathAnswerPreview value={trimmed} compact />}
    </Box>
  );
}
