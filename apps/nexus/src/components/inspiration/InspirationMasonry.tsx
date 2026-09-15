'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box } from '@neram/ui';
import { columnsForWidth, layoutMasonry } from '@/lib/masonry-layout';
import type { InspirationCard } from '@/lib/inspiration-present';
import { InspirationTileSkeleton } from './InspirationTile';

const SKELETON_ASPECTS = [0.75, 1, 0.66, 1.33, 0.8, 1.1];

export interface InspirationMasonryProps {
  cards: InspirationCard[];
  renderTile: (card: InspirationCard) => ReactNode;
  loading?: boolean;
}

/** Columns follow the grid's own width, never the window (see masonry-layout.ts). */
export default function InspirationMasonry({ cards, renderTile, loading = false }: InspirationMasonryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setColumns(columnsForWidth(el.clientWidth));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const laidOut = layoutMasonry(cards, columns, (card) => card.aspect);

  return (
    <Box
      ref={ref}
      aria-busy={loading}
      sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 1.5, sm: 2 }, width: '100%', minWidth: 0 }}
    >
      {laidOut.map((column, i) => (
        <Box
          key={i}
          data-testid="masonry-column"
          sx={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 1.5, sm: 2 } }}
        >
          {column.map((card) => (
            <Box key={card.id}>{renderTile(card)}</Box>
          ))}
          {loading &&
            [0, 1].map((k) => (
              <InspirationTileSkeleton key={`skeleton-${k}`} aspect={SKELETON_ASPECTS[(i + k) % SKELETON_ASPECTS.length]} />
            ))}
        </Box>
      ))}
    </Box>
  );
}
