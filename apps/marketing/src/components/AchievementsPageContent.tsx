'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Skeleton } from '@neram/ui';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { EmptyState, FilterBar, PersonCard, Pill, tokens as t } from '@/design-system';

interface ContentItem {
  id: string;
  title: Record<string, string>;
  description: Record<string, string>;
  image_url: string | null;
  metadata: Record<string, unknown>;
}

interface AchievementMeta {
  student_name?: string;
  exam?: string;
  score?: number | null;
  rank?: number | null;
  percentile?: number | null;
  college?: string | null;
  academic_year?: string;
  student_quote?: string | null;
  image_crops?: { square?: string; banner?: string; mobile?: string } | null;
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

function scoreLabel(m: AchievementMeta): string | null {
  if (m.rank) return `Rank ${m.rank}`;
  if (m.score) return `Score: ${m.score}`;
  if (m.percentile) return `${m.percentile}%`;
  return null;
}

const gridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
  gap: { xs: 2, md: 2.5 },
} as const;

/** Achievements tab: academic-year pills in the sticky filter bar, then one PersonCard per achievement. */
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

  const currentYear = getCurrentAcademicYear();

  return (
    <>
      <FilterBar
        summary={!loading && items.length > 0 ? `${items.length} ${items.length === 1 ? 'achievement' : 'achievements'}` : undefined}
      >
        <Box role="group" aria-label="Academic year" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {yearsLoading
            ? [0, 1].map((i) => <Skeleton key={i} variant="rounded" width={96} height={44} sx={{ borderRadius: `${t.radiusPill}px` }} />)
            : years.map((year) => (
                <Pill key={year} selected={year === selectedYear} onClick={() => setSelectedYear(year)}>
                  {year}
                  {year === currentYear && (
                    <Box component="span" sx={{ fontFamily: t.fontMono, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>
                      Current
                    </Box>
                  )}
                </Pill>
              ))}
        </Box>
      </FilterBar>

      <Box
        sx={{
          maxWidth: t.container.page,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          py: { xs: 5, md: 7 },
          boxSizing: 'content-box',
        }}
      >
        {loading ? (
          <Box sx={gridSx} aria-hidden>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Box key={i} sx={{ p: 2.5, bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px` }}>
                <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'center' }}>
                  <Skeleton variant="circular" width={52} height={52} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="70%" />
                    <Skeleton variant="text" width="45%" />
                  </Box>
                </Box>
                <Skeleton variant="text" width="90%" sx={{ mt: 1.5 }} />
                <Skeleton variant="text" width="60%" />
              </Box>
            ))}
          </Box>
        ) : items.length > 0 ? (
          <Box sx={gridSx}>
            {items.map((item) => {
              const m = (item.metadata || {}) as AchievementMeta;
              const title = item.title?.[locale] || item.title?.en || '';
              const score = scoreLabel(m);
              const role = [m.exam, score].filter(Boolean).join(' · ');
              return (
                <PersonCard
                  key={item.id}
                  name={m.student_name || title || 'Student'}
                  photo={m.image_crops?.square || item.image_url}
                  role={role || undefined}
                  detail={m.college ? <>Admitted to: <strong>{m.college}</strong></> : undefined}
                >
                  {title && m.student_name && (
                    <Typography component="p" sx={{ m: 0, fontSize: '1rem', fontWeight: 600, lineHeight: 1.45 }}>
                      {title}
                    </Typography>
                  )}
                  {m.student_quote && (
                    <Typography
                      component="blockquote"
                      sx={{
                        m: 0,
                        pl: 1.75,
                        fontSize: '0.9375rem',
                        lineHeight: 1.6,
                        color: t.inkMuted,
                        boxShadow: `inset 3px 0 0 ${t.gold500}`,
                      }}
                    >
                      &ldquo;{m.student_quote}&rdquo;
                    </Typography>
                  )}
                </PersonCard>
              );
            })}
          </Box>
        ) : (
          <EmptyState
            icon={<EmojiEventsOutlinedIcon />}
            title={`No achievements recorded for ${selectedYear} yet`}
            body="Check back soon. We update this page as results are announced"
          />
        )}
      </Box>
    </>
  );
}
