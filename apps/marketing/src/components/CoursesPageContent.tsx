'use client';

import { useState } from 'react';
import { Box } from '@neram/ui';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import { PageHero, Section, CourseCard, CtaBand, CtaButton, Pill } from '@/design-system';

// Courses offered by Neram Classes
const courses = [
  {
    id: 1,
    slug: 'architecture-entrance-year-long',
    title: 'Architecture Entrance - Year Long',
    description:
      'Comprehensive NATA & JEE Paper 2 (B.Arch/B.Planning) preparation with IIT/NIT architect alumni faculty. Complete coverage of Drawing, Aptitude, and Mathematics.',
    duration: '1 Year',
    level: 'All Levels',
    category: 'Architecture Entrance',
    image: '/images/courses/architecture-year-long.jpg',
    features: [
      'NATA + JEE Paper 2',
      'IIT/NIT Alumni Faculty',
      'Drawing & Aptitude',
      'Mock Tests',
    ],
  },
  {
    id: 2,
    slug: 'architecture-entrance-crash-course',
    title: 'Architecture Entrance - Crash Course',
    description:
      'Intensive NATA & JEE Paper 2 crash course for quick preparation. Focused revision, practice tests, and exam strategies.',
    duration: '2-3 Months',
    level: 'All Levels',
    category: 'Architecture Entrance',
    image: '/images/courses/architecture-crash.svg',
    features: [
      'NATA + JEE Paper 2',
      'Intensive Training',
      'Daily Practice',
      'Exam Strategies',
    ],
  },
  {
    id: 3,
    slug: 'revit-training',
    title: 'Revit Architecture Training',
    description:
      'Professional Autodesk Revit training for architects and designers. BIM modeling and documentation.',
    duration: '3 Months',
    level: 'Beginner to Advanced',
    category: 'Software Training',
    image: '/images/courses/revit.svg',
    features: [
      'Hands-on Projects',
      'BIM Concepts',
      'Certified Training',
      'Job Assistance',
    ],
  },
  {
    id: 4,
    slug: 'autocad-training',
    title: 'AutoCAD Training',
    description:
      '2D and 3D AutoCAD training for architecture and design professionals.',
    duration: '2 Months',
    level: 'Beginner',
    category: 'Software Training',
    // No artwork yet: the card shows the navy blueprint tile.
    image: undefined,
    features: [
      '2D Drafting',
      '3D Modeling',
      'Industry Projects',
      'Certificate',
    ],
  },
  {
    id: 5,
    slug: 'sketchup-training',
    title: 'SketchUp Training',
    description:
      'Learn SketchUp for architectural visualization and 3D modeling.',
    duration: '1 Month',
    level: 'Beginner',
    category: 'Software Training',
    // No artwork yet: the card shows the navy blueprint tile.
    image: undefined,
    features: [
      '3D Modeling',
      'Rendering',
      'Plugins',
      'Portfolio Projects',
    ],
  },
  {
    id: 6,
    slug: 'nata-self-learning-app',
    title: 'NATA Self-Learning App',
    description:
      'AI-powered NATA & JEE Paper 2 preparation app with personalized learning paths, practice tests, and progress tracking.',
    duration: 'Self-paced',
    level: 'All Levels',
    category: 'Digital Learning',
    // No artwork yet: the card shows the navy blueprint tile.
    image: undefined,
    features: [
      'AI-Powered',
      'Practice Tests',
      'Progress Tracking',
      'Mobile Access',
    ],
  },
];

// Categories for filtering
const categories = [
  'All',
  'Architecture Entrance',
  'Software Training',
  'Digital Learning',
] as const;

export default function CoursesPageContent() {
  const [category, setCategory] = useState<(typeof categories)[number]>('All');
  const shown = category === 'All' ? courses : courses.filter((c) => c.category === category);

  return (
    <Box>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Courses' }]}
        eyebrow="Courses"
        title="Our Courses"
        lede="Choose from our wide range of courses designed to help you achieve your academic goals"
      />

      <Section id="courses" rule={false} gap={4}>
        <Box role="group" aria-label="Filter by category" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {categories.map((c) => (
            <Pill key={c} selected={c === category} onClick={() => setCategory(c)}>
              {c}
            </Pill>
          ))}
        </Box>
        <Box
          aria-live="polite"
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 3 }}
        >
          {shown.map((course) => (
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

      <CtaBand
        eyebrow="Talk to us"
        title="Can't Find What You're Looking For?"
        lede="Contact us to discuss custom courses tailored to your needs"
        actions={
          <>
            <CtaButton href="/contact">Contact us</CtaButton>
            <CtaButton variant="link" href="/demo-class" endIcon={<NorthEastIcon aria-hidden />}>
              Book a free demo
            </CtaButton>
          </>
        }
      />
    </Box>
  );
}
