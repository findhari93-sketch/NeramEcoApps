'use client';

import { useRef, useEffect } from 'react';
import { Box, TextField } from '@neram/ui';
import { placeholderToLabel } from '@/lib/whatsapp-templates/placeholders';

interface Props {
  placeholders: string[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function PlaceholderInputs({ placeholders, values, onChange }: Props) {
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus first input when card expands
    const timer = setTimeout(() => firstRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2, mt: 1 }}>
      {placeholders.map((key, i) => (
        <TextField
          key={key}
          inputRef={i === 0 ? firstRef : undefined}
          label={placeholderToLabel(key)}
          value={values[key] || ''}
          onChange={(e) => onChange(key, e.target.value)}
          size="small"
          sx={{
            width: { xs: '100%', sm: 220 },
            '& .MuiInputBase-root': { minHeight: 44 },
          }}
        />
      ))}
    </Box>
  );
}
