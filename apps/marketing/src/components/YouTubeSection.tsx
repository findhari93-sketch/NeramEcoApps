'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Box, Container, Typography, Grid, Skeleton, Alert } from '@neram/ui';
import { CtaButton, brandColors, tokens as t, v } from '@/design-system';
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

const YOUTUBE_PATH =
  'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z';

/** Stat pill on the dark band: 100px radius, gold tint, never a glow. */
const pillSx = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 36,
  px: 2,
  borderRadius: `${t.radiusPill}px`,
  fontSize: '1rem',
  fontWeight: 600,
} as const;

export default function YouTubeSection() {
  const tr = useTranslations('youtube');
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
    router.push(`/youtube-reward?coupon=${couponCode}`);
  };

  if (loading) {
    return (
      <Box sx={{ py: { xs: 6, md: 10 }, minHeight: 400 }} aria-busy="true" aria-label="Loading YouTube videos">
        <Container maxWidth="lg">
          <Skeleton variant="rounded" width={280} height={40} sx={{ mx: 'auto', mb: 6, borderRadius: `${t.radius}px` }} />
          <Grid container spacing={3}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rounded" height={240} sx={{ borderRadius: `${t.radius}px` }} />
              </Grid>
            ))}
          </Grid>
        </Container>
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
              aria-hidden
              sx={{ width: 48, height: 48, fill: brandColors.youtube }}
            >
              <path d={YOUTUBE_PATH} />
            </Box>
          </Box>

          <Typography
            variant="h2"
            component="h2"
            gutterBottom
            sx={{ fontWeight: 700, color: v.fg }}
          >
            {tr('title')}
          </Typography>

          <Typography
            variant="body1"
            sx={{ mb: 3, maxWidth: 600, mx: 'auto', color: v.muted }}
          >
            {tr('subtitle')}
          </Typography>

          {/* Channel Stats Badges */}
          {stats && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', mb: 4 }}>
              <Box component="span" sx={{ ...pillSx, gap: 1, color: v.fg, border: `1px solid ${v.line}` }}>
                <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 20, height: 20, fill: brandColors.youtube }}>
                  <path d={YOUTUBE_PATH} />
                </Box>
                {`${stats.subscriberCount} ${tr('subscribers')}`}
              </Box>
              <Box
                component="span"
                sx={{ ...pillSx, color: t.gold300, bgcolor: t.goldTintBg, border: `1px solid ${t.goldTintBorder}` }}
              >
                {`${stats.videoCount}+ ${tr('videos')}`}
              </Box>
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
            borderRadius: `${t.radius}px`,
            bgcolor: v.card,
            border: `1px solid ${v.line}`,
          }}
        >
          <Typography variant="h5" component="h3" gutterBottom sx={{ fontWeight: 600, color: v.fg }}>
            {tr('ctaTitle')}
          </Typography>
          <Typography sx={{ mb: 3, color: v.muted }}>
            {tr('ctaDescription')}
          </Typography>

          <CtaButton
            variant="primary"
            onClick={() => setSubscribeModalOpen(true)}
            endIcon={null}
            startIcon={
              <Box component="svg" viewBox="0 0 24 24" aria-hidden sx={{ width: 24, height: 24, fill: 'currentColor' }}>
                <path d={YOUTUBE_PATH} />
              </Box>
            }
          >
            {tr('subscribeButton')}
          </CtaButton>

          <Typography variant="body2" sx={{ mt: 2, color: v.muted }}>
            {tr('rewardNote')}
          </Typography>
        </Box>

        {/* View Channel Link */}
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <CtaButton variant="link" href={YOUTUBE_CHANNEL_URL} external size="md">
            {tr('viewChannel')}
          </CtaButton>
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
