'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Grid, Typography, Skeleton } from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import GradeIcon from '@mui/icons-material/Grade';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

interface StatsData {
  total: number;
  avg_nata_score: number | null;
  top_rank: number | null;
  colleges_count: number;
}

interface StatCardConfig {
  icon: React.ReactNode;
  value: number;
  label: string;
  suffix?: string;
}

function AnimatedNumber({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (!ref.current || hasAnimated.current || target === 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          let startTime: number;
          const step = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) {
              requestAnimationFrame(step);
            }
          };
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

export default function StatsBar() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/student-results?stats=true');
        const json = await res.json();
        if (json.success) {
          setStats(json.data);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const cards: StatCardConfig[] = stats
    ? [
        {
          icon: <SchoolIcon sx={{ fontSize: 32, color: '#e8a020' }} />,
          value: stats.total,
          label: 'Total Students',
          suffix: '+',
        },
        {
          icon: <GradeIcon sx={{ fontSize: 32, color: '#e8a020' }} />,
          value: stats.avg_nata_score ?? 0,
          label: 'Avg NATA Score',
        },
        {
          icon: <MilitaryTechIcon sx={{ fontSize: 32, color: '#e8a020' }} />,
          value: stats.top_rank ?? 0,
          label: 'Top Rank',
          suffix: stats.top_rank ? '' : undefined,
        },
        {
          icon: <AccountBalanceIcon sx={{ fontSize: 32, color: '#e8a020' }} />,
          value: stats.colleges_count,
          label: 'Colleges',
          suffix: '+',
        },
      ]
    : [];

  const glassCardSx = {
    bgcolor: 'rgba(11,22,41,0.75)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    p: { xs: 2, sm: 2.5 },
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    minHeight: { xs: 110, sm: 130 },
    transition: 'all 0.3s ease',
    '&:hover': {
      borderColor: 'rgba(232,160,32,0.2)',
      boxShadow: '0 8px 32px rgba(232,160,32,0.08)',
    },
  };

  return (
    <Grid container spacing={{ xs: 1.5, sm: 2 }}>
      {loading
        ? [1, 2, 3, 4].map((i) => (
            <Grid item xs={6} md={3} key={i}>
              <Box sx={glassCardSx}>
                <Skeleton
                  variant="circular"
                  width={32}
                  height={32}
                  sx={{ mb: 1, bgcolor: 'rgba(255,255,255,0.06)' }}
                />
                <Skeleton
                  variant="text"
                  width={60}
                  height={40}
                  sx={{ bgcolor: 'rgba(255,255,255,0.06)' }}
                />
                <Skeleton
                  variant="text"
                  width={80}
                  height={20}
                  sx={{ bgcolor: 'rgba(255,255,255,0.06)' }}
                />
              </Box>
            </Grid>
          ))
        : cards.map((card) => (
            <Grid item xs={6} md={3} key={card.label}>
              <Box sx={glassCardSx}>
                <Box sx={{ mb: 1 }}>{card.icon}</Box>
                <Typography
                  variant="h4"
                  component="div"
                  fontWeight={800}
                  sx={{
                    color: '#e8a020',
                    lineHeight: 1.2,
                    fontSize: { xs: '1.5rem', sm: '2rem' },
                  }}
                >
                  <AnimatedNumber target={card.value} />
                  {card.suffix || ''}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: 'rgba(245,240,232,0.6)',
                    mt: 0.5,
                    fontSize: { xs: '0.75rem', sm: '0.85rem' },
                  }}
                >
                  {card.label}
                </Typography>
              </Box>
            </Grid>
          ))}
    </Grid>
  );
}
