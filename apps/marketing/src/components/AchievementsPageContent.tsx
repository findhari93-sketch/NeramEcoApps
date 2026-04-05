'use client';

import { useState, useEffect } from 'react';
import { Box, Container, Typography, Grid, Skeleton, Tabs, Tab, Chip } from '@neram/ui';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { AchievementCard } from './marketing-content';

interface ContentItem {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  image_url: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Get current academic year (April-based).
 * If month >= April, year is YYYY-(YY+1). Otherwise (YYYY-1)-YY.
 */
function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed, April = 3
  const startYear = month >= 3 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export default function AchievementsPageContent({ locale = 'en' }: { locale?: string }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [years, setYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState(getCurrentAcademicYear());
  const [yearsLoading, setYearsLoading] = useState(true);

  // Fetch available academic years
  useEffect(() => {
    async function fetchYears() {
      try {
        const res = await fetch('/api/marketing-content?years_only=true');
        const json = await res.json();
        const fetchedYears = json.years || [];
        if (fetchedYears.length > 0) {
          setYears(fetchedYears);
          // Default to first (most recent) year if current year has no data
          if (!fetchedYears.includes(selectedYear)) {
            setSelectedYear(fetchedYears[0]);
          }
        } else {
          setYears([getCurrentAcademicYear()]);
        }
      } catch {
        setYears([getCurrentAcademicYear()]);
      } finally {
        setYearsLoading(false);
      }
    }
    fetchYears();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch achievements for selected year
  useEffect(() => {
    async function fetchAchievements() {
      try {
        setLoading(true);
        const res = await fetch(`/api/marketing-content?type=achievement&academic_year=${selectedYear}`);
        const json = await res.json();
        setItems(json.content || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    if (selectedYear) {
      fetchAchievements();
    }
  }, [selectedYear]);

  const tabIndex = years.indexOf(selectedYear);

  return (
    <Box sx={{ py: { xs: 4, md: 8 } }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <EmojiEventsIcon sx={{ color: 'warning.main', fontSize: 40 }} />
            <Typography variant="h3" component="h1" fontWeight={800}>
              Our Achievers
            </Typography>
          </Box>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto' }}>
            Congratulations to our students who excelled in NATA and JEE Paper 2 exams
          </Typography>
        </Box>

        {/* Academic Year Tabs */}
        {!yearsLoading && years.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <Tabs
              value={tabIndex >= 0 ? tabIndex : 0}
              onChange={(_, v) => setSelectedYear(years[v])}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                '& .MuiTab-root': {
                  fontWeight: 600,
                  minWidth: 100,
                },
              }}
            >
              {years.map((year) => (
                <Tab
                  key={year}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {year}
                      {year === getCurrentAcademicYear() && (
                        <Chip label="Current" size="small" color="primary" sx={{ height: 20, fontSize: 10 }} />
                      )}
                    </Box>
                  }
                />
              ))}
            </Tabs>
          </Box>
        )}

        {/* Achievement Cards Grid */}
        <Grid container spacing={3}>
          {loading
            ? [1, 2, 3, 4, 5, 6].map((i) => (
                <Grid item xs={12} sm={6} md={4} key={i}>
                  <Skeleton variant="rounded" height={260} />
                </Grid>
              ))
            : items.length > 0
              ? items.map((item) => (
                  <Grid item xs={12} sm={6} md={4} key={item.id}>
                    <AchievementCard
                      title={item.title?.[locale] || item.title?.en || ''}
                      description={item.description?.[locale] || item.description?.en || ''}
                      imageUrl={item.image_url}
                      metadata={item.metadata as any}
                    />
                  </Grid>
                ))
              : (
                  <Grid item xs={12}>
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                      <EmojiEventsIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary">
                        No achievements recorded for {selectedYear} yet
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Check back soon. We update this page as results are announced
                      </Typography>
                    </Box>
                  </Grid>
                )}
        </Grid>
      </Container>
    </Box>
  );
}
