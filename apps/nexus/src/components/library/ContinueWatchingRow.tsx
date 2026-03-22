'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoCard, { VideoCardSkeleton } from './VideoCard';

interface WatchHistoryItem {
  id: string;
  video_id: string;
  last_position_seconds: number;
  total_watched_seconds: number;
  completed: boolean;
  video: any; // LibraryVideo from join
}

export default function ContinueWatchingRow() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchContinueWatching() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch('/api/library/videos/continue-watching', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Failed to fetch');

        const { data } = await res.json();
        if (!cancelled) {
          setItems(data || []);
        }
      } catch (err) {
        console.error('Continue watching fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchContinueWatching();
    return () => { cancelled = true; };
  }, [getToken]);

  // Don't render anything if there are no items and not loading
  if (!loading && items.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 700,
          mb: 1.5,
          px: { xs: 2, sm: 0 },
          fontSize: { xs: '1rem', sm: '1.1rem' },
        }}
      >
        Continue Watching
      </Typography>

      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          px: { xs: 2, sm: 0 },
          pb: 1,
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <VideoCardSkeleton key={i} />)
          : items.map((item) => {
              const durationSec = item.video?.duration_seconds || 1;
              const completion_pct = Math.min(
                100,
                Math.round((item.total_watched_seconds / durationSec) * 100)
              );
              return (
                <VideoCard
                  key={item.id}
                  video={item.video}
                  progress={{ completion_pct }}
                />
              );
            })}
      </Box>
    </Box>
  );
}
