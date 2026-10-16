'use client';

import { Box } from '@neram/ui';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import CoPresentOutlinedIcon from '@mui/icons-material/CoPresentOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { PageHero, Section, ProgramCard, FeatureCard, CtaBand, CtaButton } from '@/design-system';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';

const coachingPrograms = [
  {
    id: 'architecture-year-long',
    title: 'Architecture Entrance - Year Long',
    subtitle: 'NATA + JEE Paper 2 (B.Arch/B.Planning)',
    description: 'Comprehensive year-long preparation for NATA and JEE Paper 2 with IIT/NIT architect alumni faculty.',
    features: [
      'Drawing & Sketching Masterclass',
      'Mathematics & Logical Reasoning',
      'General Aptitude Training',
      '500+ Practice Questions',
    ],
    duration: '1 Year',
    mode: ['Online', 'Offline'],
    slug: 'architecture-entrance-year-long',
    highlight: true,
  },
  {
    id: 'architecture-crash',
    title: 'Architecture Entrance - Crash Course',
    subtitle: 'NATA + JEE Paper 2 Intensive',
    description: 'Intensive crash course for NATA and JEE Paper 2. Perfect for quick revision and last-minute preparation.',
    features: ['Focused Revision', 'Daily Practice Sessions', 'Exam Strategies', 'Previous Year Analysis'],
    duration: '2-3 Months',
    mode: ['Online', 'Offline'],
    slug: 'architecture-entrance-crash-course',
    highlight: true,
  },
  {
    id: 'revit',
    title: 'Revit Architecture Training',
    subtitle: 'Professional BIM Software',
    description: 'Industry-focused Autodesk Revit training for architects and designers. Learn BIM modeling and documentation.',
    features: ['BIM Fundamentals', 'Architectural Modeling', 'Documentation & Sheets', 'Rendering & Visualization'],
    duration: '3 Months',
    mode: ['Online', 'Offline'],
    slug: 'revit-training',
    highlight: false,
  },
  {
    id: 'autocad',
    title: 'AutoCAD Training',
    subtitle: '2D & 3D Drafting',
    description: 'Complete AutoCAD training covering 2D drafting and 3D modeling for architecture professionals.',
    features: ['2D Drafting Basics', '3D Modeling', 'Layouts & Plotting', 'Industry Standards'],
    duration: '2 Months',
    mode: ['Online', 'Offline'],
    slug: 'autocad-training',
    highlight: false,
  },
];

const stats = [
  { value: '1,000+', label: 'Students Taught' },
  { value: 'AIR 1', label: 'JEE B.Arch 2024' },
  { value: '10', label: 'Classrooms' },
  { value: '10+', label: 'Years Teaching' },
];

const reasons = [
  { icon: <CoPresentOutlinedIcon />, title: 'Expert Faculty', desc: 'Learn from IIT/NIT alumni and industry experts with 10+ years of teaching experience.' },
  { icon: <MenuBookOutlinedIcon />, title: 'Comprehensive Material', desc: 'Well-researched study material covering entire syllabus with practice questions.' },
  { icon: <TrackChangesOutlinedIcon />, title: 'Result Oriented', desc: 'Proven track record with thousands of successful students every year.' },
  { icon: <SupportAgentOutlinedIcon />, title: 'Personal Attention', desc: 'Small batch sizes ensuring individual attention and doubt resolution.' },
  { icon: <DevicesOutlinedIcon />, title: 'Online & Offline', desc: 'Flexible learning options: attend classes from anywhere or visit our centers.' },
  { icon: <InsightsOutlinedIcon />, title: 'Regular Assessment', desc: 'Weekly tests and mock exams to track progress and identify improvement areas.' },
];

/** The primary action: Apply Now, or Go to App (green) once enrolled. */
function PrimaryAction({ isEnrolled, goToApp }: { isEnrolled: boolean; goToApp: () => void }) {
  return isEnrolled ? (
    <CtaButton variant="success" onClick={goToApp} endIcon={<NorthEastIcon aria-hidden />}>
      Go to App
    </CtaButton>
  ) : (
    <CtaButton href="/apply">Apply Now</CtaButton>
  );
}

export default function CoachingPageContent() {
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';

  return (
    <Box>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Coaching' }]}
        eyebrow="NATA · JEE Paper 2 · B.Arch"
        title={
          <>
            Transform Your Future with <em>Expert Coaching</em>
          </>
        }
        lede="Join India's premier coaching institute for NATA, JEE Paper 2, and Architecture entrance exams. Learn from IIT/NIT architect alumni, achieve the best."
        actions={
          <>
            <PrimaryAction isEnrolled={isEnrolled} goToApp={goToApp} />
            <CtaButton variant="outline" href="/contact" endIcon={null}>
              Book Free Counseling
            </CtaButton>
          </>
        }
        stats={stats}
      />

      <Section
        id="programs"
        rule={false}
        header={{
          eyebrow: 'Our programs',
          title: 'Our Coaching Programs',
          lede: 'Specialized programs designed to help you achieve your academic goals',
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 3 }}>
          {coachingPrograms.map((program) => (
            <ProgramCard
              key={program.id}
              title={program.title}
              subtitle={program.subtitle}
              description={program.description}
              chips={[program.duration, ...program.mode]}
              features={program.features}
              highlight={program.highlight}
              cta={{ label: `Explore ${program.title}`, href: `/courses/${program.slug}` }}
            />
          ))}
        </Box>
      </Section>

      <Section id="why-neram" tone="white" header={{ eyebrow: 'Why Neram', title: 'Why Choose Neram Classes?' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 3 }}>
          {reasons.map((r) => (
            <FeatureCard key={r.title} icon={r.icon} title={r.title} body={r.desc} />
          ))}
        </Box>
      </Section>

      <CtaBand
        title="Ready to Start Your Preparation?"
        lede="Join Neram Classes today and take the first step towards your dream career."
        actions={
          <>
            <PrimaryAction isEnrolled={isEnrolled} goToApp={goToApp} />
            <CtaButton variant="link" href="/contact" endIcon={<NorthEastIcon aria-hidden />}>
              Contact Us
            </CtaButton>
          </>
        }
      />
    </Box>
  );
}
