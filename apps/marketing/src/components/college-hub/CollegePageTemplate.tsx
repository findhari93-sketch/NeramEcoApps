'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Box, Container, Grid, Paper, Stack, Typography } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import HouseIcon from '@mui/icons-material/House';
import PlayCircleIcon from '@mui/icons-material/PlayCircle';
import TourIcon from '@mui/icons-material/Tour';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import RateReviewIcon from '@mui/icons-material/RateReview';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import Breadcrumbs from '../seo/Breadcrumbs';
import HeroSection from './HeroSection';
import NavPills from './NavPills';
import FeeBreakdown from './FeeBreakdown';
import CutoffTables from './CutoffTables';
import PlacementStats from './PlacementStats';
import InfrastructureSection from './InfrastructureSection';
import SimilarColleges from './SimilarColleges';
import ClaimProfileCTA from './ClaimProfileCTA';
import ReviewSection from './ReviewSection';
import CommentSection from './CommentSection';
import CollegeFaqList from './CollegeFaqList';
import { hasTierAccess } from './TierGate';
import ROICalculator from './ROICalculator';
import LeadCaptureButton from './LeadCaptureButton';
import CollegeYouTube from './CollegeYouTube';
import { annualFee, displayName, examLabels, feeText, typeTitle } from '@/lib/college-hub/detail-content';
import type { CutoffTable, InternalLink } from '@/lib/college-hub/detail-content';
import type {
  CollegeComment,
  CollegeDetail,
  CollegeFaqItem,
  CollegeListItem,
  CollegeReview,
  CollegeTier,
} from '@/lib/college-hub/types';

const AintraChat = dynamic(() => import('./AintraChat'), { ssr: false });
const VirtualTour = dynamic(() => import('./VirtualTour'), { ssr: false });

/**
 * Placement salary figures stored on the college row (avg/min/max) are shown
 * to every visitor when present, even below the Gold tier that gates the full
 * placement statistics. Business decision: flip to false to keep them gated.
 */
const SHOW_PUBLIC_SALARY_SUMMARY = true;

/** Everything the server worked out for the page (page.tsx), all serialisable. */
export interface CollegePageContent {
  summary: string;
  /** The exact array the FAQPage JSON-LD is built from. */
  faqs: CollegeFaqItem[];
  cutoffTables: CutoffTable[];
  cutoffYear: string | null;
  sources: string[];
  updated: { iso: string; label: string } | null;
  breadcrumbs: Array<{ name: string; href?: string }>;
  links: InternalLink[];
  initialReviews: CollegeReview[];
  initialComments: (CollegeComment & { replies?: CollegeComment[] })[];
  admissionYear: number;
}

interface CollegePageTemplateProps {
  college: CollegeDetail;
  similarColleges: CollegeListItem[];
  content: CollegePageContent;
}

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

const lakh = (v: number) => `₹${(v / 100000).toFixed(1).replace(/\.0$/, '')}L`;

function QuickFactsCard({ college }: { college: CollegeDetail }) {
  const exams = examLabels(college.accepted_exams);
  const type = typeTitle(college.type);
  const rows: Array<{ label: string; value: string; accent?: boolean }> = [];
  if (college.total_barch_seats) rows.push({ label: 'B.Arch Seats', value: String(college.total_barch_seats) });
  if (college.established_year) rows.push({ label: 'Established', value: String(college.established_year) });
  if (type) rows.push({ label: 'Type', value: type });
  if (college.annual_fee_approx) rows.push({ label: 'Annual Fee', value: `~${lakh(college.annual_fee_approx)}`, accent: true });
  else if (college.annual_fee_min) rows.push({ label: 'Annual Fee', value: `${lakh(college.annual_fee_min)}+`, accent: true });
  if (exams.length) rows.push({ label: 'Accepted Exams', value: exams.join(', ') });
  if (!rows.length) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 2 }}>
      <Typography variant="subtitle2" component="p" sx={{ fontWeight: 700, mb: 1.5 }}>
        Quick Facts
      </Typography>
      <Stack component="dl" gap={1} sx={{ m: 0 }}>
        {rows.map((r) => (
          <Stack key={r.label} direction="row" justifyContent="space-between" gap={2}>
            <Typography component="dt" variant="body2" color="text.secondary">
              {r.label}
            </Typography>
            <Typography
              component="dd"
              variant="body2"
              sx={{ m: 0, fontWeight: 600, textAlign: 'right', ...(r.accent && { color: 'primary.main' }) }}
            >
              {r.value}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

function RelatedLinks({ links }: { links: InternalLink[] }) {
  return (
    <Paper variant="outlined" component="nav" aria-label="Related pages" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {links.map((l, i) => (
          <Box component="li" key={l.href} sx={{ borderTop: i === 0 ? 'none' : '1px solid', borderColor: 'divider' }}>
            <Box
              component={Link}
              href={l.href}
              rel={l.nofollow ? 'nofollow' : undefined}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1,
                minHeight: 48,
                px: 2,
                py: 1,
                color: 'text.primary',
                textDecoration: 'none',
                fontSize: '1rem',
                lineHeight: 1.4,
                transition: 'background-color 150ms',
                '&:hover': { bgcolor: 'action.hover' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
              }}
            >
              <span>{l.label}</span>
              <ChevronRightIcon sx={{ fontSize: 20, color: 'text.secondary', flexShrink: 0 }} aria-hidden />
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export default function CollegePageTemplate({ college, similarColleges, content }: CollegePageTemplateProps) {
  const n = displayName(college);
  const tier = (college.neram_tier ?? 'free') as CollegeTier;
  const gold = hasTierAccess(tier, 'gold');
  const silver = hasTierAccess(tier, 'silver');

  const highlights = college.highlights ?? [];
  const hasAbout = !!college.about || highlights.length > 0;
  const feeFigure = annualFee(college);
  const hasFeeRows = college.fees.length > 0;
  const hasFees = hasFeeRows || !!feeFigure;
  const hasCutoffs = content.cutoffTables.length > 0;
  const showPlacementStats = gold && college.placements.length > 0;
  const salary = {
    avg: college.avg_placement_salary,
    min: college.min_placement_salary ?? null,
    max: college.max_placement_salary ?? null,
  };
  const showSalarySummary =
    !showPlacementStats && (gold || SHOW_PUBLIC_SALARY_SUMMARY) && !!(salary.avg || salary.min || salary.max);
  const hasPlacements = showPlacementStats || showSalarySummary;
  const fee = college.annual_fee_approx ?? college.annual_fee_min;
  const hasRoi = gold && !!college.avg_placement_salary && !!fee;
  const hasInfra = silver && !!college.infrastructure;
  const hasFaculty = silver && college.faculty.length > 0;
  const hasTour =
    college.neram_tier === 'platinum' && !!college.virtual_tour_scenes && college.virtual_tour_scenes.length > 0;
  const hasFaqs = content.faqs.length > 0;

  // Pills only for sections that render, in page order.
  const pills = [
    hasAbout && { id: 'overview', label: 'Overview', icon: <InfoIcon sx={{ fontSize: 16 }} /> },
    hasFees && { id: 'fees', label: 'Fees', icon: <AttachMoneyIcon sx={{ fontSize: 16 }} /> },
    hasCutoffs && { id: 'cutoffs', label: 'Cutoffs', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
    hasPlacements && { id: 'placements', label: 'Placements', icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
    hasRoi && { id: 'roi', label: 'ROI', icon: <AttachMoneyIcon sx={{ fontSize: 16 }} /> },
    hasInfra && { id: 'infrastructure', label: 'Infrastructure', icon: <BusinessIcon sx={{ fontSize: 16 }} /> },
    hasFaculty && { id: 'faculty', label: 'Faculty', icon: <PeopleIcon sx={{ fontSize: 16 }} /> },
    college.youtube_channel_url && { id: 'youtube', label: 'Videos', icon: <PlayCircleIcon sx={{ fontSize: 16 }} /> },
    hasTour && { id: 'virtual-tour', label: '360° Tour', icon: <TourIcon sx={{ fontSize: 16 }} /> },
    hasFaqs && { id: 'college-faqs', label: 'FAQs', icon: <HelpOutlineIcon sx={{ fontSize: 16 }} /> },
    { id: 'reviews', label: 'Reviews', icon: <RateReviewIcon sx={{ fontSize: 16 }} /> },
  ].filter(Boolean) as Array<{ id: string; label: string; icon: React.ReactNode }>;

  return (
    <Box sx={{ bgcolor: 'background.default' }}>
      {/* Breadcrumbs: the same list as the BreadcrumbList JSON-LD */}
      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
        <Box sx={{ pt: { xs: 1.5, sm: 2 } }}>
          <Breadcrumbs items={content.breadcrumbs} />
        </Box>
      </Container>

      {/* Hero, with the answer-first summary under the H1 */}
      <HeroSection
        college={college}
        summary={content.summary}
        updated={content.updated}
        sources={content.sources}
        showPhotoCredit
      />

      {/* Nav Pills, sticky */}
      <NavPills pills={pills} />

      <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
        {/* Mobile: lead capture and quick facts, above content */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, pt: 2 }}>
          <Box sx={{ mb: 2 }}>
            <LeadCaptureButton collegeId={college.id} collegeName={college.name} />
          </Box>
          <QuickFactsCard college={college} />
        </Box>

        <Grid container spacing={{ xs: 0, md: 3 }}>
          {/* Main content */}
          <Grid item xs={12} md={8}>
            {hasAbout && (
              <Section id="overview" title="About the College">
                {college.about && (
                  <Typography variant="body1" sx={{ lineHeight: 1.8, color: 'text.secondary' }}>
                    {college.about}
                  </Typography>
                )}

                {highlights.length > 0 && (
                  <Box sx={{ mt: college.about ? 2 : 0 }}>
                    <Typography variant="subtitle2" component="p" sx={{ fontWeight: 700, mb: 1 }}>
                      Key Highlights
                    </Typography>
                    <Stack gap={0.75}>
                      {highlights.map((h, i) => (
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
            )}

            {hasFees && (
              <Section id="fees" title={`${n} Fee Structure`}>
                {hasFeeRows ? (
                  <FeeBreakdown fees={college.fees} />
                ) : (
                  feeFigure && (
                    <Typography variant="body1" sx={{ lineHeight: 1.7, color: 'text.secondary' }}>
                      {feeFigure.from
                        ? `B.Arch tuition at ${college.name} starts at about ${feeText(feeFigure.amount)} a year.`
                        : `The approximate B.Arch tuition fee at ${college.name} is ${feeText(feeFigure.amount)} a year, about ${feeText(feeFigure.amount * 5)} for the five-year course.`}{' '}
                      Fees can differ by quota and category, so confirm the current figure with the college before you pay.
                    </Typography>
                  )
                )}
              </Section>
            )}

            {hasCutoffs && (
              <Section id="cutoffs" title={`${n} Cutoff${content.cutoffYear ? ` ${content.cutoffYear}` : ''}`}>
                <CutoffTables tables={content.cutoffTables} cutoffs={college.cutoffs} />
              </Section>
            )}

            {hasPlacements && (
              <Section id="placements" title="Placements">
                {showPlacementStats ? (
                  <PlacementStats placements={college.placements} />
                ) : (
                  <Stack component="dl" direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ m: 0 }}>
                    {[
                      { label: 'Average package', value: salary.avg },
                      { label: 'Lowest package', value: salary.min },
                      { label: 'Highest package', value: salary.max },
                    ]
                      .filter((r) => !!r.value)
                      .map((r) => (
                        <Paper key={r.label} variant="outlined" sx={{ p: 2, borderRadius: 2, flex: 1 }}>
                          <Typography component="dt" variant="body2" color="text.secondary">
                            {r.label}
                          </Typography>
                          <Typography component="dd" sx={{ m: 0, fontWeight: 700, fontSize: '1.25rem' }}>
                            {feeText(r.value as number)} a year
                          </Typography>
                        </Paper>
                      ))}
                  </Stack>
                )}
              </Section>
            )}

            {hasRoi && (
              <Section id="roi" title="Return on Investment">
                <ROICalculator
                  annualFee={fee!}
                  avgSalary={college.avg_placement_salary!}
                  minSalary={college.min_placement_salary ?? null}
                  maxSalary={college.max_placement_salary ?? null}
                  citySlug={college.city_slug ?? null}
                  city={college.city}
                />
              </Section>
            )}

            {hasInfra && (
              <Section id="infrastructure" title="Infrastructure">
                <InfrastructureSection infrastructure={college.infrastructure} />
              </Section>
            )}

            {hasFaculty && (
              <Section id="faculty" title="Faculty">
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
              </Section>
            )}

            {/* YouTube Channel */}
            {college.youtube_channel_url && (
              <Section id="youtube" title="Official YouTube Channel">
                <CollegeYouTube youtubeChannelUrl={college.youtube_channel_url} />
              </Section>
            )}

            {/* Virtual Campus Tour: Platinum only, when scenes exist */}
            {hasTour && (
              <Section id="virtual-tour" title="Virtual Campus Tour">
                <VirtualTour scenes={college.virtual_tour_scenes!} collegeName={college.name} />
              </Section>
            )}

            {/* FAQs: same array as the FAQPage JSON-LD; answers always in the HTML */}
            {hasFaqs && (
              <Section id="college-faqs" title={`${n} B.Arch FAQs`}>
                <CollegeFaqList faqs={content.faqs} />
              </Section>
            )}

            {/* Reviews */}
            <Section id="reviews" title="Student Reviews">
              <ReviewSection collegeId={college.id} collegeName={college.name} initialReviews={content.initialReviews} />
            </Section>

            {/* Q&A */}
            <Box id="qa" component="section" sx={{ scrollMarginTop: 72, py: { xs: 3, sm: 4 } }}>
              <CommentSection collegeId={college.id} collegeName={college.name} initialComments={content.initialComments} />
            </Box>

            {/* Aintra AI Chat: Gold and Platinum only */}
            {(college.neram_tier === 'gold' || college.neram_tier === 'platinum') && (
              <AintraChat collegeId={college.id} collegeName={n} />
            )}

            {/* Related pages: server-rendered links to routes that exist */}
            {content.links.length > 0 && (
              <Section id="related" title={`Explore more about ${n}`}>
                <RelatedLinks links={content.links} />
              </Section>
            )}

            {/* Claim CTA */}
            {!college.claimed && (
              <Box sx={{ py: 3 }}>
                <ClaimProfileCTA collegeSlug={college.slug} collegeName={n} />
              </Box>
            )}
          </Grid>

          {/* Desktop sidebar */}
          <Grid item xs={12} md={4} sx={{ display: { xs: 'none', md: 'block' } }}>
            <Box sx={{ position: 'sticky', top: 80, pt: 3 }}>
              <QuickFactsCard college={college} />

              {/* Lead capture CTA */}
              <Box sx={{ mt: 2 }}>
                <LeadCaptureButton collegeId={college.id} collegeName={college.name} />
              </Box>

              {/* Contact card */}
              {(college.admissions_phone || college.admissions_email) && (
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 2 }}>
                  <Typography variant="subtitle2" component="p" sx={{ fontWeight: 700, mb: 1.5 }}>
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
                <Typography variant="subtitle1" component="p" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Preparing for NATA {content.admissionYear}?
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.85, mb: 2 }}>
                  Join Neram Classes, Tamil Nadu&apos;s most trusted B.Arch entrance coaching.
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

        {/* Similar colleges, full width */}
        {similarColleges.length > 0 && (
          <Box sx={{ py: { xs: 3, sm: 4 } }}>
            <SimilarColleges colleges={similarColleges} stateSlug={college.state_slug} />
          </Box>
        )}
      </Container>
    </Box>
  );
}
