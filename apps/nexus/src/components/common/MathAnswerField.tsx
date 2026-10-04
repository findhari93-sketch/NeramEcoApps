'use client';

import { useRef, useState } from 'react';
import { Box, IconButton, InputAdornment, TextField, Tooltip } from '@neram/ui';
import FunctionsIcon from '@mui/icons-material/Functions';
import MathKeypad from './MathKeypad';
import MathAnswerPreview from './MathAnswerPreview';

interface MathAnswerFieldProps {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
  placeholder?: string;
  /** Hide the "Reads as" line, for a dense grid row that shows it elsewhere. */
  hidePreview?: boolean;
  /** Start with the maths keys open. */
  keypadOpen?: boolean;
  sx?: Record<string, unknown>;
}

/**
 * The answer key for a numerical question.
 *
 * It accepts what a student can type: `3/4`, `2√3`, `π/2`, and also LaTeX a
 * teacher pastes from the question (`\frac{3}{4}`). Grading compares values,
 * so `0.75` typed by a student matches a key of `3/4`. The preview underneath
 * shows how the key will be read, and says plainly when it will be compared as
 * text instead (a ratio like `2:3`), which is allowed but must be typed exactly.
 */
export default function MathAnswerField({
  label = 'Correct Answer',
  value,
  onChange,
  disabled,
  size = 'small',
  placeholder = 'e.g. 12, 0.75, 3/4, 2√3',
  hidePreview = false,
  keypadOpen = false,
  sx,
}: MathAnswerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showKeys, setShowKeys] = useState(keypadOpen);

  return (
    <Box sx={sx}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        size={size}
        fullWidth
        placeholder={placeholder}
        autoComplete="off"
        inputRef={inputRef}
        inputProps={{ inputMode: 'decimal', spellCheck: false }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title={showKeys ? 'Hide maths keys' : 'Fraction, root and π keys'} arrow>
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={showKeys ? 'Hide maths keys' : 'Show maths keys'}
                  aria-pressed={showKeys}
                  onClick={() => setShowKeys((v) => !v)}
                  disabled={disabled}
                  sx={{ minWidth: 40, minHeight: 40 }}
                >
                  <FunctionsIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        }}
      />
      {showKeys && <MathKeypad inputRef={inputRef} value={value} onChange={onChange} disabled={disabled} dense />}
      {!hidePreview && <MathAnswerPreview value={value} audience="teacher" />}
    </Box>
  );
}
