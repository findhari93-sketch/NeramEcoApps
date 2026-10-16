'use client';

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Box } from '@neram/ui';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import FunctionsOutlinedIcon from '@mui/icons-material/FunctionsOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import { Link } from '@/i18n/routing';
import {
  PageHero,
  StatStrip,
  AsideLayout,
  SectionHeader,
  TopicCard,
  CheckList,
  PersonCard,
  FeeCard,
  CtaButton,
  CtaBand,
  tokens as t,
  eyebrowSx,
} from '@/design-system';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';
import { coursesData } from '@/data/courses';
import { ORG_FACTS } from '@/lib/seo/facts';

interface CourseDetailContentProps {
  slug: string;
  locale: string;
}

/** A subject icon from the curriculum section title. */
function subjectIcon(title: string): ReactNode {
  if (/draw|sketch|design/i.test(title)) return <BrushOutlinedIcon />;
  if (/math/i.test(title)) return <FunctionsOutlinedIcon />;
  if (/aptitude|reason/i.test(title)) return <PsychologyOutlinedIcon />;
  return <LayersOutlinedIcon />;
}

const PHONE_DISPLAY = ORG_FACTS.phone.replace(/^\+91-?(\d{5})(\d{5})$/, '+91 $1 $2');

/** T1 Course detail: dark hero with facts, then main column + sticky fee aside. */
export default function CourseDetailContent({ slug }: CourseDetailContentProps) {
  const course = coursesData[slug];
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';

  if (!course) {
    notFound();
  }

  const batchSize = course.batchDetails.batchSize.match(/\d+/)?.[0];

  const primary = isEnrolled ? (
    <CtaButton variant="success" fullWidth onClick={goToApp} endIcon={<NorthEastIcon aria-hidden />}>
      Go to App
    </CtaButton>
  ) : (
    <CtaButton fullWidth href={`/apply?course=${slug}`}>
      Apply now
    </CtaButton>
  );

  return (
    <Box>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Courses', href: '/courses' }, { name: course.title }]}
        pills={[course.category, course.level]}
        title={course.title}
        lede={course.description}
      >
        <Box sx={{ mt: 1 }}>
          <StatStrip
            size="compact"
            items={[
              { value: course.duration, label: 'Duration' },
              { value: `₹${course.price}`, label: 'Fee' },
              ...(batchSize ? [{ value: `${batchSize} max`, label: 'Batch' }] : []),
            ]}
          />
        </Box>
      </PageHero>

      <AsideLayout
        aside={
          <FeeCard
            component="aside"
            sticky
            label="Course fee"
            price={`₹${course.price}`}
            priceNote={
              <Box
                component={Link}
                href="/fees"
                sx={{ color: t.ink, fontWeight: 600, textDecoration: 'underline', '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' } }}
              >
                See fees and payment options
              </Box>
            }
            facts={[
              { label: 'Batch size', value: course.batchDetails.batchSize },
              { label: 'Timing', value: course.batchDetails.timing },
              { label: 'Start date', value: course.batchDetails.startDate },
              { label: 'Mode', value: course.batchDetails.classType },
            ]}
            actions={
              <>
                {primary}
                <CtaButton variant="outline" size="md" fullWidth href="/demo-class" startIcon={<VideocamOutlinedIcon aria-hidden />} endIcon={null}>
                  Book a free demo first
                </CtaButton>
              </>
            }
            footnote={
              <>
                Questions? Call{' '}
                <Box component="a" href={`tel:${ORG_FACTS.phone.replace(/-/g, '')}`} sx={{ color: t.ink, fontWeight: 600 }}>
                  {PHONE_DISPLAY}
                </Box>
              </>
            }
          />
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box component="h2" sx={{ ...eyebrowSx }}>
            About this course
          </Box>
          <Box component="p" sx={{ m: 0, fontSize: '1.125rem', lineHeight: 1.65, maxWidth: 720, textWrap: 'pretty' }}>
            {course.longDescription}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <SectionHeader align="start" size="article" eyebrow="Curriculum" title="What you will study" />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 2 }}>
            {course.curriculum.map((section) => (
              <TopicCard key={section.title} icon={subjectIcon(section.title)} title={section.title} items={section.topics} />
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <SectionHeader align="start" size="article" eyebrow="What's included" title="Course features" />
          <CheckList items={course.features} />
        </Box>

        {course.faculty.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <SectionHeader align="start" size="article" eyebrow="Faculty" title="Expert faculty" />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 2 }}>
              {course.faculty.map((m) => (
                <PersonCard key={m.name} name={m.name} role={m.subject} detail={m.qualification} />
              ))}
            </Box>
          </Box>
        )}
      </AsideLayout>

      <CtaBand
        title="Not sure this is the right course?"
        lede="Sit in a free live class with an architect and ask everything."
        actions={
          <>
            <CtaButton href="/demo-class">Book your free demo</CtaButton>
            <CtaButton variant="link" href="/contact" endIcon={<NorthEastIcon aria-hidden />}>
              Talk to us
            </CtaButton>
          </>
        }
      />
    </Box>
  );
}
