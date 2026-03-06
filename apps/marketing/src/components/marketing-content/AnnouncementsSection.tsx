'use client';

import { useState, useEffect } from 'react';
import { Box, Container, Typography, Grid, Skeleton } from '@neram/ui';
import CampaignIcon from '@mui/icons-material/Campaign';
import AnnouncementCard from './AnnouncementCard';

interface ContentItem {
  id: string;
  type: string;
  title: Record<string, string>;
  description: Record<string, string>;
  image_url: string | null;
  metadata: Record<string, unknown>;
}

export default function AnnouncementsSection({ locale = 'en' }: { locale?: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnnouncements() {
      try {
        // Fetch both announcements and updates
        const [annRes, updateRes] = await Promise.all([
          fetch('/api/marketing-content?type=announcement&limit=3'),
          fetch('/api/marketing-content?type=update&limit=3'),
        ]);
        const annJson = await annRes.json();
        const updateJson = await updateRes.json();
        const combined = [...(annJson.content || []), ...(updateJson.content || [])].slice(0, 6);
        setItems(combined);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchAnnouncements();
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <Box sx={{
      py: { xs: 6, md: 10 },
      position: 'relative',
      '&::before': {
        content: '""',
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 30% 50%, rgba(232,160,32,0.06) 0%, transparent 60%)',
        pointerEvents: 'none',
      },
    }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mb: 1 }}>
            <CampaignIcon sx={{ color: 'primary.main', fontSize: 32 }} />
            <Typography variant="h2" component="h2" fontWeight={700}>
              Latest Updates
            </Typography>
          </Box>
          <Typography variant="h6" color="text.secondary">
            News and announcements from Neram Classes
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {loading
            ? [1, 2, 3].map((i) => (
                <Grid item xs={12} sm={6} md={4} key={i}>
                  <Skeleton variant="rounded" height={200} />
                </Grid>
              ))
            : items.map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.id}>
                  <AnnouncementCard
                    title={item.title?.[locale] || item.title?.en || ''}
                    description={item.description?.[locale] || item.description?.en || ''}
                    imageUrl={item.image_url}
                    metadata={item.metadata as any}
                  />
                </Grid>
              ))}
        </Grid>
      </Container>
    </Box>
  );
}
