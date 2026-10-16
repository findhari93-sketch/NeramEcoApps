'use client';

import Image from 'next/image';
import { Box, Typography } from '@neram/ui';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { Link } from '@/i18n/routing';
import { tokens as t, focusRing, hoverGoldBorder } from '@/design-system';
import { initials } from '@/design-system/PersonCard';

export interface ResultCardData {
  slug: string;
  student_name: string;
  photo_url: string | null;
  scorecard_watermarked_url?: string | null;
  exam_type: string;
  exam_year: number;
  score: number | null;
  max_score: number | null;
  rank: number | null;
  college_name: string | null;
  college_city?: string | null;
}

interface ResultCardProps {
  result: ResultCardData;
  /** Featured strip: fixed width for the horizontal scroller. */
  compact?: boolean;
}

export const EXAM_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  tnea: 'TNEA',
  other: 'Other',
};

/**
 * One published result: avatar (photo or initials on navy700), name, a mono
 * exam tag, the score in mono ink, rank and college. The whole card links to
 * the result page; hover turns the border gold.
 */
export default function ResultCard({ result, compact = false }: ResultCardProps) {
  const examLabel = EXAM_LABELS[result.exam_type] || result.exam_type;

  const scoreDisplay =
    result.score != null && result.max_score != null
      ? `${result.score}/${result.max_score}`
      : result.score != null
        ? `${result.score}`
        : null;
  const rankDisplay = result.rank != null ? `Rank #${result.rank}` : null;

  // Score prominently, rank as secondary. Without a score, rank leads.
  const primaryDisplay = scoreDisplay || rankDisplay;
  const secondaryDisplay = scoreDisplay && rankDisplay ? rankDisplay : null;

  const collegeLine = [result.college_name, result.college_city].filter(Boolean).join(', ');

  return (
    <Box
      component={Link}
      href={`/achievements/${result.slug}`}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        height: '100%',
        boxSizing: 'border-box',
        p: 2.5,
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        color: t.ink,
        textDecoration: 'none',
        ...(compact && { width: 260, flexShrink: 0, scrollSnapAlign: 'start' }),
        ...hoverGoldBorder,
        ...focusRing,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
        <Box
          aria-hidden
          sx={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
            bgcolor: t.navy700,
            color: t.paper,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
          }}
        >
          {result.photo_url ? (
            <Image src={result.photo_url} alt="" fill sizes="52px" style={{ objectFit: 'cover' }} />
          ) : (
            initials(result.student_name)
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h3"
            sx={{ m: 0, fontSize: '1rem', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}
          >
            {result.student_name}
          </Typography>
          <Typography
            component="span"
            sx={{ fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', color: t.gold800 }}
          >
            {examLabel} {result.exam_year}
          </Typography>
        </Box>
      </Box>

      {primaryDisplay && (
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography component="span" sx={{ fontFamily: t.fontMono, fontSize: '1.375rem', fontWeight: 700, lineHeight: 1.2 }}>
            {primaryDisplay}
          </Typography>
          {secondaryDisplay && (
            <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, color: t.inkMuted }}>
              {secondaryDisplay}
            </Typography>
          )}
        </Box>
      )}

      {collegeLine && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, color: t.inkMuted, mt: 'auto', pr: result.scorecard_watermarked_url ? 6 : 0 }}>
          <LocationOnOutlinedIcon aria-hidden sx={{ fontSize: 18, mt: '2px', flexShrink: 0 }} />
          <Typography component="span" sx={{ fontSize: '0.875rem', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
            {collegeLine}
          </Typography>
        </Box>
      )}

      {result.scorecard_watermarked_url && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            width: 40,
            height: 40,
            borderRadius: `${t.radius}px`,
            overflow: 'hidden',
            border: `1px solid ${t.line}`,
          }}
        >
          <Image src={result.scorecard_watermarked_url} alt="Scorecard" fill sizes="40px" style={{ objectFit: 'cover' }} />
        </Box>
      )}
    </Box>
  );
}
