'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Button, alpha, useTheme } from '@neram/ui';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoCard, { VideoCardSkeleton } from './VideoCard';
import type { LibraryVideo } from '@neram/database/types';

interface CategoryRowProps {
  title: string;
  category: string;
}

export default function CategoryRow({ title, category }: CategoryRowProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchCategoryVideos() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(
          `/api/library/videos?category=${encodeURIComponent(category)}&limit=8`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error('Failed to fetch');

        const data = await res.json();
        if (!cancelled) {
          setVideos(data.videos || []);
        }
      } catch (err) {
        console.error(`Category "${category}" fetch error:`, err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCategoryVideos();
    return () => { cancelled = true; };
  }, [getToken, category]);

  // Don't render if no videos and done loading
  if (!loading && videos.length === 0) return null;

  return (
    <Box sx={{ mb: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1.5,
          px: { xs: 2, sm: 0 },
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            fontSize: { xs: '1rem', sm: '1.1rem' },
          }}
        >
          {title}
        </Typography>
        <Button
          size="small"
          endIcon={<ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />}
          onClick={() => router.push(`/student/library/browse?category=${encodeURIComponent(category)}`)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
            minHeight: 36,
            px: 1.5,
          }}
        >
          See All
        </Button>
      </Box>

      {/* Horizontal scroll */}
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
          : videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
      </Box>
    </Box>
  );
}
