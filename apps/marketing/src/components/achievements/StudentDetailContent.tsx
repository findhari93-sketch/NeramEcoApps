import Image from 'next/image';
import { Box, Typography } from '@neram/ui';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import type { StudentResult, StudentResultExamType } from '@neram/database';
import {
  CtaBand,
  CtaButton,
  PageHero,
  ReviewCard,
  Section,
  SectionHeader,
  tokens as t,
  type StatItem,
} from '@/design-system';

/** The public fields of a result. The page passes only these (never the unwatermarked scorecard). */
export type PublicStudentResult = Pick<
  StudentResult,
  | 'slug'
  | 'student_name'
  | 'photo_url'
  | 'scorecard_watermarked_url'
  | 'exam_type'
  | 'exam_year'
  | 'score'
  | 'max_score'
  | 'rank'
  | 'percentile'
  | 'college_name'
  | 'college_city'
  | 'course_name'
  | 'student_quote'
>;

interface StudentDetailContentProps {
  result: PublicStudentResult;
}

const EXAM_TYPE_LABELS: Record<StudentResultExamType, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  tnea: 'TNEA',
  other: 'Exam',
};

/**
 * One student's result (T8): dark hero with the name, exam and the real score,
 * rank and percentile as stats; the verified scorecard and the student's quote
 * on a light band; the closing CTA band. Server-rendered from the page's data.
 */
export default function StudentDetailContent({ result }: StudentDetailContentProps) {
  const examLabel = EXAM_TYPE_LABELS[result.exam_type] || 'Exam';
  const hasScore = result.score != null && result.max_score != null;
  const hasRank = result.rank != null;
  const hasScorecard = result.scorecard_watermarked_url != null;
  const hasQuote = result.student_quote != null && result.student_quote.trim().length > 0;

  const collegeLine = result.college_name
    ? `${result.college_name}${result.college_city ? `, ${result.college_city}` : ''}${result.course_name ? ` | ${result.course_name}` : ''}`
    : null;

  const stats: StatItem[] = [];
  if (hasScore) stats.push({ value: `${result.score}/${result.max_score}`, label: 'Score' });
  if (hasRank) stats.push({ value: hasScore ? result.rank : `AIR #${result.rank}`, label: 'All India Rank' });
  if (result.percentile != null) stats.push({ value: `${result.percentile}%`, label: 'Percentile' });

  return (
    <>
      <PageHero
        breadcrumb={[
          { name: 'Home', href: '/' },
          { name: 'Achievements', href: '/achievements' },
          { name: result.student_name },
        ]}
        eyebrow={`${examLabel} ${result.exam_year}`}
        title={result.student_name}
        lede={collegeLine ?? undefined}
        stats={stats.length > 0 ? stats : undefined}
        asideMin={260}
        aside={
          result.photo_url ? (
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                maxWidth: 280,
                aspectRatio: '1 / 1',
                mx: { xs: 0, md: 'auto' },
                borderRadius: `${t.radius}px`,
                overflow: 'hidden',
                border: `1px solid ${t.lineDark}`,
                bgcolor: t.navy800,
              }}
            >
              <Image
                src={result.photo_url}
                alt={result.student_name}
                fill
                sizes="280px"
                style={{ objectFit: 'cover' }}
                priority
              />
            </Box>
          ) : undefined
        }
        actions={
          <CtaButton variant="link" href="/achievements" startIcon={<ArrowBackOutlinedIcon aria-hidden />}>
            Back to All Results
          </CtaButton>
        }
      />

      {(hasScorecard || hasQuote) && (
        <Section width="article" gap={6}>
          {hasScorecard && (
            <Box component="section" aria-labelledby="scorecard-title" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <VerifiedOutlinedIcon aria-hidden sx={{ color: t.success, fontSize: 24 }} />
                <SectionHeader id="scorecard-title" title="Verified Scorecard" align="start" size="article" />
              </Box>
              <Box
                sx={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: 600,
                  borderRadius: `${t.radius}px`,
                  overflow: 'hidden',
                  border: `1px solid ${t.line}`,
                  bgcolor: t.surface,
                  touchAction: 'pinch-zoom',
                }}
              >
                <Image
                  src={result.scorecard_watermarked_url!}
                  alt={`${result.student_name} ${examLabel} ${result.exam_year} Scorecard`}
                  width={600}
                  height={800}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                  sizes="(max-width: 600px) 100vw, 600px"
                />
              </Box>
            </Box>
          )}

          {hasQuote && (
            <Box sx={{ maxWidth: 600 }}>
              <ReviewCard
                quote={<>&ldquo;{result.student_quote}&rdquo;</>}
                name={result.student_name}
                tag={`${examLabel} ${result.exam_year}`}
                meta={result.college_name ?? undefined}
                photo={result.photo_url}
              />
            </Box>
          )}
        </Section>
      )}

      <CtaBand
        eyebrow="Your turn"
        title="Want results like this?"
        lede="Start your journey today with expert coaching from Neram Classes."
        actions={
          <>
            <CtaButton href="/apply">Apply Now</CtaButton>
            <CtaButton variant="link" href="/tools">
              Explore Free Tools
            </CtaButton>
          </>
        }
      />

      {/* Sticky mobile CTA: one thumb-reach action while reading the result. */}
      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          px: 2,
          py: 1.5,
          bgcolor: t.navy900,
          borderTop: `1px solid ${t.goldRule}`,
          zIndex: 1200,
        }}
      >
        <CtaButton href="/apply" fullWidth>
          Apply Now
        </CtaButton>
      </Box>
      {/* Room for the sticky CTA so it never covers the footer. */}
      <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, height: 72, bgcolor: t.navy900 }} />
    </>
  );
}
