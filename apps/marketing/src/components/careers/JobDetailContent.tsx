'use client';

import { useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Chip,
  Card,
  CardContent,
  Breadcrumbs,
  Fab,
} from '@neram/ui';
import Link from 'next/link';
import type { JobPosting, EmploymentType } from '@neram/database';
import JobApplicationForm from './JobApplicationForm';

function employmentTypeLabel(type: EmploymentType): string {
  const labels: Record<EmploymentType, string> = {
    full_time: 'Full-time',
    part_time: 'Part-time',
    contract: 'Contract',
    internship: 'Internship',
  };
  return labels[type] || type;
}

interface JobDetailContentProps {
  job: JobPosting;
}

export default function JobDetailContent({ job }: JobDetailContentProps) {
  const applyRef = useRef<HTMLDivElement>(null);

  const scrollToApply = () => {
    applyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box sx={{ pb: { xs: 10, md: 4 } }}>
      {/* Header with purple gradient */}
      <Box
        sx={{
          py: { xs: 4, md: 6 },
          background: 'linear-gradient(135deg, #7b1fa2 0%, #4a148c 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="md">
          {/* Breadcrumbs */}
          <Breadcrumbs
            separator=">"
            sx={{
              mb: 3,
              '& .MuiBreadcrumbs-separator': { color: 'rgba(255,255,255,0.6)' },
            }}
          >
            <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '0.875rem' }}>
              Home
            </Link>
            <Link href="/careers" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '0.875rem' }}>
              Careers
            </Link>
            <Typography variant="body2" sx={{ color: 'white' }}>
              {job.title}
            </Typography>
          </Breadcrumbs>

          {/* Title */}
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontWeight: 700,
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              mb: 2,
            }}
          >
            {job.title}
          </Typography>

          {/* Chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={job.department}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
            <Chip
              label={employmentTypeLabel(job.employment_type)}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
            <Chip
              label={job.location}
              size="small"
              sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
            />
            {job.experience_required && (
              <Chip
                label={job.experience_required}
                size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
              />
            )}
          </Box>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ mt: { xs: 3, md: 4 } }}>
        {/* College Students Banner */}
        {job.target_audience === 'college_students' && (
          <Box
            sx={{
              mb: 3,
              p: 2,
              borderRadius: 2,
              bgcolor: '#fff3e0',
              border: '1px solid #ffcc80',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <Typography sx={{ fontSize: '1.5rem' }}>&#x1F393;</Typography>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#e65100' }}>
                Ideal for College Students
              </Typography>
              <Typography variant="body2" color="text.secondary">
                This role is designed with college students in mind, offering flexible hours and valuable experience.
              </Typography>
            </Box>
          </Box>
        )}

        {/* Description */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
            About This Role
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ whiteSpace: 'pre-line', lineHeight: 1.7 }}
          >
            {job.description}
          </Typography>
        </Box>

        {/* Skills Required */}
        {job.skills_required && job.skills_required.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 600, mb: 2 }}>
              Skills Required
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {job.skills_required.map((skill, index) => (
                <Chip
                  key={index}
                  label={skill}
                  variant="outlined"
                  color="secondary"
                  sx={{ fontSize: '0.875rem' }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Schedule Details */}
        {job.schedule_details && (
          <Card sx={{ mb: 4, bgcolor: '#f3e5f5', border: '1px solid #ce93d8' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#7b1fa2' }}>
                Schedule Details
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                {job.schedule_details}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* Contract Terms */}
        {job.contract_terms && (
          <ContractTermsSection terms={job.contract_terms} />
        )}

        {/* Apply Section */}
        <Box ref={applyRef} sx={{ mt: 6, mb: 4 }}>
          <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 3, textAlign: 'center' }}>
            Apply for this Position
          </Typography>
          <JobApplicationForm jobPosting={job} />
        </Box>
      </Container>

      {/* Sticky Apply FAB for mobile */}
      <Fab
        color="secondary"
        variant="extended"
        onClick={scrollToApply}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          display: { xs: 'flex', md: 'none' },
          zIndex: 1000,
          minHeight: 48,
          px: 3,
        }}
      >
        Apply Now
      </Fab>
    </Box>
  );
}

function ContractTermsSection({ terms }: { terms: JobPosting['contract_terms'] }) {
  const hasContent =
    terms.min_duration_months ||
    terms.probation_period_months ||
    terms.early_termination_note ||
    terms.remuneration_note ||
    (terms.additional_terms && terms.additional_terms.length > 0);

  if (!hasContent) return null;

  return (
    <Card
      sx={{
        mb: 4,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Contract Terms
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {terms.min_duration_months && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 180 }}>
                Minimum Commitment:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {terms.min_duration_months} months
              </Typography>
            </Box>
          )}

          {terms.probation_period_months && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 180 }}>
                Probation Period:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {terms.probation_period_months} months
              </Typography>
            </Box>
          )}

          {terms.early_termination_note && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 180 }}>
                Early Termination:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {terms.early_termination_note}
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 180 }}>
              Remuneration:
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {terms.remuneration_note || 'Remuneration will be discussed during the interview process'}
            </Typography>
          </Box>

          {terms.additional_terms && terms.additional_terms.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Additional Terms:
              </Typography>
              <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                {terms.additional_terms.map((term, index) => (
                  <Box component="li" key={index} sx={{ mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {term}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
