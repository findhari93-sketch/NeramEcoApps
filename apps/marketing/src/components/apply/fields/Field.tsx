'use client';

import { Box, Typography } from '@neram/ui';

interface FieldProps {
  /** The id of the input inside, so the label is tied to it. */
  id: string;
  label: string;
  helper?: React.ReactNode;
  error?: boolean;
  children: React.ReactNode;
}

/**
 * A label above its input, as the Neram Apply design draws every field: bold
 * 13 px ink label, the input, then one quiet helper or error line. Inputs
 * inside are plain TextFields with no floating label, just a placeholder.
 */
export default function Field({ id, label, helper, error, children }: FieldProps) {
  return (
    <Box>
      <Typography
        component="label"
        id={`${id}-label`}
        htmlFor={id}
        sx={{ display: 'block', mb: 1, fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}
      >
        {label}
      </Typography>
      {children}
      {helper && (
        <Typography
          component="p"
          id={`${id}-helper`}
          sx={{ m: 0, mt: 0.75, fontSize: 13, lineHeight: 1.45, color: error ? 'error.main' : 'text.secondary' }}
        >
          {helper}
        </Typography>
      )}
    </Box>
  );
}
