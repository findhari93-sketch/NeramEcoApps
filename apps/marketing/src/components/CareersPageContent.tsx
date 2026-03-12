'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Skeleton,
} from '@neram/ui';
import Link from 'next/link';
import type { JobPosting, EmploymentType } from '@neram/database';

const benefits = [
  { icon: '\uD83D\uDCB0', title: 'Competitive Salary', desc: 'Industry-leading compensation packages' },
  { icon: '\uD83C\uDFE5', title: 'Health Insurance', desc: 'Comprehensive health coverage for you and family' },
  { icon: '\uD83D\uDCDA', title: 'Learning Budget', desc: 'Annual allowance for courses and certifications' },
  { icon: '\uD83C\uDFE0', title: 'Flexible Work', desc: 'Work from home options available' },
  { icon: '\uD83C\uDFAF', title: 'Growth Path', desc: 'Clear career progression opportunities' },
  { icon: '\uD83C\uDF89', title: 'Team Events', desc: 'Regular team outings and celebrations' },
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

function JobCardSkeleton() {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1, p: { xs: 3, md: 4 } }}>
        <Skeleton variant="text" width="70%" height={32} sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Skeleton variant="rounded" width={80} height={24} />
          <Skeleton variant="rounded" width={100} height={24} />
          <Skeleton variant="rounded" width={70} height={24} />
        </Box>
        <Skeleton variant="text" width="100%" />
        <Skeleton variant="text" width="90%" />
        <Skeleton variant="text" width="60%" sx={{ mb: 2 }} />
        <Skeleton variant="rounded" width="100%" height={40} />
      </CardContent>
    </Card>
  );
}

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
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          background: 'linear-gradient(135deg, #7b1fa2 0%, #4a148c 100%)',
          color: 'white',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
                Shape the Future of Education
              </Typography>
              <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
                Join Neram Classes and help thousands of students achieve their dream of becoming architects.
                We&apos;re building the best team in education.
              </Typography>
              <Button
                variant="contained"
                size="large"
                href="#openings"
                sx={{ bgcolor: 'white', color: 'secondary.main', '&:hover': { bgcolor: 'grey.100' } }}
              >
                View Open Positions
              </Button>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Our Values Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Our Values
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            What drives us every day
          </Typography>

          <Grid container spacing={4}>
            {values.map((value, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', textAlign: 'center', p: 3 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: 'secondary.main' }}>
                    {value.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {value.desc}
                  </Typography>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Benefits Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Why Work With Us
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            We take care of our team
          </Typography>

          <Grid container spacing={3}>
            {benefits.map((benefit, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Typography variant="h3">{benefit.icon}</Typography>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                      {benefit.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {benefit.desc}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Open Positions Section */}
      <Box id="openings" sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Open Positions
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 4 }}>
            Find your next opportunity
          </Typography>

          {/* Filter Chips */}
          {!loading && jobs.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap', mb: 4 }}>
              <Chip
                label="All"
                color={filter === 'all' ? 'secondary' : 'default'}
                variant={filter === 'all' ? 'filled' : 'outlined'}
                onClick={() => setFilter('all')}
                sx={{ minHeight: 40, cursor: 'pointer' }}
              />
              {(['full_time', 'part_time', 'contract', 'internship'] as EmploymentType[]).map((type) =>
                availableTypes.has(type) ? (
                  <Chip
                    key={type}
                    label={filterLabels[type]}
                    color={filter === type ? 'secondary' : 'default'}
                    variant={filter === type ? 'filled' : 'outlined'}
                    onClick={() => setFilter(type)}
                    sx={{ minHeight: 40, cursor: 'pointer' }}
                  />
                ) : null
              )}
            </Box>
          )}

          {/* Loading Skeletons */}
          {loading && (
            <Grid container spacing={4}>
              {[1, 2, 3, 4].map((i) => (
                <Grid item xs={12} md={6} key={i}>
                  <JobCardSkeleton />
                </Grid>
              ))}
            </Grid>
          )}

          {/* Error */}
          {!loading && error && (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
              <Button variant="outlined" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </Box>
          )}

          {/* No Jobs */}
          {!loading && !error && filteredJobs.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                {filter !== 'all'
                  ? `No ${filterLabels[filter].toLowerCase()} positions available at the moment.`
                  : 'No open positions at the moment.'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Send your resume to careers@neramclasses.com and we&apos;ll keep you in mind for future opportunities.
              </Typography>
            </Box>
          )}

          {/* Job Cards */}
          {!loading && !error && filteredJobs.length > 0 && (
            <Grid container spacing={4}>
              {filteredJobs.map((job) => (
                <Grid item xs={12} md={6} key={job.id}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 6 } }}>
                    <CardContent sx={{ flexGrow: 1, p: { xs: 3, md: 4 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Typography variant="h5" sx={{ fontWeight: 600 }}>
                          {job.title}
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                        <Chip label={job.department} size="small" color="secondary" />
                        <Chip label={job.location} size="small" variant="outlined" />
                        <Chip label={employmentTypeLabel(job.employment_type)} size="small" variant="outlined" />
                        {job.experience_required && (
                          <Chip label={job.experience_required} size="small" variant="outlined" />
                        )}
                        {job.target_audience === 'college_students' && (
                          <Chip
                            label="Ideal for College Students"
                            size="small"
                            sx={{
                              bgcolor: '#fff3e0',
                              color: '#e65100',
                              fontWeight: 600,
                              border: '1px solid #ffcc80',
                            }}
                          />
                        )}
                      </Box>

                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {job.description.length > 150
                          ? `${job.description.substring(0, 150)}...`
                          : job.description}
                      </Typography>

                      <Button
                        component={Link}
                        href={`/careers/${job.slug}`}
                        variant="outlined"
                        color="secondary"
                        fullWidth
                        sx={{ mt: 'auto', minHeight: 48 }}
                      >
                        View Details & Apply
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #7b1fa2 0%, #4a148c 100%)',
          color: 'white',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Don&apos;t See a Perfect Fit?
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            We&apos;re always looking for talented individuals. Send us your resume and we&apos;ll keep you in mind for future opportunities.
          </Typography>
          <Button
            variant="contained"
            size="large"
            href="mailto:careers@neramclasses.com"
            sx={{ bgcolor: 'white', color: 'secondary.main', '&:hover': { bgcolor: 'grey.100' } }}
          >
            Send Your Resume
          </Button>
        </Container>
      </Box>
    </Box>
  );
}
