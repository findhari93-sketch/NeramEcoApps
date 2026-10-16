'use client';

import { useTranslations } from 'next-intl';
import { Box, Typography } from '@neram/ui';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import {
  CtaBand,
  CtaButton,
  PageHero,
  ReviewCard,
  ReviewWall,
  Section,
  tokens as t,
} from '@/design-system';
import { examLabel } from '@/lib/reviews/rules';
import type { PublicReview } from '@/lib/reviews/json-ld';

// Founder-confirmed proof points only (lib/seo/facts.ts PROOF_POINTS).
const stats = [
  { value: '1,000+', label: 'Students Taught' },
  { value: 'AIR 1', label: 'JEE B.Arch 2024' },
  { value: '10+', label: 'Years' },
];

const topColleges = [
  'IIT Kharagpur',
  'IIT Roorkee',
  'NIT Trichy',
  'SPA Delhi',
  'SPA Bhopal',
  'CEPT University',
  'JJ College of Architecture',
  'Chandigarh College of Architecture',
  'BIT Mesra',
  'MNIT Jaipur',
  'NIT Calicut',
  'Anna University',
];

/**
 * Stories come from published reviews that name the college the student joined
 * (consent and moderation already passed). The block is hidden when there are none.
 */
export default function AlumniPageContent({ stories = [] }: { stories?: PublicReview[]; reviewsHref?: string }) {
  const tStories = useTranslations('alumniStories');
  const tr = useTranslations('reviews');
  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Alumni' }]}
        eyebrow="Student voices"
        title="Our Success Stories"
        lede="Meet the achievers who turned their dreams into reality with Neram Classes. Our alumni are now shaping the future of architecture across India and beyond."
        stats={stats}
      />

      {/* Success stories: published data only */}
      {stories.length > 0 && (
        <Section
          id="alumni-stories"
          header={{ title: tStories('title'), lede: tStories('subtitle') }}
        >
          <ReviewWall>
            {stories.map((story) => {
              const exam = [examLabel(story.examType), story.year ? String(story.year) : ''].filter(Boolean).join(' ');
              const meta = [story.city, story.collegeAdmitted ? tr('joined', { college: story.collegeAdmitted }) : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <ReviewCard
                  key={story.id}
                  quote={story.body}
                  name={story.displayName}
                  rating={story.rating}
                  tag={exam || undefined}
                  meta={meta || undefined}
                  photo={story.photo}
                />
              );
            })}
          </ReviewWall>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <CtaButton variant="outline" href="/reviews">
              {tStories('readAll')}
            </CtaButton>
          </Box>
        </Section>
      )}

      {/* Top colleges */}
      <Section
        tone="white"
        id="top-colleges"
        header={{
          eyebrow: 'Colleges',
          title: 'Where Our Students Go',
          lede: 'Top architecture colleges where our alumni are studying',
        }}
      >
        <Box
          component="ul"
          sx={{
            m: 0,
            p: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))',
            gap: 1.5,
          }}
        >
          {topColleges.map((college) => (
            <Box
              component="li"
              key={college}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                minHeight: 56,
                px: 2,
                py: 1.25,
                boxSizing: 'border-box',
                bgcolor: t.ground,
                border: `1px solid ${t.line}`,
                borderRadius: `${t.radius}px`,
              }}
            >
              <AccountBalanceOutlinedIcon aria-hidden sx={{ fontSize: 22, color: t.gold800, flexShrink: 0 }} />
              <Typography component="span" sx={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.35 }}>
                {college}
              </Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <CtaBand
        eyebrow="Your turn"
        title="Ready to Write Your Success Story?"
        lede="Join the Neram Classes family and become part of our growing alumni network."
        actions={
          <>
            <CtaButton href="/apply">Start Your Journey</CtaButton>
            <CtaButton variant="link" href="/contact">
              Connect with Alumni
            </CtaButton>
          </>
        }
      />
    </>
  );
}
