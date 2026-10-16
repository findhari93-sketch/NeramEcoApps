/**
 * One published review on the /reviews wall (T8). Wraps the design-system
 * ReviewCard in an <article> (one per review, which the E2E suite looks for)
 * and adds the verified facts under the caption: rank or percentile, how they
 * studied, the Verified student mark, the college they joined, Featured.
 *
 * No 'use client' and no function props: the server page renders it for the
 * cached list, and the client filter layer renders it for filtered results.
 */

import { Box, Typography } from '@neram/ui';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { ReviewCard, tokens as t } from '@/design-system';
import type { PublicReview } from '@/lib/reviews/json-ld';
import { examLabel, isOptimizableImage } from '@/lib/reviews/rules';
import { resultLabel } from '@/lib/reviews/hub';

export interface ReviewWallCardLabels {
  /** "Joined {college}" with a literal {college} placeholder. */
  joinedTemplate: string;
  featured: string;
  verified: string;
  modes: Record<'online' | 'hybrid' | 'offline', string>;
}

export default function ReviewWallCard({ review, labels }: { review: PublicReview; labels: ReviewWallCardLabels }) {
  const tag = [examLabel(review.examType), review.year ? String(review.year) : ''].filter(Boolean).join(' ');
  const result = resultLabel(review);
  const mode = review.learningMode ? labels.modes[review.learningMode] : null;
  const facts = [result, mode].filter(Boolean).join(' · ');
  const hasMarks = !!review.isVerified || !!review.collegeAdmitted || review.isFeatured;

  return (
    <Box component="article" sx={{ breakInside: 'avoid' }}>
      <ReviewCard
        quote={review.body}
        name={review.displayName}
        meta={review.city || undefined}
        tag={tag || undefined}
        rating={review.rating}
        // next/image only takes our own storage URLs; anything else shows initials.
        photo={isOptimizableImage(review.photo) ? review.photo : null}
      >
        {(facts || hasMarks) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.875rem', lineHeight: 1.45 }}>
            {facts && (
              <Typography component="p" sx={{ m: 0, fontSize: 'inherit', fontWeight: 600, color: t.ink, overflowWrap: 'anywhere' }}>
                {facts}
              </Typography>
            )}
            {review.isVerified && (
              <Box component="p" sx={{ m: 0, display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 600, color: t.success }}>
                <VerifiedOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
                {labels.verified}
              </Box>
            )}
            {review.collegeAdmitted && (
              <Box component="p" sx={{ m: 0, display: 'flex', alignItems: 'flex-start', gap: 0.75, color: t.inkMuted, overflowWrap: 'anywhere' }}>
                <SchoolOutlinedIcon aria-hidden sx={{ fontSize: 18, color: t.gold800, mt: '1px', flexShrink: 0 }} />
                {labels.joinedTemplate.replace('{college}', review.collegeAdmitted)}
              </Box>
            )}
            {review.isFeatured && (
              <Typography
                component="p"
                sx={{ m: 0, fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.gold800 }}
              >
                {labels.featured}
              </Typography>
            )}
          </Box>
        )}
      </ReviewCard>
    </Box>
  );
}

/** Placeholder cards while filtered results load (same shape as a card). */
export function ReviewWallCardSkeleton() {
  return (
    <Box
      aria-hidden
      sx={{
        breakInside: 'avoid',
        mb: 2.5,
        p: 2.75,
        bgcolor: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: `${t.radius}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      {[40, 100, 92, 70].map((w, i) => (
        <Box key={i} sx={{ height: i === 0 ? 14 : 12, width: `${w}%`, borderRadius: `${t.radius}px`, bgcolor: t.line }} />
      ))}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', pt: 1.75, borderTop: `1px solid ${t.line}` }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: t.line, flexShrink: 0 }} />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box sx={{ height: 12, width: '50%', borderRadius: `${t.radius}px`, bgcolor: t.line }} />
          <Box sx={{ height: 10, width: '35%', borderRadius: `${t.radius}px`, bgcolor: t.line }} />
        </Box>
      </Box>
    </Box>
  );
}
