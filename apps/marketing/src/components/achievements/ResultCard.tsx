'use client';

import { Box, Typography, Chip, Avatar } from '@neram/ui';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import Link from 'next/link';
import Image from 'next/image';

interface ResultCardProps {
  result: {
    slug: string;
    student_name: string;
    photo_url: string | null;
    scorecard_watermarked_url: string | null;
    exam_type: string;
    exam_year: number;
    score: number | null;
    max_score: number | null;
    rank: number | null;
    college_name: string | null;
    college_city: string | null;
  };
}

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

export default function ResultCard({ result }: ResultCardProps) {
  const chipColor = EXAM_CHIP_COLORS[result.exam_type] || '#9e9e9e';
  const examLabel = EXAM_LABELS[result.exam_type] || result.exam_type;

  const scoreDisplay =
    result.score != null && result.max_score != null
      ? `${result.score}/${result.max_score}`
      : result.score != null
        ? `${result.score}`
        : null;

  const rankDisplay = result.rank != null ? `Rank #${result.rank}` : null;

  // Show score prominently, rank as secondary. If no score, show rank prominently.
  const primaryDisplay = scoreDisplay || rankDisplay;
  const secondaryDisplay = scoreDisplay && rankDisplay ? rankDisplay : null;

  const collegeLine = [result.college_name, result.college_city]
    .filter(Boolean)
    .join(', ');

  return (
    <Box
      component={Link}
      href={`/achievements/${result.slug}`}
      sx={{
        display: 'block',
        textDecoration: 'none',
        cursor: 'pointer',
        position: 'relative',
        pt: 5, // space for avatar overlap
      }}
    >
      <Box
        sx={{
          bgcolor: 'rgba(11,22,41,0.75)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          p: { xs: 2, sm: 2.5 },
          pt: { xs: 6, sm: 6.5 },
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          transition: 'all 0.3s ease',
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: '0 12px 40px rgba(232,160,32,0.12)',
            borderColor: 'rgba(232,160,32,0.3)',
          },
        }}
      >
        {/* Avatar overlapping top */}
        <Avatar
          src={result.photo_url || undefined}
          alt={result.student_name}
          sx={{
            width: 80,
            height: 80,
            position: 'absolute',
            top: -40,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 24,
            fontWeight: 700,
            bgcolor: 'rgba(232,160,32,0.15)',
            color: '#e8a020',
            border: '3px solid rgba(232,160,32,0.3)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {getInitials(result.student_name)}
        </Avatar>

        {/* Student name */}
        <Typography
          variant="h6"
          component="div"
          fontWeight={700}
          noWrap
          sx={{
            color: '#f5f0e8',
            maxWidth: '100%',
            fontSize: { xs: '0.95rem', sm: '1.1rem' },
          }}
        >
          {result.student_name}
        </Typography>

        {/* Exam badge + year */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1 }}>
          <Chip
            label={examLabel}
            size="small"
            sx={{
              bgcolor: `${chipColor}20`,
              color: chipColor,
              border: `1px solid ${chipColor}40`,
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 24,
            }}
          />
          <Typography
            variant="caption"
            sx={{ color: 'rgba(245,240,232,0.4)' }}
          >
            {result.exam_year}
          </Typography>
        </Box>

        {/* Score display */}
        {primaryDisplay && (
          <Typography
            variant="h5"
            fontWeight={800}
            sx={{
              color: '#e8a020',
              mt: 1.5,
              fontSize: { xs: '1.25rem', sm: '1.4rem' },
              lineHeight: 1.2,
            }}
          >
            {primaryDisplay}
          </Typography>
        )}

        {/* Secondary display (rank when score is shown) */}
        {secondaryDisplay && (
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(245,240,232,0.5)',
              mt: 0.25,
              fontWeight: 500,
            }}
          >
            {secondaryDisplay}
          </Typography>
        )}

        {/* College */}
        {collegeLine && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              mt: 1.5,
              maxWidth: '100%',
            }}
          >
            <LocationOnIcon
              sx={{ fontSize: 14, color: 'rgba(245,240,232,0.4)', flexShrink: 0 }}
            />
            <Typography
              variant="caption"
              noWrap
              sx={{ color: 'rgba(245,240,232,0.5)' }}
            >
              {collegeLine}
            </Typography>
          </Box>
        )}

        {/* Watermarked scorecard thumbnail */}
        {result.scorecard_watermarked_url && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 40,
              height: 40,
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.1)',
              opacity: 0.7,
              transition: 'opacity 0.2s ease',
              '&:hover': { opacity: 1 },
            }}
          >
            <Image
              src={result.scorecard_watermarked_url}
              alt="Scorecard"
              fill
              sizes="40px"
              style={{ objectFit: 'cover' }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}
