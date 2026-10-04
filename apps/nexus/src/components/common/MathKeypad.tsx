'use client';

import type { RefObject } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import BackspaceOutlinedIcon from '@mui/icons-material/BackspaceOutlined';
import { applyMathKey, MATH_KEYS, type MathKey } from '@/lib/math-keypad';

interface MathKeypadProps {
  /** The input the keys type into. Its cursor decides where each key lands. */
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Smaller keys for a teacher's dense answer-key grid. Students always get full size. */
  dense?: boolean;
}

/**
 * The keys a phone's decimal keyboard does not have: fraction, root, π,
 * power and brackets.
 *
 * Every key keeps the input focused (preventDefault on pointer down), so the
 * phone keyboard does not drop and come back on each tap, and the cursor stays
 * where the student left it.
 */
export default function MathKeypad({ inputRef, value, onChange, disabled, dense = false }: MathKeypadProps) {
  const press = (key: MathKey) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const edit = applyMathKey(value, start, end, key);
    if (edit.value === value && key !== 'backspace') return;
    onChange(edit.value);
    // After React has written the new value, put the cursor where the edit says.
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(edit.caret, edit.caret);
    });
  };

  const size = dense ? 40 : 48;

  return (
    <Box
      role="group"
      aria-label="Maths keys"
      sx={{
        display: 'grid',
        // Four to a row on a phone, all eight in one row from a small tablet up.
        gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(8, minmax(0, 1fr))' },
        gap: 1,
        mt: 1,
      }}
    >
      {MATH_KEYS.map((k) => (
        <Button
          key={k.key}
          type="button"
          variant="outlined"
          color="inherit"
          disableElevation
          aria-label={k.ariaLabel}
          disabled={disabled}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => press(k.key)}
          sx={{
            minHeight: size,
            minWidth: size,
            p: 0,
            textTransform: 'none',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            color: 'text.primary',
            cursor: 'pointer',
            transition: 'background-color 150ms ease, border-color 150ms ease',
            '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' },
            '&:active': { bgcolor: 'action.selected' },
            '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            '&.Mui-disabled': { opacity: 0.5 },
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
        >
          {k.key === 'backspace' ? (
            <BackspaceOutlinedIcon fontSize="small" aria-hidden />
          ) : (
            <Typography
              component="span"
              aria-hidden
              sx={{ fontSize: k.key === 'fraction' ? 15 : 19, fontWeight: 600, lineHeight: 1 }}
            >
              {k.label}
            </Typography>
          )}
        </Button>
      ))}
    </Box>
  );
}
