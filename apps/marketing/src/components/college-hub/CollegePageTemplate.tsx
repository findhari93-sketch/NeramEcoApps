'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import PeopleIcon from '@mui/icons-material/People';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

import Breadcrumbs from '../seo/Breadcrumbs';
import CutoffTables from './CutoffTables';
import PlacementStats from './PlacementStats';
import InfrastructureSection from './InfrastructureSection';
import ReviewSection from './ReviewSection';
import CommentSection from './CommentSection';
import CollegeFaqList from './CollegeFaqList';
import { hasTierAccess } from './TierGate';
import ROICalculator from './ROICalculator';
import CollegeYouTube from './CollegeYouTube';
import ProfileHero from './profile/ProfileHero';
import ProfileSection from './profile/ProfileSection';
import SectionTabs, { type SectionTab } from './profile/SectionTabs';
import AdmissionPath, { EligibilityCard } from './profile/AdmissionPath';
import FeesPanel from './profile/FeesPanel';
import LocationContact from './profile/LocationContact';
import ProvidedByCollege from './profile/ProvidedByCollege';
import AdmissionDates from './profile/AdmissionDates';
import SimilarCollegeCards from './profile/SimilarCollegeCards';
import AdmissionHelpCard from './profile/AdmissionHelpCard';
import CoachingCard from './profile/CoachingCard';
import MobileActionBar from './profile/MobileActionBar';
import { displayName, feeText, joinOr } from '@/lib/college-hub/detail-content';
import type { CutoffTable, InternalLink } from '@/lib/college-hub/detail-content';
import { admissionSystems, examList, shortName } from '@/lib/college-hub/format';
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

function RelatedLinks({ links, title }: { links: InternalLink[]; title: string }) {
  return (
    <Paper variant="outlined" component="nav" aria-label="Related pages" sx={{ borderRadius: { xs: 0, md: 2 }, borderLeft: { xs: 0, md: '1px solid' }, borderRight: { xs: 0, md: '1px solid' }, borderColor: 'divider', overflow: 'hidden' }}>
      <Typography component="p" sx={{ m: 0, px: 2.5, pt: 2, pb: 1, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
        {title}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, pb: 0.5 }}>
        {links.map((l) => (
          <Box component="li" key={l.href}>
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
                px: 2.5,
                py: 1,
                color: 'primary.dark',
                textDecoration: 'none',
                fontSize: '0.94rem',
                fontWeight: 600,
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


/**
 * The college page (canvas: Desktop · College page, Mobile · College page).
 * Server facts stay in the HTML: one H1, the #college-summary answer, every FAQ
 * answer (same array as the FAQPage JSON-LD) and the related-page links.
 */
export default function CollegePageTemplate({ college, similarColleges, content }: CollegePageTemplateProps) {
  const n = displayName(college);
  const short = shortName(college);
  const tier = (college.neram_tier ?? 'free') as CollegeTier;
  const gold = hasTierAccess(tier, 'gold');
  const silver = hasTierAccess(tier, 'silver');

  const highlights = college.highlights ?? [];
  const hasAbout = !!college.about || highlights.length > 0;
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
  const systems = admissionSystems(college);
  const exams = examList(college.accepted_exams);
  const stateName = college.state ?? 'India';
  const coachingHref = content.links.find((l) => /coaching/.test(l.href))?.href ?? '/coaching/nata-coaching';

  // Tabs only for sections that render, in page order.
  const tabs = [
    hasAbout && { id: 'overview', label: 'Overview' },
    { id: 'admission', label: 'Admission' },
    hasCutoffs && { id: 'cutoffs', label: 'Cutoffs' },
    { id: 'fees', label: 'Fees' },
    hasPlacements && { id: 'placements', label: 'Placements' },
    hasInfra && { id: 'infrastructure', label: 'Campus' },
    hasFaculty && { id: 'faculty', label: 'Faculty' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'qa', label: 'Q&A' },
    hasFaqs && { id: 'college-faqs', label: 'FAQs' },
    { id: 'location', label: 'Location' },
  ].filter(Boolean) as SectionTab[];

  return (
    <Box sx={{ bgcolor: (t) => (t.palette.mode === 'light' ? t.palette.grey[50] : t.palette.background.default) }}>
      {/* Breadcrumbs: the same list as the BreadcrumbList JSON-LD */}
      <Box sx={{ bgcolor: 'background.paper' }}>
        <Box sx={{ maxWidth: 1360, mx: 'auto', px: { xs: 2, md: 4 }, pt: { xs: 1.5, md: 2 } }}>
          <Breadcrumbs items={content.breadcrumbs} />
        </Box>
      </Box>

      <ProfileHero college={college} summary={content.summary} updated={content.updated} sources={content.sources} />

      <SectionTabs tabs={tabs} />

      <Box
        sx={{
          maxWidth: 1360,
          mx: 'auto',
          px: { xs: 0, md: 4 },
          pt: { xs: 1.25, md: 3.5 },
          pb: { xs: 2, md: 8 },
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: { xs: 1.25, md: 3.5 },
        }}
      >
        {/* Main column */}
        <Box sx={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 1.25, md: 2.5 } }}>
          {hasAbout && (
            <ProfileSection id="overview" title="Overview" action={<ProvidedByCollege college={college} section="profile" />}>
              {college.about && (
                <Typography sx={{ m: 0, fontSize: '1rem', lineHeight: 1.7, color: 'text.secondary', maxWidth: 780, textWrap: 'pretty' }}>{college.about}</Typography>
              )}
              {highlights.length > 0 && (
                <>
                  <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Highlights
                  </Typography>
                  <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '10px 24px' }}>
                    {highlights.map((h, i) => (
                      <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, fontSize: '0.95rem', lineHeight: 1.5 }}>
                        <Box aria-hidden sx={{ flex: '0 0 22px', width: 22, height: 22, mt: '1px', borderRadius: '50%', bgcolor: 'success.light', color: 'success.dark', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CheckIcon sx={{ fontSize: 14 }} />
                        </Box>
                        <span>{h}</span>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </ProfileSection>
          )}

          <ProfileSection id="admission" title="How to get in" action={<ProvidedByCollege college={college} section="admissions" />}>
            <AdmissionDates college={college} />
            <AdmissionPath college={college} />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 1.75 }}>
              <EligibilityCard exams={exams} />
              {hasCutoffs ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: { xs: 1.75, md: 2.25 }, borderRadius: 2, bgcolor: (t) => alpha(t.palette.success.main, 0.08) }}>
                  <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
                    Cutoff {content.cutoffYear ?? ''}
                  </Typography>
                  <Typography sx={{ m: 0, fontSize: '0.92rem', lineHeight: 1.5, color: 'text.secondary' }}>
                    Closing ranks and scores by category, from {joinOr(content.cutoffTables.map((t) => t.label))}.
                  </Typography>
                  <Box component="a" href="#cutoffs" sx={{ alignSelf: 'flex-start', minHeight: 40, display: 'flex', alignItems: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'primary.dark', textDecoration: 'none' }}>
                    See the cutoffs
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: { xs: 1.75, md: 2.25 }, borderRadius: 2, border: '1px solid', borderColor: (t) => alpha(t.palette.secondary.main, 0.35), bgcolor: (t) => alpha(t.palette.secondary.main, 0.06) }}>
                  <Typography component="h3" sx={{ m: 0, fontSize: '1rem', fontWeight: 700 }}>
                    {systems[0] ? `${systems[0]} cutoff` : 'Cutoff'}
                  </Typography>
                  <Typography sx={{ m: 0, fontSize: '0.92rem', lineHeight: 1.5, color: 'text.secondary' }}>
                    Not published for this college yet. We add it once {systems[0] ?? 'the counselling authority'} releases the allotment list.
                  </Typography>
                </Box>
              )}
            </Box>
          </ProfileSection>

          {hasCutoffs && (
            <ProfileSection id="cutoffs" title={`${n} cutoff${content.cutoffYear ? ` ${content.cutoffYear}` : ''}`}>
              <CutoffTables tables={content.cutoffTables} cutoffs={college.cutoffs} />
            </ProfileSection>
          )}

          <ProfileSection id="fees" title={`${n} fees`} action={<ProvidedByCollege college={college} section="fees" />}>
            <FeesPanel college={college} similar={similarColleges} stateName={stateName} />
          </ProfileSection>

          {hasPlacements && (
            <ProfileSection id="placements" title="Placements">
              {showPlacementStats ? (
                <PlacementStats placements={college.placements} />
              ) : (
                <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 1.5 }}>
                  {[
                    { label: 'Average package', value: salary.avg },
                    { label: 'Lowest package', value: salary.min },
                    { label: 'Highest package', value: salary.max },
                  ]
                    .filter((r) => !!r.value)
                    .map((r) => (
                      <Box key={r.label} sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Typography component="dt" sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{r.label}</Typography>
                        <Typography component="dd" sx={{ m: 0, fontWeight: 700, fontSize: '1.25rem' }}>{feeText(r.value as number)} a year</Typography>
                      </Box>
                    ))}
                </Box>
              )}
            </ProfileSection>
          )}

          {hasRoi && (
            <ProfileSection id="roi" title="Return on investment">
              <ROICalculator
                annualFee={fee!}
                avgSalary={college.avg_placement_salary!}
                minSalary={college.min_placement_salary ?? null}
                maxSalary={college.max_placement_salary ?? null}
                citySlug={college.city_slug ?? null}
                city={college.city}
              />
            </ProfileSection>
          )}

          {hasInfra && (
            <ProfileSection id="infrastructure" title="Campus and studios">
              <InfrastructureSection infrastructure={college.infrastructure} />
            </ProfileSection>
          )}

          {hasFaculty && (
            <ProfileSection id="faculty" title="Faculty">
              <Grid container spacing={1.5}>
                {college.faculty.map((f) => (
                  <Grid key={f.id} item xs={12} sm={6}>
                    <Stack direction="row" gap={1.5} alignItems="center" sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <PeopleIcon aria-hidden sx={{ fontSize: 20, color: 'text.secondary' }} />
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.92rem', fontWeight: 600 }}>{f.name}</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{[f.designation, f.specialization].filter(Boolean).join(' · ')}</Typography>
                        {f.is_practicing_architect && (
                          <Typography sx={{ fontSize: '0.8rem', color: 'success.dark', fontWeight: 600 }}>Practising architect</Typography>
                        )}
                      </Box>
                    </Stack>
                  </Grid>
                ))}
              </Grid>
            </ProfileSection>
          )}

          {college.youtube_channel_url && (
            <ProfileSection id="youtube" title="Official YouTube channel">
              <CollegeYouTube youtubeChannelUrl={college.youtube_channel_url} />
            </ProfileSection>
          )}

          {hasTour && (
            <ProfileSection id="virtual-tour" title="Virtual campus tour">
              <VirtualTour scenes={college.virtual_tour_scenes!} collegeName={college.name} />
            </ProfileSection>
          )}

          <ProfileSection id="reviews" title="Student reviews">
            <ReviewSection collegeId={college.id} collegeName={college.name} initialReviews={content.initialReviews} />
          </ProfileSection>

          {/* Q&A brings its own heading. */}
          <Box
            component="section"
            id="qa"
            aria-label="Questions and answers"
            sx={{ scrollMarginTop: 'calc(var(--broadcast-banner-height, 0px) + 64px)', bgcolor: 'background.paper', border: { md: '1px solid' }, borderColor: { md: 'divider' }, borderRadius: { xs: 0, md: 2 }, px: { xs: 2, md: 3.5 }, py: { xs: 2.5, md: 3.5 } }}
          >
            <CommentSection collegeId={college.id} collegeName={college.name} initialComments={content.initialComments} />
          </Box>

          {/* FAQs: same array as the FAQPage JSON-LD; answers always in the HTML */}
          {hasFaqs && (
            <ProfileSection id="college-faqs" title={`${n} B.Arch FAQs`}>
              <CollegeFaqList faqs={content.faqs} />
            </ProfileSection>
          )}

          <ProfileSection id="location" title="Location and contact" action={<ProvidedByCollege college={college} section="location" />}>
            <LocationContact college={college} />
          </ProfileSection>

          {/* Aintra AI chat: Gold and Platinum only */}
          {(college.neram_tier === 'gold' || college.neram_tier === 'platinum') && <AintraChat collegeId={college.id} collegeName={n} />}

          <SimilarCollegeCards college={college} similar={similarColleges} stateName={stateName} />

          {!college.claimed && (
            <Box
              component="aside"
              aria-label="Claim this profile"
              sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 20px', px: { xs: 2, md: 2.75 }, py: 2.25, bgcolor: 'background.paper', border: { md: '1px solid' }, borderColor: { md: 'divider' }, borderRadius: { xs: 0, md: 2 } }}
            >
              <Typography sx={{ m: 0, fontSize: '0.94rem', color: 'text.secondary' }}>
                <Box component="b" sx={{ color: 'text.primary' }}>Work at {short}?</Box> Claim this profile to update details and answer student questions.
              </Typography>
              <Box component="a" href="/college-dashboard/login?request=1" sx={{ display: 'flex', alignItems: 'center', minHeight: 44, px: 2, border: '1px solid', borderColor: 'grey.400', borderRadius: 1.5, color: 'text.primary', fontSize: '0.9rem', fontWeight: 600, textDecoration: 'none', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}>
                Claim profile
              </Box>
            </Box>
          )}
        </Box>

        {/* Rail: stacks under the main column on phones */}
        <Box component="aside" aria-label="Admission help" sx={{ flex: '1 1 300px', maxWidth: '100%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 1.25, md: 2 } }}>
          <AdmissionHelpCard collegeId={college.id} collegeName={college.name} shortName={short} />
          <CoachingCard year={content.admissionYear} href={coachingHref} />
          {content.links.length > 0 && <RelatedLinks links={content.links} title={`More about ${short}`} />}
        </Box>
      </Box>

      <MobileActionBar slug={college.slug} name={college.name} shortName={short} stateSlug={college.state_slug} />
    </Box>
  );
}
