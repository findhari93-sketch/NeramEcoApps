'use client';

import { Box, Typography } from '@neram/ui';
import { tokens as t } from '@/design-system';

interface FieldProps {
  /** The id of the input inside, so the label is tied to it. */
  id: string;
  label: string;
  helper?: React.ReactNode;
  error?: boolean;
  children: React.ReactNode;
}

/**
 * A label above its input, as the Apply Flow design draws every field: a
 * 15px semibold ink label 8px above the control, the input, then one quiet helper or error line. Inputs
 * inside are plain TextFields with no floating label, just a placeholder.
 */
export default function Field({ id, label, helper, error, children }: FieldProps) {
  return (
    <Box>
      <Typography
        component="label"
        id={`${id}-label`}
        htmlFor={id}
        sx={{ display: 'block', mb: 1, fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: t.ink }}
      >
        {label}
      </Typography>
      {children}
      {helper && (
        <Typography
          component="p"
          id={`${id}-helper`}
          sx={{ m: 0, mt: 0.75, fontSize: 13, lineHeight: 1.45, color: error ? 'error.main' : t.inkMuted }}
        >
          {helper}
        </Typography>
      )}
    </Box>
  );
}
