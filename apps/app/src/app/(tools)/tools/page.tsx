import { Box, Typography, Button } from '@neram/ui';
import Link from 'next/link';
import type { Metadata } from 'next';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PublicToolsGrid from '@/components/seo/PublicToolsGrid';
import { JsonLd } from '@/components/seo/JsonLd';
import { APP_URL } from '@/lib/seo/constants';
import { toolPageMetadata } from '@/lib/seo/tool-metadata';
import { allGeoPages } from '@/lib/tools/geo-pages';
import { STATES_BY_NAME } from '@/lib/tools/places';

const TOOL_LABEL: Record<string, string> = {
  examCentres: 'Exam centres',
  costCalculator: 'Exam cost',
  collegePredictor: 'College predictor',
  coaChecker: 'COA colleges',
};

const PAGE_URL = `${APP_URL}/tools`;
const OPEN_APP_HREF = '/login?redirect=/tools/all';
const STATE_LINKS_HEADING = 'Tools for your state';

export const metadata: Metadata = toolPageMetadata({
  title: 'Free NATA and B.Arch Tools: Cutoff, Colleges, Centres',
  description:
    'Free NATA and B.Arch tools: cutoff calculator, college predictor, exam centre finder, COA college checker and more, for every state in India. Try each one free.',
  path: '/tools',
  keywords: ['NATA tools', 'NATA cutoff calculator', 'B.Arch college predictor', 'NATA exam centres', 'COA approved colleges'],
});

const BENEFITS = ['Free for every student', 'Built on real admission data', 'Made for your phone'];

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: APP_URL },
    { '@type': 'ListItem', position: 2, name: 'Tools', item: PAGE_URL },
  ],
};

// Brand navy band. These are fixed brand colours so the hero reads the same in light and dark mode.
const NAVY = '#060d1f';
const NAVY_GRID =
  'linear-gradient(rgba(62,184,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(62,184,255,0.07) 1px, transparent 1px), radial-gradient(120% 140% at 100% 0%, rgba(26,143,255,0.35) 0%, transparent 55%)';

const onNavyFocus = {
  '&:focus-visible': { outline: '2px solid', outlineColor: 'secondary.main', outlineOffset: 2 },
};

export const revalidate = 86400;

export default async function ToolsLandingPage() {
  const pages = await allGeoPages();
  const byState = STATES_BY_NAME.map((st) => ({
    state: st,
    links: pages.filter((p) => p.kind === 'state' && p.stateSlug === st.slug && p.index),
  })).filter((g) => g.links.length > 0);

  return (
    <Box sx={{ color: 'text.primary' }}>
      <JsonLd data={breadcrumbSchema} />

      <Box sx={{ pb: { xs: 2, md: 4 } }}>
        {/* Hero */}
        <Box
          component="section"
          aria-labelledby="tools-hero-heading"
          sx={{
            mt: { xs: 1, md: 2 },
            mb: { xs: 4, md: 6 },
            p: { xs: 2.5, sm: 4, md: 6 },
            borderRadius: { xs: 4, md: 5 },
            bgcolor: NAVY,
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundImage: NAVY_GRID,
            backgroundSize: '24px 24px, 24px 24px, 100% 100%',
            color: '#F5F0E8',
          }}
        >
          <Typography
            component="p"
            sx={{ fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'secondary.main', mb: 1 }}
          >
            aiArchitek tools
          </Typography>
          <Typography
            id="tools-hero-heading"
            variant="h1"
            sx={{ fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.75rem' }, lineHeight: 1.2, color: '#FFFFFF', mb: 1.5, maxWidth: 760 }}
          >
            Free NATA, JEE Paper 2 and B.Arch counseling tools
          </Typography>
          <Typography sx={{ fontSize: { xs: '1rem', md: '1.125rem' }, lineHeight: 1.6, color: 'rgba(245,240,232,0.86)', maxWidth: 640, mb: 2.5 }}>
            Know your cutoff, see which colleges you can realistically get, check COA approval and plan every exam date. One
            app, from your first mock to your final seat.
          </Typography>

          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', columnGap: 2.5, rowGap: 1, mb: 3 }}>
            {BENEFITS.map((benefit) => (
              <Box component="li" key={benefit} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.9375rem', fontWeight: 600 }}>
                <CheckCircleOutlineRoundedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'secondary.main' }} />
                {benefit}
              </Box>
            ))}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
            <Button
              component={Link}
              href={OPEN_APP_HREF}
              variant="contained"
              color="secondary"
              size="large"
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{ minHeight: 48, px: 3, fontWeight: 700, ...onNavyFocus }}
            >
              Open the app
            </Button>
            <Button
              component={Link}
              href="/"
              variant="outlined"
              size="large"
              sx={{
                minHeight: 48,
                px: 3,
                color: '#FFFFFF',
                borderColor: 'rgba(255,255,255,0.5)',
                '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.08)' },
                ...onNavyFocus,
              }}
            >
              About aiArchitek
            </Button>
          </Box>
        </Box>

        {/* Every tool, grouped by stage */}
        <PublicToolsGrid />

        {/* Local pages: only the indexed state pages, so every link has real local facts behind it */}
        {byState.length > 0 && (
          <Box component="section" aria-labelledby="state-tools-heading" sx={{ mb: { xs: 4, md: 5 } }}>
            <Typography id="state-tools-heading" component="h2" sx={{ fontSize: { xs: '1.125rem', md: '1.25rem' }, fontWeight: 700, mb: 1.5 }}>
              {STATE_LINKS_HEADING}
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
              {byState.map((g) => (
                <Box component="li" key={g.state.slug} sx={{ p: 2, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                  <Typography component="h3" sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5 }}>
                    {g.state.name}
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2 }}>
                    {g.links.map((l) => (
                      <Box
                        key={l.path}
                        component={Link}
                        href={l.path}
                        sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, color: 'primary.main', fontSize: '0.9375rem', textDecoration: 'underline', textUnderlineOffset: 3 }}
                      >
                        {TOOL_LABEL[l.tool] ?? l.tool}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* About and help */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' } }}>
          <Box
            component="section"
            aria-labelledby="about-tools-heading"
            sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <InfoOutlinedIcon aria-hidden="true" sx={{ color: 'primary.main', fontSize: 22 }} />
              <Typography id="about-tools-heading" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                About these tools
              </Typography>
            </Box>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', lineHeight: 1.65 }}>
              Our tools are built on real data from previous years&apos; admissions and official sources. Actual cutoffs and
              allotments can change each year, so use the results as a guide for your preparation, not a guarantee.
            </Typography>
          </Box>

          <Box
            component="section"
            aria-labelledby="tools-help-heading"
            sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3.5, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
          >
            <Typography id="tools-help-heading" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 0.5 }}>
              Need help choosing?
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem', mb: 1.5 }}>
              Talk to the Neram Classes team, Monday to Saturday, 9 AM to 6 PM.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Button
                component="a"
                href="tel:+919176137043"
                variant="outlined"
                startIcon={<PhoneOutlinedIcon />}
                sx={{ minHeight: 44, justifyContent: 'flex-start' }}
              >
                Call +91 91761 37043
              </Button>
              <Button
                component="a"
                href="mailto:info@neramclasses.com"
                variant="outlined"
                startIcon={<MailOutlineRoundedIcon />}
                sx={{ minHeight: 44, justifyContent: 'flex-start', overflowWrap: 'anywhere' }}
              >
                Email info@neramclasses.com
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
