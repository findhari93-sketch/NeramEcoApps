'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Skeleton } from '@neram/ui';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import type { JobPosting, EmploymentType } from '@neram/database';
import {
  PageHero,
  Section,
  FeatureCard,
  CheckList,
  EmptyState,
  Pill,
  CtaButton,
  CtaBand,
  tokens as t,
} from '@/design-system';

const benefits = [
  { icon: <PaymentsOutlinedIcon />, title: 'Competitive Salary', desc: 'Industry-leading compensation packages' },
  { icon: <HealthAndSafetyOutlinedIcon />, title: 'Health Insurance', desc: 'Comprehensive health coverage for you and family' },
  { icon: <MenuBookOutlinedIcon />, title: 'Learning Budget', desc: 'Annual allowance for courses and certifications' },
  { icon: <HomeWorkOutlinedIcon />, title: 'Flexible Work', desc: 'Work from home options available' },
  { icon: <TrendingUpOutlinedIcon />, title: 'Growth Path', desc: 'Clear career progression opportunities' },
  { icon: <CelebrationOutlinedIcon />, title: 'Team Events', desc: 'Regular team outings and celebrations' },
];

const values = [
  { title: 'Student First', desc: 'Every decision we make prioritizes student success and learning outcomes.' },
  { title: 'Excellence', desc: 'We strive for excellence in teaching, content, and every aspect of our work.' },
  { title: 'Innovation', desc: 'We embrace new technologies and methods to enhance the learning experience.' },
  { title: 'Collaboration', desc: 'We work together as a team, supporting each other to achieve common goals.' },
];

type FilterType = 'all' | EmploymentType;

const filterLabels: Record<FilterType, string> = {
  all: 'All',
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
};

function employmentTypeLabel(type: EmploymentType): string {
  return filterLabels[type] || type;
}

const autoGrid = (min: number) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`,
  gap: 2,
});

const cardSx = {
  bgcolor: t.surface,
  border: `1px solid ${t.line}`,
  borderRadius: `${t.radius}px`,
  p: { xs: 2.5, sm: 3 },
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  height: '100%',
  boxSizing: 'border-box',
  color: t.ink,
} as const;

/** A small meta tag on a job card (department, location, type). */
function Tag({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        border: `1px solid ${strong ? t.ink : t.line}`,
        borderRadius: `${t.radiusPill}px`,
        px: 1.25,
        py: '3px',
        fontSize: '0.8125rem',
        fontWeight: strong ? 700 : 500,
        color: strong ? t.ink : t.inkMuted,
        lineHeight: 1.5,
      }}
    >
      {children}
    </Box>
  );
}

function JobCardSkeleton() {
  return (
    <Box sx={cardSx} aria-hidden>
      <Skeleton variant="text" width="70%" height={32} />
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Skeleton variant="rounded" width={80} height={24} />
        <Skeleton variant="rounded" width={100} height={24} />
        <Skeleton variant="rounded" width={70} height={24} />
      </Box>
      <Box>
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="60%" />
      </Box>
      <Skeleton variant="rounded" width="100%" height={48} />
    </Box>
  );
}

/** T9 company page: dark hero, values, benefits, openings, closing band. */
export default function CareersPageContent() {
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    async function fetchJobs() {
      try {
        setLoading(true);
        const res = await fetch('/api/careers');
        const json = await res.json();
        if (json.success) {
          setJobs(json.data);
        } else {
          setError(json.error || 'Failed to load jobs');
        }
      } catch {
        setError('Failed to load job postings');
      } finally {
        setLoading(false);
      }
    }
    fetchJobs();
  }, []);

  const filteredJobs = filter === 'all'
    ? jobs
    : jobs.filter((job) => job.employment_type === filter);

  // Determine which filter types actually have jobs
  const availableTypes = new Set(jobs.map((j) => j.employment_type));

  return (
    <Box>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Careers' }]}
        eyebrow="Careers"
        title="Shape the Future of Education"
        lede="Join Neram Classes and help thousands of students achieve their dream of becoming architects. We're building the best team in education."
        actions={<CtaButton href="#openings">View Open Positions</CtaButton>}
      />

      <Section
        id="values"
        rule={false}
        gap={3.5}
        header={{ align: 'start', title: 'Our Values', lede: 'What drives us every day' }}
      >
        <CheckList
          titleAs="h3"
          columnMin={420}
          items={values.map((value) => ({ title: value.title, body: value.desc }))}
        />
      </Section>

      <Section
        id="benefits"
        tone="white"
        gap={3.5}
        header={{ align: 'start', title: 'Why Work With Us', lede: 'We take care of our team' }}
      >
        <Box sx={autoGrid(300)}>
          {benefits.map((benefit) => (
            <FeatureCard key={benefit.title} icon={benefit.icon} title={benefit.title} body={benefit.desc} />
          ))}
        </Box>
      </Section>

      <Section
        id="openings"
        gap={3.5}
        header={{ align: 'start', title: 'Open Positions', lede: 'Find your next opportunity' }}
        sx={{ scrollMarginTop: { xs: 56, md: 64 } }}
      >
        {/* Filter pills */}
        {!loading && jobs.length > 0 && (
          <Box role="group" aria-label="Filter by employment type" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Pill selected={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </Pill>
            {(['full_time', 'part_time', 'contract', 'internship'] as EmploymentType[]).map((type) =>
              availableTypes.has(type) ? (
                <Pill key={type} selected={filter === type} onClick={() => setFilter(type)}>
                  {filterLabels[type]}
                </Pill>
              ) : null
            )}
          </Box>
        )}

        {/* Loading skeletons */}
        {loading && (
          <Box sx={autoGrid(420)} aria-busy="true" aria-label="Loading open positions">
            {[1, 2, 3, 4].map((i) => (
              <JobCardSkeleton key={i} />
            ))}
          </Box>
        )}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<ErrorOutlineOutlinedIcon />}
            title={error}
            action={
              <CtaButton variant="outline" onClick={() => window.location.reload()} endIcon={null}>
                Retry
              </CtaButton>
            }
          />
        )}

        {/* No jobs */}
        {!loading && !error && filteredJobs.length === 0 && (
          <EmptyState
            icon={<WorkOutlineOutlinedIcon />}
            title={
              filter !== 'all'
                ? `No ${filterLabels[filter].toLowerCase()} positions available at the moment.`
                : 'No open positions at the moment.'
            }
            body="Send your resume to careers@neramclasses.com and we'll keep you in mind for future opportunities."
          />
        )}

        {/* Job cards */}
        {!loading && !error && filteredJobs.length > 0 && (
          <Box sx={autoGrid(420)}>
            {filteredJobs.map((job) => (
              <Box key={job.id} component="article" sx={{ ...cardSx, transition: 'border-color 150ms ease', '&:hover': { borderColor: t.gold500 } }}>
                <Typography component="h3" sx={{ m: 0, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3 }}>
                  {job.title}
                </Typography>

                <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Tag strong>{job.department}</Tag>
                  <Tag>{job.location}</Tag>
                  <Tag>{employmentTypeLabel(job.employment_type)}</Tag>
                  {job.experience_required && <Tag>{job.experience_required}</Tag>}
                  {job.target_audience === 'college_students' && <Tag strong>Ideal for College Students</Tag>}
                </Box>

                <Typography component="p" sx={{ m: 0, flex: 1, fontSize: '1rem', lineHeight: 1.55, color: t.inkMuted }}>
                  {job.description.length > 150
                    ? `${job.description.substring(0, 150)}...`
                    : job.description}
                </Typography>

                <CtaButton variant="outline" href={`/careers/${job.slug}`} fullWidth>
                  View Details & Apply
                </CtaButton>
              </Box>
            ))}
          </Box>
        )}
      </Section>

      <CtaBand
        eyebrow="Careers"
        title="Don't See a Perfect Fit?"
        lede="We're always looking for talented individuals. Send us your resume and we'll keep you in mind for future opportunities."
        actions={<CtaButton href="mailto:careers@neramclasses.com">Send Your Resume</CtaButton>}
      />
    </Box>
  );
}
