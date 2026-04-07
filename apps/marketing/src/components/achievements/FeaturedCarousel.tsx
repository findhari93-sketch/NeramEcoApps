'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, Chip, Avatar, Skeleton } from '@neram/ui';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import Link from 'next/link';
import type { StudentResult } from '@neram/database';

const EXAM_CHIP_COLORS: Record<string, string> = {
  nata: '#1a8fff',
  jee_paper2: '#4caf50',
  tnea: '#ff9800',
  other: '#9e9e9e',
};

const EXAM_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  tnea: 'TNEA',
  other: 'Other',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function FeaturedCarousel() {
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isHoveredRef = useRef(false);

  useEffect(() => {
    async function fetchFeatured() {
      try {
        const res = await fetch('/api/student-results?featured_only=true&limit=10');
        const json = await res.json();
        if (json.success) {
          setResults(json.data || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchFeatured();
  }, []);

  const scrollNext = useCallback(() => {
    if (!scrollRef.current || isHoveredRef.current) return;
    const container = scrollRef.current;
    const cardWidth = 296; // 280 + 16 gap
    const maxScroll = container.scrollWidth - container.clientWidth;

    if (container.scrollLeft >= maxScroll - 10) {
      container.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      container.scrollBy({ left: cardWidth, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    if (results.length <= 1) return;

    autoScrollRef.current = setInterval(scrollNext, 3000);
    return () => {
      if (autoScrollRef.current) clearInterval(autoScrollRef.current);
    };
  }, [results.length, scrollNext]);

  const handleMouseEnter = useCallback(() => {
    isHoveredRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isHoveredRef.current = false;
  }, []);

  if (!loading && results.length === 0) return null;

  const glassCardSx = {
    minWidth: 280,
    maxWidth: 280,
    bgcolor: 'rgba(11,22,41,0.75)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    p: 2.5,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center',
    scrollSnapAlign: 'start',
    transition: 'all 0.3s ease',
    textDecoration: 'none',
    cursor: 'pointer',
    '&:hover': {
      transform: 'translateY(-4px)',
      borderColor: 'rgba(232,160,32,0.3)',
      boxShadow: '0 12px 40px rgba(232,160,32,0.12)',
    },
  };

  return (
    <Box sx={{ mb: { xs: 4, md: 5 } }}>
      {/* Section title */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2.5,
        }}
      >
        <MilitaryTechIcon sx={{ color: '#e8a020', fontSize: 28 }} />
        <Typography
          variant="h5"
          component="h2"
          fontWeight={700}
          sx={{ color: '#f5f0e8' }}
        >
          Top Performers
        </Typography>
      </Box>

      {/* Scroll container */}
      <Box
        ref={scrollRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          pb: 1,
          mx: { xs: -2, sm: 0 },
          px: { xs: 2, sm: 0 },
          /* Hide scrollbar on desktop, thin on mobile */
          '&::-webkit-scrollbar': { height: 4 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 2,
          },
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}
      >
        {loading
          ? [1, 2, 3, 4].map((i) => (
              <Box key={i} sx={{ ...glassCardSx, cursor: 'default', '&:hover': {} }}>
                <Skeleton
                  variant="circular"
                  width={100}
                  height={100}
                  sx={{ mb: 1.5, bgcolor: 'rgba(255,255,255,0.06)' }}
                />
                <Skeleton
                  variant="text"
                  width={140}
                  height={28}
                  sx={{ bgcolor: 'rgba(255,255,255,0.06)' }}
                />
                <Skeleton
                  variant="rounded"
                  width={60}
                  height={24}
                  sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.06)' }}
                />
                <Skeleton
                  variant="text"
                  width={80}
                  height={36}
                  sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.06)' }}
                />
              </Box>
            ))
          : results.map((result) => {
              const chipColor = EXAM_CHIP_COLORS[result.exam_type] || '#9e9e9e';
              const examLabel = EXAM_LABELS[result.exam_type] || result.exam_type;
              const scoreDisplay = result.score != null && result.max_score != null
                ? `${result.score}/${result.max_score}`
                : result.score != null
                  ? `${result.score}`
                  : result.rank != null
                    ? `Rank #${result.rank}`
                    : null;

              return (
                <Box
                  key={result.id}
                  component={Link}
                  href={`/achievements/${result.slug}`}
                  sx={glassCardSx}
                >
                  <Avatar
                    src={result.photo_url || undefined}
                    alt={result.student_name}
                    sx={{
                      width: 100,
                      height: 100,
                      mb: 1.5,
                      fontSize: 32,
                      fontWeight: 700,
                      bgcolor: 'rgba(232,160,32,0.15)',
                      color: '#e8a020',
                      border: '3px solid rgba(232,160,32,0.3)',
                    }}
                  >
                    {getInitials(result.student_name)}
                  </Avatar>

                  <Typography
                    variant="subtitle1"
                    fontWeight={700}
                    noWrap
                    sx={{
                      color: '#f5f0e8',
                      maxWidth: '100%',
                    }}
                  >
                    {result.student_name}
                  </Typography>

                  <Chip
                    label={examLabel}
                    size="small"
                    sx={{
                      mt: 1,
                      bgcolor: `${chipColor}20`,
                      color: chipColor,
                      border: `1px solid ${chipColor}40`,
                      fontWeight: 600,
                      fontSize: '0.75rem',
                    }}
                  />

                  {scoreDisplay && (
                    <Typography
                      variant="h5"
                      fontWeight={800}
                      sx={{
                        color: '#e8a020',
                        mt: 1.5,
                        fontSize: { xs: '1.25rem', sm: '1.5rem' },
                      }}
                    >
                      {scoreDisplay}
                    </Typography>
                  )}

                  {result.rank != null && result.score != null && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(245,240,232,0.5)', mt: 0.5 }}
                    >
                      Rank #{result.rank}
                    </Typography>
                  )}

                  {result.college_name && (
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{
                        color: 'rgba(245,240,232,0.5)',
                        mt: 1,
                        maxWidth: '100%',
                      }}
                    >
                      {result.college_name}
                    </Typography>
                  )}
                </Box>
              );
            })}
      </Box>
    </Box>
  );
}
