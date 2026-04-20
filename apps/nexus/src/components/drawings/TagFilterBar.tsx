'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box, Chip, Skeleton } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { DrawingTag } from '@neram/database/types';

interface Props {
  selected: string[];
  onChange: (slugs: string[]) => void;
  /** Optional cap on chips visible inline; remaining count is shown as "+N more" */
  max?: number;
}

/**
 * Horizontal scrollable row of tag chips for filtering the drawing review
 * queue and the gallery feed. Multi-select toggles. Loads once from
 * /api/drawing/tags and caches in component state.
 */
export default function TagFilterBar({ selected, onChange }: Props) {
  const { getToken } = useNexusAuthContext();
  const [tags, setTags] = useState<DrawingTag[] | null>(null);

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
        if (!cancelled) setTags(body.tags || []);
      } catch {
        if (!cancelled) setTags([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  const toggle = useCallback(
    (slug: string) => {
      if (selected.includes(slug)) {
        onChange(selected.filter((s) => s !== slug));
      } else {
        onChange([...selected, slug]);
      }
    },
    [selected, onChange]
  );

  const clear = useCallback(() => onChange([]), [onChange]);

  if (tags === null) {
    return (
      <Box sx={{ display: 'flex', gap: 1, py: 0.5, mb: 1 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" width={80} height={30} />
        ))}
      </Box>
    );
  }

  if (tags.length === 0) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        py: 0.5,
        mb: 1,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { height: 6 },
      }}
    >
      <Chip
        label={`All${selected.length ? ` · ${selected.length}` : ''}`}
        size="small"
        variant={selected.length === 0 ? 'filled' : 'outlined'}
        color={selected.length === 0 ? 'primary' : 'default'}
        onClick={clear}
        sx={{ flexShrink: 0 }}
      />
      {tags.map((t) => {
        const active = selected.includes(t.slug);
        return (
          <Chip
            key={t.id}
            label={t.label}
            size="small"
            variant={active ? 'filled' : 'outlined'}
            color={active ? 'primary' : 'default'}
            onClick={() => toggle(t.slug)}
            sx={{ flexShrink: 0 }}
          />
        );
      })}
    </Box>
  );
}
