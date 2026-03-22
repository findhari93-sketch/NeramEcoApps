'use client';

import { Box, Typography, Paper, useTheme, alpha } from '@neram/ui';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

interface TopVideo {
  video_id: string;
  title: string;
  watch_count: number;
  avg_completion?: number;
}

interface TopVideosWidgetProps {
  topVideos: TopVideo[];
  leastWatchedVideos: { video_id: string; title: string; watch_count: number }[];
}

export default function TopVideosWidget({ topVideos, leastWatchedVideos }: TopVideosWidgetProps) {
  const theme = useTheme();

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
      {/* Most Watched */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          p: 2,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <TrendingUpIcon sx={{ fontSize: '1rem', color: '#4caf50' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
            Most Watched
          </Typography>
        </Box>
        {topVideos.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No data yet
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {topVideos.map((video, idx) => (
              <Box
                key={video.video_id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.success.main, 0.04),
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    width: 20,
                    fontWeight: 700,
                    color: 'text.disabled',
                    fontSize: '0.7rem',
                    textAlign: 'center',
                  }}
                >
                  {idx + 1}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: '0.75rem',
                    }}
                  >
                    {video.title}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem' }}>
                    {video.watch_count} views
                  </Typography>
                  {video.avg_completion !== undefined && (
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', color: 'text.secondary', fontSize: '0.6rem' }}
                    >
                      {video.avg_completion}% avg
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* Least Watched */}
      <Paper
        elevation={0}
        sx={{
          flex: 1,
          p: 2,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <TrendingDownIcon sx={{ fontSize: '1rem', color: '#f44336' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
            Least Watched
          </Typography>
        </Box>
        {leastWatchedVideos.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No data yet
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {leastWatchedVideos.map((video, idx) => (
              <Box
                key={video.video_id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  p: 1,
                  borderRadius: 1.5,
                  bgcolor: alpha(theme.palette.error.main, 0.04),
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    width: 20,
                    fontWeight: 700,
                    color: 'text.disabled',
                    fontSize: '0.7rem',
                    textAlign: 'center',
                  }}
                >
                  {idx + 1}
                </Typography>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 600,
                      display: 'block',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: '0.75rem',
                    }}
                  >
                    {video.title}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.7rem', flexShrink: 0 }}>
                  {video.watch_count} views
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
