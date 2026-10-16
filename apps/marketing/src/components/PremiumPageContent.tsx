'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { PageHero, Section, TopicCard, FeeCard, CtaBand, CtaButton, tokens as t } from '@/design-system';
import { COURSE_FEES } from '@/lib/fees';

const premiumFeatures = [
  {
    category: 'Learning Experience',
    features: [
      'Unlimited access to all courses',
      'HD quality video lectures',
      'Downloadable study materials',
      'Interactive live classes',
      'Recording of all live sessions',
    ],
  },
  {
    category: 'Personal Support',
    features: [
      'Dedicated mentor assignment',
      '24/7 doubt resolution',
      'Weekly 1-on-1 sessions',
      'Personalized study plan',
      'Progress tracking dashboard',
    ],
  },
  {
    category: 'Practice & Assessment',
    features: [
      'Unlimited mock tests',
      'Previous year papers with solutions',
      'Topic-wise practice tests',
      'All India test series',
      'Detailed performance analytics',
    ],
  },
  {
    category: 'Exclusive Benefits',
    features: [
      'Priority support response',
      'Early access to new features',
      'Certificate upon completion',
      'Job placement assistance',
      'Alumni network access',
    ],
  },
];

const CATEGORY_ICONS: Record<string, ReactNode> = {
  'Learning Experience': <OndemandVideoOutlinedIcon />,
  'Personal Support': <SupportAgentOutlinedIcon />,
  'Practice & Assessment': <QuizOutlinedIcon />,
  'Exclusive Benefits': <WorkspacePremiumOutlinedIcon />,
};

// What each plan lists on this page. Prices come from lib/fees.ts (the one
// source for fees), so this page can never disagree with /fees or the home page.
const PLAN_FEATURES: Record<string, string[]> = {
  'crash-course': ['Intensive NATA revision', '50+ mock tests', 'Daily drawing practice', 'Doubt clearing sessions', 'WhatsApp support'],
  '1-year-program': [
    'Complete NATA syllabus',
    'Daily drawing practice',
    '100+ mock tests',
    'Personal mentor assigned',
    'Recorded lectures',
    'Performance analytics',
    'Certificate included',
  ],
  '2-year-program': [
    'Everything in 1-Year Program',
    'Foundation + Advanced prep',
    'NATA & JEE Paper 2 coverage',
    '1-on-1 personal mentoring',
    'All study materials included',
    'Lifetime access to recordings',
  ],
};
const POPULAR = '1-year-program';

export default function PremiumPageContent() {
  return (
    <Box>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Premium' }]}
        eyebrow="Neram Classes Premium"
        title={
          <>
            Unlock Your <em>Full Potential</em>
          </>
        }
        lede="Get unlimited access to all courses, personal mentoring, and exclusive features designed to fast-track your success."
        actions={<CtaButton href="/apply">Get Premium Access</CtaButton>}
      />

      <Section
        id="premium-features"
        rule={false}
        header={{ eyebrow: "What's included", title: 'Premium Features', lede: 'Everything you need to excel in your exams' }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 2 }}>
          {premiumFeatures.map((section) => (
            <TopicCard key={section.category} icon={CATEGORY_ICONS[section.category]} title={section.category} items={section.features} />
          ))}
        </Box>
      </Section>

      <Section
        id="plans"
        tone="white"
        header={{ eyebrow: 'Plans', title: 'Choose Your Plan', lede: 'Flexible plans to suit your learning needs' }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 3, alignItems: 'stretch' }}>
          {COURSE_FEES.map((plan) => (
            <FeeCard
              key={plan.slug}
              component="article"
              title={plan.name}
              highlight={plan.slug === POPULAR}
              badge={plan.slug === POPULAR ? 'Most Popular' : undefined}
              label={plan.duration}
              price={`₹${plan.singlePaymentDisplay ?? plan.priceDisplay}`}
              priceNote={plan.singlePaymentDisplay ? `When paid at once, or ₹${plan.priceDisplay} in two parts` : 'Course fee'}
              features={PLAN_FEATURES[plan.slug] ?? plan.highlights}
              actions={
                <CtaButton variant={plan.slug === POPULAR ? 'primary' : 'outline'} fullWidth href="/apply">
                  Get Started
                </CtaButton>
              }
            />
          ))}
        </Box>
      </Section>

      <Section id="premium-voice" width="narrow" header={{ eyebrow: 'Student voices', title: 'What Premium Students Say' }}>
        <Box
          component="figure"
          sx={{ m: 0, borderLeft: `3px solid ${t.gold500}`, pl: { xs: 2.5, sm: 4 }, py: 1, display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Typography component="blockquote" sx={{ m: 0, fontSize: { xs: '1.125rem', sm: '1.375rem' }, lineHeight: 1.5, fontWeight: 500 }}>
            &quot;The premium membership was the best investment I made for my NATA preparation. The personal mentoring
            and unlimited mock tests helped me score AIR 45. Highly recommended for serious aspirants!&quot;
          </Typography>
          <Typography component="figcaption" sx={{ fontWeight: 700, color: t.gold800 }}>
            Ananya Sharma, NATA 2024 AIR 45
          </Typography>
        </Box>
      </Section>

      <CtaBand
        title="Start Your Premium Journey Today"
        lede="Join thousands of successful students who chose Premium"
        actions={
          <>
            <CtaButton href="/apply">Get Premium Now</CtaButton>
            <CtaButton variant="link" href="/fees" endIcon={<NorthEastIcon aria-hidden />}>
              See all fees
            </CtaButton>
          </>
        }
      />
    </Box>
  );
}
