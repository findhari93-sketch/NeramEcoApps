'use client';

import { useEffect, useState } from 'react';
import { Box, Skeleton } from '@neram/ui';
import type { StudentResult } from '@neram/database';
import { SectionHeader, tokens as t } from '@/design-system';
import ResultCard from './ResultCard';

/**
 * "Top Performers": featured results in a horizontal scroll-snap row. It moves
 * only when the reader swipes or scrolls (no auto-advance), and hides itself
 * when nothing is featured.
 */
export default function FeaturedCarousel() {
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeatured() {
      try {
        const res = await fetch('/api/student-results?featured_only=true&limit=10');
        const json = await res.json();
        if (json.success) {
          setResults(json.data || []);
        }
      } catch {
        // The strip is optional: hide it on failure.
      } finally {
        setLoading(false);
      }
    }
    fetchFeatured();
  }, []);

  if (!loading && results.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="top-performers-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <SectionHeader id="top-performers-title" eyebrow="Featured" title="Top Performers" align="start" size="article" />
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          pb: 1,
          scrollbarWidth: 'thin',
          '@media (prefers-reduced-motion: no-preference)': { scrollBehavior: 'smooth' },
        }}
      >
        {loading
          ? [0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                aria-hidden
                sx={{
                  width: 260,
                  flexShrink: 0,
                  p: 2.5,
                  boxSizing: 'border-box',
                  bgcolor: t.surface,
                  border: `1px solid ${t.line}`,
                  borderRadius: `${t.radius}px`,
                }}
              >
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Skeleton variant="circular" width={52} height={52} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="text" width="50%" />
                  </Box>
                </Box>
                <Skeleton variant="text" width={90} height={36} sx={{ mt: 1 }} />
                <Skeleton variant="text" width="70%" />
              </Box>
            ))
          : results.map((result) => <ResultCard key={result.id} result={result} compact />)}
      </Box>
    </Box>
  );
}
