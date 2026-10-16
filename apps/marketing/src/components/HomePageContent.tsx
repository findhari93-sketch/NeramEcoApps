'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Box } from '@neram/ui';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { NewHeroSection } from '@/components/hero';
import { Section, Surface, CourseCard, ToolCard, CtaButton, tokens } from '@/design-system';
import { APP_URL } from '@/lib/seo/constants';
import type { Testimonial } from '@/components/ui/testimonials-columns';
import type { AskSeniorsEvent, AskSeniorsCollege } from '@neram/database';

// Lazy-load below-fold components to reduce initial JS bundle
const YouTubeSection = dynamic(() => import('@/components/YouTubeSection'), { ssr: false });
const AskSeniorsSection = dynamic(
  () => import('./ask-seniors/AskSeniorsSection'),
  { ssr: false }
);
const AnnouncementsSection = dynamic(
  () => import('@/components/marketing-content').then((mod) => ({ default: mod.AnnouncementsSection })),
  { ssr: false }
);
const SocialProofSection = dynamic(
  () => import('@/components/social-proof').then((mod) => ({ default: mod.SocialProofSection })),
  { ssr: false }
);
const TestimonialsColumn = dynamic(
  () => import('@/components/ui/testimonials-columns').then((mod) => ({ default: mod.TestimonialsColumn })),
  { ssr: false }
);
const StudentResultsTeaser = dynamic(
  () => import('@/components/achievements/StudentResultsTeaser'),
  { ssr: false }
);

// Featured courses offered by Neram Classes
const featuredCourses = [
  {
    id: 1,
    slug: 'architecture-entrance-year-long',
    title: 'Architecture Entrance - Year Long',
    description: 'Comprehensive NATA & JEE Paper 2 preparation with IIT/NIT architect alumni faculty',
    duration: '1 Year',
    level: 'All Levels',
    image: '/images/courses/architecture-year-long.jpg',
  },
  {
    id: 2,
    slug: 'architecture-entrance-crash-course',
    title: 'Architecture Entrance - Crash Course',
    description: 'Intensive NATA & JEE Paper 2 crash course for quick preparation',
    duration: '2-3 Months',
    level: 'All Levels',
    image: '/images/courses/architecture-crash.svg',
  },
  {
    id: 3,
    slug: 'revit-training',
    title: 'Revit Architecture Training',
    description: 'Professional Autodesk Revit training for architects and designers',
    duration: '3 Months',
    level: 'Beginner to Advanced',
    image: '/images/courses/revit.svg',
  },
];

// Learning tools: the public /tools/* pages on this site (the same scheme the
// hero badges use; each page hands off to the app).
const tools = [
  {
    name: 'Cutoff Calculator',
    description: 'Calculate your expected NATA cutoff rank based on score',
    icon: <CalculateOutlinedIcon />,
    href: '/tools/cutoff-calculator',
  },
  {
    name: 'College Predictor',
    description: 'Find architecture colleges based on your expected rank',
    icon: <SchoolOutlinedIcon />,
    href: '/tools/college-predictor',
  },
  {
    name: 'Exam Center Locator',
    description: 'Find NATA exam centers near you',
    icon: <LocationOnOutlinedIcon />,
    href: '/tools/exam-centers',
  },
];

/** Map DB testimonial format to the component's expected shape. */
function mapDbTestimonial(t: {
  content: Record<string, string>;
  student_photo: string | null;
  student_name: string;
  exam_type: string;
  year: number;
  college_admitted: string | null;
  city: string;
}): Testimonial {
  return {
    text: t.content?.en || t.content?.ta || Object.values(t.content || {})[0] || '',
    image: t.student_photo || '/images/placeholder-avatar.svg',
    name: t.student_name,
    role: `${t.exam_type.replace(/_/g, ' ')} ${t.year} - ${t.college_admitted || t.city}`,
  };
}

interface HomePageContentProps {
  askSeniorsEvent?: AskSeniorsEvent | null;
  askSeniorsColleges?: AskSeniorsCollege[];
}

export default function HomePageContent({ askSeniorsEvent, askSeniorsColleges }: HomePageContentProps) {
  // Real reviews only. No placeholder people while it loads: the section stays
  // hidden until there is something true to show.
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/testimonials?homepage=true')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.success && Array.isArray(json.data) && json.data.length > 0) {
          setTestimonials(json.data.map(mapDbTestimonial));
        }
      })
      .catch(() => {
        // No reviews to show; the section stays hidden.
      });
    return () => { cancelled = true; };
  }, []);

  const firstColumn = testimonials.slice(0, Math.ceil(testimonials.length / 3));
  const secondColumn = testimonials.slice(
    Math.ceil(testimonials.length / 3),
    Math.ceil((testimonials.length * 2) / 3)
  );
  const thirdColumn = testimonials.slice(Math.ceil((testimonials.length * 2) / 3));

  return (
    <Box>
      <NewHeroSection />

      {/* Light body: what we teach, then the free tools */}
      <Section
        id="featured-courses"
        rule={false}
        header={{
          eyebrow: 'Our programs',
          title: 'Featured Courses',
          lede: "Expert-led programs designed to get you into India's top architecture colleges",
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 3 }}>
          {featuredCourses.map((course) => (
            <CourseCard
              key={course.id}
              title={course.title}
              description={course.description}
              image={course.image}
              badge={course.level}
              meta={{ label: 'Duration', value: course.duration }}
              cta={{ label: 'Explore course', href: `/courses/${course.slug}` }}
            />
          ))}
        </Box>
      </Section>

      <Section
        id="learning-tools"
        tone="white"
        header={{ eyebrow: 'Free tools', title: 'Learning Tools', lede: 'Powerful tools to enhance your learning experience', ledeWidth: 520 }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 3 }}>
          {tools.map((tool) => (
            <ToolCard key={tool.href} href={tool.href} icon={tool.icon} title={tool.name} body={tool.description} />
          ))}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <CtaButton variant="navy" href={APP_URL}>
            Try Our Free App
          </CtaButton>
        </Box>
      </Section>

      {/* Dark run: news, proof and community. These sections are built for the
          dark surface and load lazily (each renders nothing until it has data),
          so they share one band, with a hairline between the ones that render. */}
      <Surface
        tone="dark"
        rule
        sx={{ '& > * + *': { borderTop: `1px solid ${tokens.lineDark}` } }}
      >
        <AnnouncementsSection />

        {testimonials.length > 0 && (
          <Section
            id="student-voices"
            tone="dark"
            rule={false}
            header={{ eyebrow: 'Student voices', title: 'What Our Students Say', lede: 'Success stories from our alumni', ledeWidth: 480 }}
          >
            <div
              className="flex justify-center gap-6"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
                maxHeight: 740,
                overflow: 'hidden',
              }}
            >
              <TestimonialsColumn testimonials={firstColumn} duration={15} />
              <TestimonialsColumn testimonials={secondColumn} className="hidden md:block" duration={19} />
              <TestimonialsColumn testimonials={thirdColumn} className="hidden lg:block" duration={17} />
            </div>
          </Section>
        )}

        <StudentResultsTeaser />

        {askSeniorsEvent && askSeniorsColleges && askSeniorsColleges.length > 0 && (
          <AskSeniorsSection event={askSeniorsEvent} colleges={askSeniorsColleges} />
        )}

        <SocialProofSection />

        <YouTubeSection />
      </Surface>

      {/* The light SEO band and the closing CtaBand are rendered by the page (server). */}
    </Box>
  );
}
