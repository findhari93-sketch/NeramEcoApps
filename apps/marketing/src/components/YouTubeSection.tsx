'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Grid,
  Button,
  Chip,
  CircularProgress,
  Alert,
} from '@neram/ui';
import VideoCard from './VideoCard';

interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  viewCount: string;
  publishedAt: string;
}

interface ChannelStats {
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  channelId: string;
  videos: YouTubeVideo[];
}

export default function YouTubeSection() {
  const t = useTranslations('youtube');
  const params = useParams();
  const locale = params.locale as string;

  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/youtube/channel-stats');
        if (!response.ok) {
          throw new Error('Failed to fetch channel stats');
        }
        const data = await response.json();
        setStats(data);
      } catch (err) {
        console.error('Error fetching YouTube stats:', err);
        setError('Failed to load YouTube content');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const handleSubscribeClick = () => {
    // Build the redirect URL back to this page
    const currentUrl = window.location.href;
    const encodedRedirect = encodeURIComponent(currentUrl);

    // Redirect to app.neramclasses.com with youtube_subscribe source
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
    window.location.href = `${appUrl}/login?source=youtube_subscribe&redirect=${encodedRedirect}`;
  };

  if (loading) {
    return (
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          bgcolor: 'grey.50',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error && !stats) {
    return (
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Alert severity="error">{error}</Alert>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
      <Container maxWidth="lg">
        {/* Section Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          {/* YouTube Logo/Icon */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
            }}
          >
            <Box
              component="svg"
              viewBox="0 0 24 24"
              sx={{
                width: 48,
                height: 48,
                fill: '#FF0000',
              }}
            >
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </Box>
          </Box>

          <Typography
            variant="h2"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700 }}
          >
            {t('title')}
          </Typography>

          <Typography
            variant="h6"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}
          >
            {t('subtitle')}
          </Typography>

          {/* Subscriber Count Badge */}
          {stats && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 4 }}>
              <Chip
                label={`${stats.subscriberCount} ${t('subscribers')}`}
                color="error"
                sx={{
                  fontSize: '1rem',
                  py: 2.5,
                  px: 1,
                  fontWeight: 600,
                }}
              />
              <Chip
                label={`${stats.videoCount}+ ${t('videos')}`}
                variant="outlined"
                sx={{
                  fontSize: '1rem',
                  py: 2.5,
                  px: 1,
                }}
              />
            </Box>
          )}
        </Box>

        {/* Videos Grid */}
        {stats && stats.videos.length > 0 && (
          <Grid container spacing={3} sx={{ mb: 6 }}>
            {stats.videos.slice(0, 6).map((video) => (
              <Grid item xs={12} sm={6} md={4} key={video.id}>
                <VideoCard video={video} />
              </Grid>
            ))}
          </Grid>
        )}

        {/* Subscribe CTA */}
        <Box
          sx={{
            textAlign: 'center',
            p: 4,
            borderRadius: 3,
            bgcolor: 'background.paper',
            boxShadow: 2,
          }}
        >
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
            {t('ctaTitle')}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {t('ctaDescription')}
          </Typography>
          <Button
            variant="contained"
            color="error"
            size="large"
            onClick={handleSubscribeClick}
            sx={{
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 600,
              borderRadius: 2,
              textTransform: 'none',
              boxShadow: '0 4px 14px rgba(255, 0, 0, 0.3)',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(255, 0, 0, 0.4)',
              },
            }}
            startIcon={
              <Box
                component="svg"
                viewBox="0 0 24 24"
                sx={{ width: 24, height: 24, fill: 'currentColor' }}
              >
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </Box>
            }
          >
            {t('subscribeButton')}
          </Button>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 2, fontStyle: 'italic' }}
          >
            {t('rewardNote')}
          </Typography>
        </Box>

        {/* View Channel Link */}
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Button
            variant="text"
            href="https://www.youtube.com/@neramclassesnata"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textTransform: 'none' }}
          >
            {t('viewChannel')}
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
