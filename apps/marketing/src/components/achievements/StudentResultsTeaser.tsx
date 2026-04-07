'use client';

import { useState, useEffect } from 'react';
import { Box, Container, Typography, Button, Avatar, Chip } from '@neram/ui';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SchoolIcon from '@mui/icons-material/School';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import Link from 'next/link';
import type { StudentResult, StudentResultExamType } from '@neram/database';

const EXAM_CHIP_COLORS: Record<StudentResultExamType, string> = {
  nata: '#1a8fff',
  jee_paper2: '#4caf50',
  tnea: '#ff9800',
  other: '#9e9e9e',
};

const EXAM_LABELS: Record<StudentResultExamType, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  tnea: 'TNEA',
  other: 'Exam',
};

export default function StudentResultsTeaser() {
  const [results, setResults] = useState<StudentResult[]>([]);

  useEffect(() => {
    fetch('/api/student-results?featured_only=true&limit=6')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.length > 0) {
          setResults(json.data);
        }
      })
      .catch(() => {});
  }, []);

  if (results.length === 0) return null;

  return (
    <Box sx={{ py: { xs: 6, md: 10 }, position: 'relative' }}>
      <Container maxWidth="lg">
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
          PROVEN RESULTS
        </Typography>
        <Typography
          variant="h2"
          component="h2"
          align="center"
          sx={{ mb: 2, fontWeight: 700 }}
        >
          Our Students, Our Pride
        </Typography>
        <Typography
          variant="body1"
          align="center"
          color="text.secondary"
          sx={{ mb: 6, maxWidth: 560, mx: 'auto' }}
        >
          Real results from real students. Scorecards, scores, and college placements that speak for themselves.
        </Typography>

        {/* Scrollable on mobile, grid on desktop */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'grid' },
            gridTemplateColumns: { md: 'repeat(3, 1fr)' },
            gap: 3,
            overflowX: { xs: 'auto', md: 'unset' },
            scrollSnapType: { xs: 'x mandatory', md: 'none' },
            pb: { xs: 2, md: 0 },
            mx: { xs: -2, md: 0 },
            px: { xs: 2, md: 0 },
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          {results.map((result) => (
            <Link
              key={result.id}
              href={`/achievements/${result.slug}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Box
                sx={{
                  minWidth: { xs: 260, md: 'auto' },
                  scrollSnapAlign: 'start',
                  bgcolor: 'rgba(11,22,41,0.75)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 3,
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    borderColor: 'rgba(232,160,32,0.3)',
                    boxShadow: '0 8px 32px rgba(232,160,32,0.1)',
                  },
                }}
              >
                <Avatar
                  src={result.photo_url || undefined}
                  sx={{
                    width: 80,
                    height: 80,
                    mx: 'auto',
                    mb: 2,
                    border: '3px solid rgba(232,160,32,0.4)',
                    bgcolor: '#122040',
                  }}
                >
                  <SchoolIcon sx={{ fontSize: 36, color: '#e8a020' }} />
                </Avatar>

                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  {result.student_name}
                </Typography>

                <Chip
                  label={EXAM_LABELS[result.exam_type]}
                  size="small"
                  sx={{
                    bgcolor: `${EXAM_CHIP_COLORS[result.exam_type]}20`,
                    color: EXAM_CHIP_COLORS[result.exam_type],
                    fontWeight: 600,
                    fontSize: '11px',
                    mb: 1.5,
                  }}
                />

                {result.score != null && result.max_score != null ? (
                  <Typography variant="h5" fontWeight={800} sx={{ color: '#e8a020', mb: 0.5 }}>
                    {result.score}/{result.max_score}
                  </Typography>
                ) : result.rank != null ? (
                  <Typography variant="h5" fontWeight={800} sx={{ color: '#e8a020', mb: 0.5 }}>
                    Rank #{result.rank}
                  </Typography>
                ) : null}

                {result.college_name && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mt: 1 }}>
                    <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      {result.college_name}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Link>
          ))}
        </Box>

        {/* CTA */}
        <Box sx={{ textAlign: 'center', mt: 5 }}>
          <Button
            component={Link}
            href="/achievements"
            variant="outlined"
            size="large"
            endIcon={<ArrowForwardIcon />}
            sx={{
              borderColor: 'rgba(232,160,32,0.4)',
              color: '#e8a020',
              fontWeight: 600,
              px: 4,
              '&:hover': {
                borderColor: '#e8a020',
                bgcolor: 'rgba(232,160,32,0.08)',
              },
            }}
          >
            View All Results
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
