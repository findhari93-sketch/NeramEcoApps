'use client';

import { Box, TextField, Typography } from '@neram/ui';
import MathText from './MathText';

interface MathFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minRows?: number;
  disabled?: boolean;
  /** Preview even when the value contains no math. Default false. */
  previewWhenPlain?: boolean;
}

/** Does this string contain a `$...$` span worth typesetting? */
function hasMath(value: string): boolean {
  return /\$[^$]*[\\^_{}=+\-/][^$]*\$?/.test(value);
}

/**
 * A LaTeX source field with its typeset result underneath.
 *
 * The field stays a plain textarea holding raw LaTeX, because that is what gets
 * saved and because a WYSIWYG editor does not survive LaTeX round trips. The
 * preview is read-only and exists so a teacher can see `\frac{1}{12}` become a
 * fraction as they type, and can spot a broken formula without saving first.
 *
 * A plain-text field renders no preview at all: repeating "Plaster of Paris is
 * used for" underneath itself would be noise, and on a 92-question paper that
 * noise is most of the page.
 */
export default function MathField({
  label,
  value,
  onChange,
  placeholder,
  minRows = 2,
  disabled,
  previewWhenPlain = false,
}: MathFieldProps) {
  const showPreview = value.trim().length > 0 && (previewWhenPlain || hasMath(value));

  return (
    <Box sx={{ mb: 1 }}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        fullWidth
        multiline
        minRows={minRows}
        size="small"
        sx={{ '& .MuiInputBase-input': { fontSize: '0.875rem' } }}
      />
      {showPreview && (
        <Box
          data-testid="math-preview"
          sx={{
            mt: 0.5,
            px: 1,
            py: 0.5,
            borderLeft: '2px solid',
            borderColor: 'primary.light',
            bgcolor: 'action.hover',
            borderRadius: 0.5,
            overflowX: 'auto',
          }}
        >
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 0.25 }}>
            Preview
          </Typography>
          <MathText text={value} variant="body2" />
        </Box>
      )}
    </Box>
  );
}
