'use client';

/**
 * Which brief a drawing assignment sets, on the assignment itself.
 *
 * Optional and changeable at any time, including after the drawings are in,
 * because a teacher often only knows what kind of brief it was once they see
 * what came back. Only the fifth score depends on it, and the line under the
 * picker says so, so retagging never feels like it might throw work away.
 */

import { useEffect, useRef, useState } from 'react';
import { Box, MenuItem, Skeleton, TextField, Typography } from '@neram/ui';

interface Option {
  id: string;
  key: string;
  title: string;
  is_active: boolean;
}

interface Props {
  assignmentId: string;
  getToken: () => Promise<string | null>;
}

export default function AssignmentBriefPicker({ assignmentId, getToken }: Props) {
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [options, setOptions] = useState<Option[] | null>(null);
  const [value, setValue] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenRef.current();
        const res = await fetch(`/api/drawing/assignments/${assignmentId}/brief-type`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (cancelled) return;
        setOptions(body.options ?? []);
        setValue(body.brief_type_id ?? '');
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId]);

  const change = async (next: string) => {
    const previous = value;
    setValue(next);
    setStatus('saving');
    try {
      const token = await tokenRef.current();
      const res = await fetch(`/api/drawing/assignments/${assignmentId}/brief-type`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief_type_id: next || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus('saved');
    } catch {
      setValue(previous);
      setStatus('error');
    }
  };

  // An environment without brief tagging simply has no picker.
  if (unavailable) return null;
  if (!options) return <Skeleton variant="rounded" height={56} sx={{ mb: 2, borderRadius: 2 }} />;

  return (
    <Box sx={{ mb: 2 }} data-testid="assignment-brief-picker">
      <TextField
        select
        fullWidth
        size="small"
        label="Brief type"
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={status === 'saving'}
        SelectProps={{ displayEmpty: true }}
        InputLabelProps={{ shrink: true }}
        sx={{ '& .MuiInputBase-root': { minHeight: 48 } }}
      >
        <MenuItem value="">Not set (score the shared four)</MenuItem>
        {options.map((o) => (
          <MenuItem key={o.id} value={o.id}>{o.title}</MenuItem>
        ))}
      </TextField>
      <Typography
        variant="caption"
        color={status === 'error' ? 'error' : 'text.secondary'}
        role={status === 'error' ? 'alert' : undefined}
        aria-live="polite"
        sx={{ display: 'block', mt: 0.5, lineHeight: 1.4 }}
      >
        {status === 'error'
          ? 'Could not change the brief. Nothing was changed.'
          : status === 'saved'
            ? 'Saved. Scores already given on the shared four criteria are kept.'
            : 'Decides the fifth score only, so you can set or change it after drawings arrive.'}
      </Typography>
    </Box>
  );
}
