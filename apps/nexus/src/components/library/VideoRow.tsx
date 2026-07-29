'use client';

/**
 * One horizontal row of videos.
 *
 * Presentational only: the caller supplies the videos. CategoryRow used to
 * fetch its own, which meant the Library home fired one request per row on
 * first paint. /api/library/home returns all the rows in a single call now.
 */

import { Box, Typography, Button } from '@neram/ui';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useRouter } from 'next/navigation';
import VideoCard from './VideoCard';
import type { LibraryVideo } from '@neram/database/types';

interface VideoRowProps {
  title: string;
  videos: LibraryVideo[];
  seeAllHref?: string;
}

export default function VideoRow({ title, videos, seeAllHref }: VideoRowProps) {
  const router = useRouter();
  if (!videos.length) return null;

  return (
    <Box sx={{ mb: 3 }}>
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
          sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.1rem' } }}
        >
          {title}
        </Typography>
        {seeAllHref && (
          <Button
            size="small"
            endIcon={<ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />}
            onClick={() => router.push(seeAllHref)}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', minHeight: 44, px: 1.5 }}
          >
            See All
          </Button>
        )}
      </Box>

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
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </Box>
    </Box>
  );
}
