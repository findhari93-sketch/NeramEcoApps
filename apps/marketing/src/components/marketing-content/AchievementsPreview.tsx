'use client';

import { useState, useEffect } from 'react';
import { Box, Container, Typography, Grid, Button, Skeleton } from '@neram/ui';
import { useRouter } from 'next/navigation';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import AchievementCard from './AchievementCard';

interface ContentItem {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  image_url: string | null;
  metadata: Record<string, unknown>;
}

export default function AchievementsPreview({ locale = 'en' }: { locale?: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const res = await fetch('/api/marketing-content?type=achievement&limit=6');
        const json = await res.json();
        setItems(json.content || []);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchAchievements();
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mb: 1 }}>
            <EmojiEventsIcon sx={{ color: 'warning.main', fontSize: 32 }} />
            <Typography variant="h2" component="h2" fontWeight={700}>
              Our Achievers
            </Typography>
          </Box>
          <Typography variant="h6" color="text.secondary">
            Celebrating the success of our students
          </Typography>
        </Box>

        <Grid container spacing={3}>
          {loading
            ? [1, 2, 3].map((i) => (
                <Grid item xs={12} sm={6} md={4} key={i}>
                  <Skeleton variant="rounded" height={240} />
                </Grid>
              ))
            : items.map((item) => (
                <Grid item xs={12} sm={6} md={4} key={item.id}>
                  <AchievementCard
                    title={item.title?.[locale] || item.title?.en || ''}
                    description={item.description?.[locale] || item.description?.en || ''}
                    imageUrl={item.image_url}
                    metadata={item.metadata as any}
                  />
                </Grid>
              ))}
        </Grid>

        {items.length > 0 && (
          <Box sx={{ textAlign: 'center', mt: 4 }}>
            <Button
              variant="outlined"
              size="large"
              onClick={() => router.push('/achievements')}
              sx={{ textTransform: 'none', px: 4 }}
            >
              View All Achievements
            </Button>
          </Box>
        )}
      </Container>
    </Box>
  );
}
