'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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
import YouTubeSubscribeModal from './YouTubeSubscribeModal';

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

const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@neramclassesnata';

export default function YouTubeSection() {
  const t = useTranslations('youtube');
  const router = useRouter();

  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscribeModalOpen, setSubscribeModalOpen] = useState(false);

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

  const handleSubscribeSuccess = ({ couponCode }: { couponCode: string; discount: number }) => {
    setSubscribeModalOpen(false);
    router.push(`/en/youtube-reward?coupon=${couponCode}`);
  };

  if (loading) {
    return (
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 400,
        }}
      >
        <CircularProgress sx={{ color: 'primary.main' }} />
      </Box>
    );
  }

  if (error && !stats) {
    return (
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Alert severity="error">{error}</Alert>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        py: { xs: 6, md: 10 },
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 80% 20%, rgba(26,143,255,0.05) 0%, transparent 50%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        {/* Section Header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          {/* YouTube Logo */}
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
              sx={{ width: 48, height: 48, fill: '#FF0000' }}
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
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 600, mx: 'auto' }}
          >
            {t('subtitle')}
          </Typography>

          {/* Channel Stats Badges */}
          {stats && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', mb: 4 }}>
              <Chip
                label={`${stats.subscriberCount} ${t('subscribers')}`}
                sx={{
                  fontSize: '1rem',
                  py: 2.5,
                  px: 1,
                  fontWeight: 600,
                  bgcolor: 'rgba(255,0,0,0.15)',
                  color: '#FF4444',
                  border: '1px solid rgba(255,0,0,0.3)',
                }}
              />
              <Chip
                label={`${stats.videoCount}+ ${t('videos')}`}
                variant="outlined"
                sx={{
                  fontSize: '1rem',
                  py: 2.5,
                  px: 1,
                  borderColor: 'rgba(232,160,32,0.4)',
                  color: '#e8a020',
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
            p: { xs: 3, md: 4 },
            borderRadius: 2,
            bgcolor: 'rgba(11,22,41,0.75)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.08)',
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
            onClick={() => setSubscribeModalOpen(true)}
            sx={{
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              fontWeight: 600,
              borderRadius: 1,
              textTransform: 'none',
              bgcolor: '#CC0000',
              boxShadow: '0 4px 14px rgba(255, 0, 0, 0.3)',
              '&:hover': {
                bgcolor: '#FF0000',
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
            href={YOUTUBE_CHANNEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textTransform: 'none', color: 'primary.main' }}
          >
            {t('viewChannel')}
          </Button>
        </Box>
      </Container>

      {/* YouTube Subscribe Modal */}
      <YouTubeSubscribeModal
        open={subscribeModalOpen}
        onClose={() => setSubscribeModalOpen(false)}
        onSuccess={handleSubscribeSuccess}
      />
    </Box>
  );
}
