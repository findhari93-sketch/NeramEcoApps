'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Chip,
  Button,
  Skeleton,
  Avatar,
  Paper,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VerifiedIcon from '@mui/icons-material/Verified';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import SchoolIcon from '@mui/icons-material/School';
import Link from 'next/link';
import Image from 'next/image';
import type { StudentResult, StudentResultExamType } from '@neram/database';

interface StudentDetailContentProps {
  slug: string;
  locale: string;
}

const EXAM_TYPE_LABELS: Record<StudentResultExamType, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  tnea: 'TNEA',
  other: 'Exam',
};

const EXAM_TYPE_COLORS: Record<StudentResultExamType, string> = {
  nata: '#1a8fff',
  jee_paper2: '#4caf50',
  tnea: '#ff9800',
  other: '#9c27b0',
};

function ScoreRing({
  score,
  maxScore,
  size = 160,
}: {
  score: number;
  maxScore: number;
  size?: number;
}) {
  const percentage = Math.min((score / maxScore) * 100, 100);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (percentage / 100) * circumference;
  const center = size / 2;

  return (
    <Box sx={{ position: 'relative', width: size, height: size, mx: 'auto' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(232, 160, 32, 0.15)"
          strokeWidth={strokeWidth}
        />
        {/* Progress ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#e8a020"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 1.2s ease-out',
          }}
        />
      </svg>
      {/* Score text centered */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography
          variant="h4"
          fontWeight={800}
          sx={{ color: '#e8a020', lineHeight: 1.1 }}
        >
          {score}
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: 'rgba(245, 240, 232, 0.6)', fontSize: '0.8rem' }}
        >
          out of {maxScore}
        </Typography>
      </Box>
    </Box>
  );
}

export default function StudentDetailContent({
  slug,
  locale,
}: StudentDetailContentProps) {
  const [result, setResult] = useState<StudentResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchResult() {
      try {
        const res = await fetch(`/api/student-results/${slug}`);
        const json = await res.json();
        if (json.success && json.data) {
          setResult(json.data);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    fetchResult();
  }, [slug]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (notFound || !result) {
    return <NotFoundState />;
  }

  const examLabel = EXAM_TYPE_LABELS[result.exam_type] || 'Exam';
  const examColor = EXAM_TYPE_COLORS[result.exam_type] || '#9c27b0';
  const hasScore = result.score != null && result.max_score != null;
  const hasRank = result.rank != null;
  const hasCollege = result.college_name != null;
  const hasScorecard = result.scorecard_watermarked_url != null;
  const hasQuote = result.student_quote != null && result.student_quote.trim().length > 0;

  return (
    <Box sx={{ py: { xs: 3, md: 6 }, minHeight: '80vh' }}>
      <Container maxWidth="md">
        {/* Back Navigation */}
        <Box sx={{ mb: { xs: 3, md: 4 } }}>
          <Button
            component={Link}
            href="/achievements"
            startIcon={<ArrowBackIcon />}
            sx={{
              color: '#f5f0e8',
              textTransform: 'none',
              fontSize: { xs: '0.875rem', md: '1rem' },
              pl: 0,
              '&:hover': {
                bgcolor: 'rgba(245, 240, 232, 0.05)',
              },
            }}
          >
            Back to All Results
          </Button>
        </Box>

        {/* Hero Section */}
        <Box
          sx={{
            textAlign: 'center',
            mb: { xs: 4, md: 5 },
          }}
        >
          {/* Student Photo */}
          <Avatar
            src={result.photo_url || undefined}
            alt={result.student_name}
            sx={{
              width: { xs: 140, sm: 160, md: 200 },
              height: { xs: 140, sm: 160, md: 200 },
              mx: 'auto',
              mb: 2.5,
              border: '4px solid rgba(232, 160, 32, 0.3)',
              bgcolor: 'rgba(26, 143, 255, 0.15)',
              fontSize: { xs: '3rem', md: '4rem' },
              color: '#1a8fff',
            }}
          >
            {!result.photo_url && result.student_name.charAt(0).toUpperCase()}
          </Avatar>

          {/* Student Name */}
          <Typography
            variant="h3"
            component="h1"
            fontWeight={800}
            sx={{
              color: '#f5f0e8',
              fontSize: { xs: '1.75rem', sm: '2rem', md: '2.5rem' },
              mb: 1.5,
              lineHeight: 1.2,
            }}
          >
            {result.student_name}
          </Typography>

          {/* Exam Type Chip */}
          <Chip
            label={`${examLabel} ${result.exam_year}`}
            sx={{
              bgcolor: `${examColor}22`,
              color: examColor,
              fontWeight: 700,
              fontSize: { xs: '0.8rem', md: '0.9rem' },
              height: { xs: 32, md: 36 },
              px: 1,
              border: `1px solid ${examColor}44`,
              mb: 3,
            }}
          />

          {/* Score Display */}
          {hasScore && (
            <Box sx={{ mb: 2 }}>
              <ScoreRing
                score={result.score!}
                maxScore={result.max_score!}
                size={160}
              />
            </Box>
          )}

          {/* Rank (prominent display when no score) */}
          {!hasScore && hasRank && (
            <Box
              sx={{
                mb: 2,
                py: 3,
                px: 4,
                mx: 'auto',
                maxWidth: 280,
                borderRadius: 3,
                bgcolor: 'rgba(232, 160, 32, 0.08)',
                border: '1px solid rgba(232, 160, 32, 0.2)',
              }}
            >
              <EmojiEventsIcon sx={{ color: '#e8a020', fontSize: 40, mb: 1 }} />
              <Typography
                variant="h3"
                fontWeight={800}
                sx={{ color: '#e8a020', fontSize: { xs: '2rem', md: '2.5rem' } }}
              >
                AIR #{result.rank}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'rgba(245, 240, 232, 0.6)' }}
              >
                All India Rank
              </Typography>
            </Box>
          )}

          {/* Rank (secondary display when score is also present) */}
          {hasScore && hasRank && (
            <Typography
              variant="h6"
              sx={{
                color: 'rgba(245, 240, 232, 0.8)',
                fontWeight: 600,
                mb: 1,
                fontSize: { xs: '1rem', md: '1.15rem' },
              }}
            >
              All India Rank: {result.rank}
            </Typography>
          )}

          {/* Percentile */}
          {result.percentile != null && (
            <Typography
              variant="body1"
              sx={{
                color: 'rgba(245, 240, 232, 0.6)',
                mb: 1,
              }}
            >
              Percentile: {result.percentile}%
            </Typography>
          )}

          {/* College Info */}
          {hasCollege && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                mt: 2,
                flexWrap: 'wrap',
              }}
            >
              <AccountBalanceIcon
                sx={{ color: '#1a8fff', fontSize: 22 }}
              />
              <Typography
                variant="body1"
                sx={{
                  color: 'rgba(245, 240, 232, 0.85)',
                  textAlign: 'center',
                  fontSize: { xs: '0.9rem', md: '1rem' },
                }}
              >
                {result.college_name}
                {result.college_city ? `, ${result.college_city}` : ''}
                {result.course_name ? ` | ${result.course_name}` : ''}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Scorecard Section */}
        {hasScorecard && (
          <Box sx={{ mb: { xs: 4, md: 5 } }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mb: 2,
              }}
            >
              <VerifiedIcon sx={{ color: '#4caf50', fontSize: 24 }} />
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ color: '#f5f0e8', fontSize: { xs: '1.05rem', md: '1.2rem' } }}
              >
                Verified Scorecard
              </Typography>
            </Box>
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                maxWidth: { xs: '100%', md: 600 },
                mx: { md: 'auto' },
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid rgba(245, 240, 232, 0.1)',
                bgcolor: 'rgba(11, 22, 41, 0.5)',
                touchAction: 'pinch-zoom',
              }}
            >
              <Image
                src={result.scorecard_watermarked_url!}
                alt={`${result.student_name} ${examLabel} ${result.exam_year} Scorecard`}
                width={600}
                height={800}
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                }}
                sizes="(max-width: 600px) 100vw, 600px"
                priority
              />
            </Box>
          </Box>
        )}

        {/* Student Quote */}
        {hasQuote && (
          <Paper
            elevation={0}
            sx={{
              mb: { xs: 4, md: 5 },
              p: { xs: 2.5, md: 3.5 },
              bgcolor: 'rgba(11, 22, 41, 0.75)',
              backdropFilter: 'blur(12px)',
              borderRadius: 2,
              borderLeft: '4px solid #e8a020',
              position: 'relative',
            }}
          >
            <FormatQuoteIcon
              sx={{
                color: 'rgba(232, 160, 32, 0.2)',
                fontSize: { xs: 40, md: 48 },
                position: 'absolute',
                top: { xs: 8, md: 12 },
                right: { xs: 8, md: 16 },
              }}
            />
            <Typography
              variant="body1"
              sx={{
                color: 'rgba(245, 240, 232, 0.9)',
                fontStyle: 'italic',
                fontSize: { xs: '0.95rem', md: '1.05rem' },
                lineHeight: 1.7,
                pr: { xs: 4, md: 6 },
              }}
            >
              &ldquo;{result.student_quote}&rdquo;
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(245, 240, 232, 0.5)',
                mt: 1.5,
                fontWeight: 600,
              }}
            >
              {result.student_name}
            </Typography>
          </Paper>
        )}

        {/* CTA Section */}
        <Box
          sx={{
            textAlign: 'center',
            py: { xs: 4, md: 5 },
            px: { xs: 2, md: 4 },
            borderRadius: 3,
            background:
              'radial-gradient(ellipse at center, rgba(232, 160, 32, 0.08) 0%, transparent 70%), linear-gradient(180deg, rgba(11, 22, 41, 0.9) 0%, rgba(6, 13, 31, 0.95) 100%)',
            border: '1px solid rgba(232, 160, 32, 0.12)',
          }}
        >
          <SchoolIcon
            sx={{ color: '#e8a020', fontSize: { xs: 36, md: 44 }, mb: 1.5 }}
          />
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{
              color: '#f5f0e8',
              mb: 1,
              fontSize: { xs: '1.15rem', md: '1.4rem' },
            }}
          >
            Want results like this?
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'rgba(245, 240, 232, 0.65)',
              mb: 3,
              fontSize: { xs: '0.9rem', md: '1rem' },
              maxWidth: 400,
              mx: 'auto',
            }}
          >
            Start your journey today with expert coaching from Neram Classes.
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1.5,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Button
              component={Link}
              href="/apply"
              variant="contained"
              size="large"
              sx={{
                bgcolor: '#e8a020',
                color: '#060d1f',
                fontWeight: 700,
                px: 4,
                py: 1.5,
                fontSize: { xs: '0.95rem', md: '1rem' },
                borderRadius: 2,
                textTransform: 'none',
                minWidth: { xs: '100%', sm: 180 },
                '&:hover': {
                  bgcolor: '#d4911d',
                },
              }}
            >
              Apply Now
            </Button>
            <Button
              component={Link}
              href="/tools"
              variant="outlined"
              size="large"
              sx={{
                borderColor: 'rgba(245, 240, 232, 0.2)',
                color: '#f5f0e8',
                fontWeight: 600,
                px: 4,
                py: 1.5,
                fontSize: { xs: '0.95rem', md: '1rem' },
                borderRadius: 2,
                textTransform: 'none',
                minWidth: { xs: '100%', sm: 180 },
                '&:hover': {
                  borderColor: 'rgba(245, 240, 232, 0.4)',
                  bgcolor: 'rgba(245, 240, 232, 0.05)',
                },
              }}
            >
              Explore Free Tools
            </Button>
          </Box>
        </Box>
      </Container>

      {/* Sticky Mobile CTA */}
      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          bgcolor: 'rgba(6, 13, 31, 0.92)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(245, 240, 232, 0.08)',
          zIndex: 1200,
        }}
      >
        <Button
          component={Link}
          href="/apply"
          variant="contained"
          fullWidth
          size="large"
          sx={{
            bgcolor: '#e8a020',
            color: '#060d1f',
            fontWeight: 700,
            py: 1.5,
            fontSize: '1rem',
            borderRadius: 2,
            textTransform: 'none',
            '&:hover': {
              bgcolor: '#d4911d',
            },
          }}
        >
          Apply Now
        </Button>
      </Box>

      {/* Bottom padding on mobile to account for sticky CTA */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, height: 72 }} />
    </Box>
  );
}

function LoadingSkeleton() {
  return (
    <Box sx={{ py: { xs: 3, md: 6 }, minHeight: '80vh' }}>
      <Container maxWidth="md">
        {/* Back button skeleton */}
        <Skeleton
          variant="rectangular"
          width={160}
          height={36}
          sx={{ borderRadius: 1, mb: { xs: 3, md: 4 }, bgcolor: 'rgba(245, 240, 232, 0.06)' }}
        />

        {/* Hero skeleton */}
        <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 5 } }}>
          <Skeleton
            variant="circular"
            sx={{
              width: { xs: 140, md: 200 },
              height: { xs: 140, md: 200 },
              mx: 'auto',
              mb: 2.5,
              bgcolor: 'rgba(245, 240, 232, 0.06)',
            }}
          />
          <Skeleton
            variant="text"
            width={220}
            height={44}
            sx={{ mx: 'auto', mb: 1, bgcolor: 'rgba(245, 240, 232, 0.06)' }}
          />
          <Skeleton
            variant="rectangular"
            width={120}
            height={32}
            sx={{ mx: 'auto', borderRadius: 4, mb: 3, bgcolor: 'rgba(245, 240, 232, 0.06)' }}
          />
          <Skeleton
            variant="circular"
            width={160}
            height={160}
            sx={{ mx: 'auto', mb: 2, bgcolor: 'rgba(245, 240, 232, 0.06)' }}
          />
          <Skeleton
            variant="text"
            width={180}
            height={28}
            sx={{ mx: 'auto', bgcolor: 'rgba(245, 240, 232, 0.06)' }}
          />
        </Box>

        {/* Scorecard skeleton */}
        <Box sx={{ mb: { xs: 4, md: 5 } }}>
          <Skeleton
            variant="text"
            width={180}
            height={32}
            sx={{ mb: 2, bgcolor: 'rgba(245, 240, 232, 0.06)' }}
          />
          <Skeleton
            variant="rectangular"
            sx={{
              width: '100%',
              maxWidth: { md: 600 },
              height: { xs: 400, md: 500 },
              borderRadius: 2,
              mx: { md: 'auto' },
              bgcolor: 'rgba(245, 240, 232, 0.06)',
            }}
          />
        </Box>

        {/* Quote skeleton */}
        <Skeleton
          variant="rectangular"
          sx={{
            width: '100%',
            height: 120,
            borderRadius: 2,
            mb: { xs: 4, md: 5 },
            bgcolor: 'rgba(245, 240, 232, 0.06)',
          }}
        />
      </Container>
    </Box>
  );
}

function NotFoundState() {
  return (
    <Box
      sx={{
        py: { xs: 8, md: 12 },
        textAlign: 'center',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Container maxWidth="sm">
        <EmojiEventsIcon
          sx={{
            fontSize: { xs: 56, md: 72 },
            color: 'rgba(245, 240, 232, 0.15)',
            mb: 2,
          }}
        />
        <Typography
          variant="h5"
          fontWeight={700}
          sx={{
            color: '#f5f0e8',
            mb: 1,
            fontSize: { xs: '1.2rem', md: '1.5rem' },
          }}
        >
          Result Not Found
        </Typography>
        <Typography
          variant="body1"
          sx={{
            color: 'rgba(245, 240, 232, 0.55)',
            mb: 3,
            fontSize: { xs: '0.9rem', md: '1rem' },
          }}
        >
          The student result you are looking for is not available or has been removed.
        </Typography>
        <Button
          component={Link}
          href="/achievements"
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          sx={{
            borderColor: 'rgba(245, 240, 232, 0.2)',
            color: '#f5f0e8',
            textTransform: 'none',
            fontWeight: 600,
            px: 3,
            py: 1,
            '&:hover': {
              borderColor: 'rgba(245, 240, 232, 0.4)',
              bgcolor: 'rgba(245, 240, 232, 0.05)',
            },
          }}
        >
          Back to Achievements
        </Button>
      </Container>
    </Box>
  );
}
