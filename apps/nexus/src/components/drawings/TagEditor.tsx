'use client';

import { useEffect, useState, useCallback, KeyboardEvent } from 'react';
import { Box, Chip, Autocomplete, TextField } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { DrawingTag } from '@neram/database/types';

interface Props {
  /** Labels currently assigned to the submission. */
  value: string[];
  onChange: (labels: string[]) => void;
  disabled?: boolean;
}

/**
 * Teacher-side tag editor for a single submission. Autocompletes from the
 * existing tag pool; typing a new label and pressing Enter creates a new tag
 * on the next save (the API upserts labels it hasn't seen).
 */
export default function TagEditor({ value, onChange, disabled }: Props) {
  const { getToken } = useNexusAuthContext();
  const [pool, setPool] = useState<DrawingTag[]>([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/drawing/tags', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setPool(body.tags || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const handleChange = useCallback(
    (_: unknown, newValue: string[]) => {
      // Normalise whitespace and de-duplicate case-insensitively.
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const label of newValue) {
        const trimmed = label.trim();
        if (!trimmed) continue;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(trimmed);
      }
      onChange(cleaned);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if ((event.key === 'Enter' || event.key === ',') && inputValue.trim()) {
        event.preventDefault();
        const trimmed = inputValue.trim();
        if (!value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) {
          onChange([...value, trimmed]);
        }
        setInputValue('');
      }
    },
    [inputValue, value, onChange]
  );

  return (
    <Box sx={{ mb: 1 }}>
      <Autocomplete
        multiple
        freeSolo
        disabled={disabled}
        options={pool.map((t) => t.label)}
        value={value}
        inputValue={inputValue}
        onInputChange={(_, v) => setInputValue(v)}
        onChange={handleChange}
        renderTags={(items, getTagProps) =>
          items.map((label, index) => {
            const { key, ...chipProps } = getTagProps({ index });
            return <Chip key={key} size="small" label={label} {...chipProps} />;
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Add tags (e.g. 2D, scenery, perspective)"
            size="small"
            onKeyDown={handleKeyDown}
          />
        )}
      />
    </Box>
  );
}
