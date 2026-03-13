'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Container, Typography, Skeleton } from '@neram/ui';
import type { SocialProof } from '@neram/database';
import SocialProofTabs from './SocialProofTabs';
import VideoProofGrid from './VideoProofGrid';
import AudioProofGrid from './AudioProofGrid';
import ScreenshotGallery from './ScreenshotGallery';

type TabType = 'video' | 'audio' | 'screenshot';

export default function SocialProofSection() {
  const [activeTab, setActiveTab] = useState<TabType>('video');
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState<SocialProof[]>([]);
  const [audios, setAudios] = useState<SocialProof[]>([]);
  const [screenshots, setScreenshots] = useState<SocialProof[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/social-proofs?homepage=true')
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          const data = json.data as SocialProof[];
          setVideos(data.filter((d) => d.proof_type === 'video'));
          setAudios(data.filter((d) => d.proof_type === 'audio'));
          setScreenshots(data.filter((d) => d.proof_type === 'screenshot'));
        }
      })
      .catch(() => {
        // Silently fail — section simply won't show
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
  }, []);

  const totalCount = videos.length + audios.length + screenshots.length;

  // Don't render section if no data and not loading
  if (!loading && totalCount === 0) return null;

  return (
    <Box
      component="section"
      sx={{
        py: { xs: 6, md: 10 },
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 30% 40%, rgba(232,160,32,0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
        },
      }}
    >
      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        {/* Section Header */}
        <Typography
          align="center"
          sx={{
            fontFamily: '"SFMono-Regular", "Cascadia Code", "Consolas", monospace',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.2em',
            color: 'primary.main',
            mb: 1.5,
          }}
        >
          REAL PROOF
        </Typography>
        <Typography
          variant="h2"
          component="h2"
          align="center"
          sx={{ mb: 2, fontWeight: 700 }}
        >
          Hear It From Real Parents & Students
        </Typography>
        <Typography
          variant="body1"
          align="center"
          color="text.secondary"
          sx={{ mb: 6, maxWidth: 520, mx: 'auto' }}
        >
          Authentic video testimonials, audio stories, and screenshots from our community — no actors, no scripts
        </Typography>

        {/* Tabs */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 5 }}>
            <Skeleton
              variant="rounded"
              width={140}
              height={48}
              sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}
            />
            <Skeleton
              variant="rounded"
              width={140}
              height={48}
              sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}
            />
            <Skeleton
              variant="rounded"
              width={140}
              height={48}
              sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}
            />
          </Box>
        ) : (
          <SocialProofTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
            counts={{
              video: videos.length,
              audio: audios.length,
              screenshot: screenshots.length,
            }}
          />
        )}

        {/* Tab Content */}
        {loading ? (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: 3,
            }}
          >
            {[0, 1, 2].map((i) => (
              <Skeleton
                key={i}
                variant="rounded"
                height={260}
                sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}
              />
            ))}
          </Box>
        ) : (
          <>
            {activeTab === 'video' && <VideoProofGrid videos={videos} />}
            {activeTab === 'audio' && <AudioProofGrid audios={audios} />}
            {activeTab === 'screenshot' && <ScreenshotGallery screenshots={screenshots} />}
          </>
        )}
      </Container>
    </Box>
  );
}
