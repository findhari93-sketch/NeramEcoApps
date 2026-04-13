'use client';

import { Box, Container, Grid, Paper, Stack, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import HouseIcon from '@mui/icons-material/House';

import HeroSection from './HeroSection';
import NavPills from './NavPills';
import FeeBreakdown from './FeeBreakdown';
import CutoffSparkline from './CutoffSparkline';
import PlacementStats from './PlacementStats';
import InfrastructureSection from './InfrastructureSection';
import SimilarColleges from './SimilarColleges';
import ClaimProfileCTA from './ClaimProfileCTA';
import ReviewSection from './ReviewSection';
import CommentSection from './CommentSection';
import TierGate from './TierGate';
import LeadCaptureButton from './LeadCaptureButton';
import type { CollegeDetail, CollegeListItem, CollegeTier } from '@/lib/college-hub/types';

interface CollegePageTemplateProps {
  college: CollegeDetail;
  similarColleges: CollegeListItem[];
}

const NAV_PILLS = [
  { id: 'overview', label: 'Overview', icon: <InfoIcon sx={{ fontSize: 16 }} /> },
  { id: 'fees', label: 'Fees', icon: <AttachMoneyIcon sx={{ fontSize: 16 }} /> },
  { id: 'cutoffs', label: 'Cutoffs', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
  { id: 'placements', label: 'Placements', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
  { id: 'infrastructure', label: 'Infrastructure', icon: <BusinessIcon sx={{ fontSize: 16 }} /> },
  { id: 'faculty', label: 'Faculty', icon: <PeopleIcon sx={{ fontSize: 16 }} /> },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Box
      id={id}
      component="section"
      sx={{ scrollMarginTop: 72, py: { xs: 3, sm: 4 }, borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Typography variant="h2" sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' }, fontWeight: 700, mb: 2.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export default function CollegePageTemplate({ college, similarColleges }: CollegePageTemplateProps) {
  return (
    <Box sx={{ bgcolor: 'background.default' }}>
      {/* Hero */}
      <HeroSection college={college} />

      {/* Nav Pills — sticky */}
      <NavPills pills={NAV_PILLS} />

      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
        {/* Mobile lead capture — below hero, above content */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, py: 2 }}>
          <LeadCaptureButton collegeId={college.id} collegeName={college.name} />
        </Box>

        <Grid container spacing={{ xs: 0, md: 3 }}>
          {/* Main content */}
          <Grid item xs={12} md={8}>
            {/* Overview */}
            <Section id="overview" title="About the College">
              {college.about ? (
                <Typography variant="body1" sx={{ lineHeight: 1.8, color: 'text.secondary' }}>
                  {college.about}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Detailed information about {college.name} will be updated soon.
                </Typography>
              )}

              {college.highlights && college.highlights.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                    Key Highlights
                  </Typography>
                  <Stack gap={0.75}>
                    {college.highlights.map((h, i) => (
                      <Stack key={i} direction="row" gap={1} alignItems="flex-start">
                        <Box
                          sx={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                            mt: '8px',
                            flexShrink: 0,
                          }}
                        />
                        <Typography variant="body2">{h}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              )}
            </Section>

            {/* Fees */}
            <Section id="fees" title="Fee Structure">
              <FeeBreakdown fees={college.fees} />
            </Section>

            {/* Cutoffs */}
            <Section id="cutoffs" title="TNEA Cutoffs">
              <CutoffSparkline cutoffs={college.cutoffs} />
            </Section>

            {/* Placements */}
            <Section id="placements" title="Placements">
              <TierGate
                requiredTier="gold"
                featureName="Placement Statistics"
                collegeTier={college.neram_tier as CollegeTier}
              >
                <PlacementStats placements={college.placements} />
              </TierGate>
            </Section>

            {/* Infrastructure */}
            <Section id="infrastructure" title="Infrastructure">
              <TierGate
                requiredTier="silver"
                featureName="Infrastructure Details"
                collegeTier={college.neram_tier as CollegeTier}
              >
                <InfrastructureSection infrastructure={college.infrastructure} />
              </TierGate>
            </Section>

            {/* Faculty */}
            <Section id="faculty" title="Faculty">
              <TierGate
                requiredTier="silver"
                featureName="Faculty Profiles"
                collegeTier={college.neram_tier as CollegeTier}
              >
                {college.faculty.length === 0 ? (
                  <Typography color="text.secondary" variant="body2">
                    Faculty details not yet available.
                  </Typography>
                ) : (
                  <Grid container spacing={1.5}>
                    {college.faculty.map((f) => (
                      <Grid key={f.id} item xs={12} sm={6}>
                        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                          <Stack direction="row" gap={1.5} alignItems="center">
                            <Box
                              sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                bgcolor: '#f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <PeopleIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </Box>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {f.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {[f.designation, f.specialization].filter(Boolean).join(' · ')}
                              </Typography>
                              {f.is_practicing_architect && (
                                <Typography variant="caption" sx={{ display: 'block', color: 'success.main', fontWeight: 500 }}>
                                  Practicing Architect
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </TierGate>
            </Section>

            {/* Reviews section */}
            <Box id="reviews" sx={{ mb: 4 }}>
              <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Student Reviews</Typography>
              <ReviewSection collegeId={college.id} collegeName={college.name} />
            </Box>

            {/* Q&A section */}
            <Box id="qa" sx={{ mb: 4 }}>
              <CommentSection collegeId={college.id} collegeName={college.name} />
            </Box>

            {/* Claim CTA */}
            {!college.claimed && (
              <Box sx={{ py: 3 }}>
                <ClaimProfileCTA
                  collegeSlug={college.slug}
                  collegeName={college.short_name ?? college.name}
                />
              </Box>
            )}
          </Grid>

          {/* Desktop sidebar */}
          <Grid item xs={12} md={4} sx={{ display: { xs: 'none', md: 'block' } }}>
            <Box sx={{ position: 'sticky', top: 80, pt: 3 }}>
              {/* Quick facts card */}
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  Quick Facts
                </Typography>
                <Stack gap={1}>
                  {college.total_barch_seats && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">B.Arch Seats</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{college.total_barch_seats}</Typography>
                    </Stack>
                  )}
                  {college.established_year && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Established</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{college.established_year}</Typography>
                    </Stack>
                  )}
                  {college.type && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Type</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{college.type}</Typography>
                    </Stack>
                  )}
                  {(college.annual_fee_approx ?? college.annual_fee_min) && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Annual Fee</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                        {college.annual_fee_approx
                          ? `~₹${(college.annual_fee_approx / 100000).toFixed(1)}L`
                          : `₹${((college.annual_fee_min ?? 0) / 100000).toFixed(1)}L+`}
                      </Typography>
                    </Stack>
                  )}
                  {college.accepted_exams && college.accepted_exams.length > 0 && (
                    <Stack direction="row" justifyContent="space-between">
                      <Typography variant="body2" color="text.secondary">Accepted Exams</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {college.accepted_exams.join(', ')}
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              </Paper>

              {/* Lead capture CTA */}
              <Box sx={{ mt: 2 }}>
                <LeadCaptureButton collegeId={college.id} collegeName={college.name} />
              </Box>

              {/* Contact card */}
              {(college.website || college.admissions_phone || college.admissions_email) && (
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Contact Admissions
                  </Typography>
                  <Stack gap={0.75}>
                    {college.admissions_phone && (
                      <Typography variant="body2">
                        Phone:{' '}
                        <a href={`tel:${college.admissions_phone}`} style={{ color: 'inherit' }}>
                          {college.admissions_phone}
                        </a>
                      </Typography>
                    )}
                    {college.admissions_email && (
                      <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                        Email:{' '}
                        <a href={`mailto:${college.admissions_email}`} style={{ color: 'inherit' }}>
                          {college.admissions_email}
                        </a>
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              )}

              {/* Apply CTA */}
              <Paper
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',
                  color: 'white',
                }}
              >
                <HouseIcon sx={{ fontSize: 28, mb: 1 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Preparing for NATA 2026?
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.85, mb: 2 }}>
                  Join Neram Classes — Tamil Nadu's most trusted B.Arch entrance coaching.
                </Typography>
                <Box
                  component="a"
                  href="/apply"
                  sx={{
                    display: 'block',
                    textAlign: 'center',
                    bgcolor: 'white',
                    color: '#1d4ed8',
                    fontWeight: 700,
                    py: 1.25,
                    borderRadius: 1.5,
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    '&:hover': { bgcolor: '#f0f9ff' },
                  }}
                >
                  Apply to Neram
                </Box>
              </Paper>
            </Box>
          </Grid>
        </Grid>

        {/* Similar colleges — full width */}
        {similarColleges.length > 0 && (
          <Box sx={{ py: { xs: 3, sm: 4 } }}>
            <SimilarColleges colleges={similarColleges} stateSlug={college.state_slug} />
          </Box>
        )}
      </Container>
    </Box>
  );
}
