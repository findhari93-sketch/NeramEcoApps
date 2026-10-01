import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Button } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { Breadcrumbs, FaqList, LinkGrid, Section, StickyCta, STICKY_CTA_HEIGHT } from '@/components/coaching-location/parts';
import { STATES, type StateRegion } from '@/data/geo';
import { BASE_URL } from '@/lib/seo/constants';
import { EXAMS } from '@/lib/seo/exam-config';
import { feeSentence } from '@/lib/seo/location-copy';
import { loadGeoDatasets } from '@/lib/seo/location-data';
import { allCityGates, allStateGates } from '@/lib/seo/location-pages';
import { generateBreadcrumbSchema, generateFAQSchema, generateItemListSchema } from '@/lib/seo/schemas';

/**
 * The all-India directory of NATA coaching location pages: every state and
 * union territory, and every indexed city page under it. Legacy "near me" URLs
 * land here. English only.
 *
 * Journey: entered from search, the footer, the home page and every location
 * page's breadcrumb. Links go down to state and city pages.
 */
export const revalidate = 86400;

const PATH = '/coaching/nata-coaching';

export function generateMetadata(): Metadata {
  const title = 'NATA Coaching in India: All States and Cities';
  const description =
    'Find NATA coaching for your state and city: live online classes everywhere in India, classroom batches in Tamil Nadu and Bangalore, local B.Arch colleges and NATA test cities.';
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}${PATH}` },
    openGraph: { title, description, type: 'website', url: `${BASE_URL}${PATH}` },
  };
}

const REGIONS: Array<{ key: StateRegion; name: string }> = [
  { key: 'south', name: 'South India' },
  { key: 'west', name: 'West India' },
  { key: 'north', name: 'North India' },
  { key: 'central', name: 'Central India' },
  { key: 'east', name: 'East India' },
  { key: 'northeast', name: 'Northeast India' },
  { key: 'islands', name: 'Islands' },
];

const FAQS = [
  {
    question: 'Is there NATA coaching near me?',
    answer:
      'Neram Classes teaches NATA through live online classes that students join from every state in India and from the Gulf. Classroom batches run in Chennai, Tambaram, Kanchipuram, Coimbatore, Tiruppur, Trichy, Madurai, Pudukkottai and Bangalore. Pick your state below to see your city.',
  },
  {
    question: 'Is online NATA coaching as good as a classroom?',
    answer:
      'Online students attend live classes, submit drawings for review and take mock tests. A classroom helps if you live near one and prefer to study in person.',
  },
  {
    question: 'How much does NATA coaching cost?',
    answer: `Neram's fees are ${feeSentence()}. See the fees page for what each course includes.`,
  },
];

interface PageProps {
  params: { locale: string };
}

export default async function NataCoachingDirectory({ params }: PageProps) {
  setRequestLocale(params.locale);
  const ds = await loadGeoDatasets();
  const exam = EXAMS.nata;
  const stateGates = new Map(allStateGates('nata', ds).map((s) => [s.state.slug, s]));
  const indexedCities = allCityGates('nata', ds).filter((c) => c.gate.index);
  const indianByState = new Map<string, typeof indexedCities>();
  const gulf = indexedCities.filter((c) => c.place.kind === 'gulf');
  for (const c of indexedCities) {
    if (c.place.kind !== 'india') continue;
    const list = indianByState.get(c.place.stateSlug) ?? [];
    list.push(c);
    indianByState.set(c.place.stateSlug, list);
  }

  const schema = [
    generateBreadcrumbSchema([
      { name: 'Home', url: BASE_URL },
      { name: 'NATA Coaching', url: `${BASE_URL}${PATH}` },
    ]),
    generateItemListSchema(STATES.map((s) => ({ name: `NATA coaching in ${s.name}`, url: `${BASE_URL}${exam.statePath(s.slug)}` }))),
    generateFAQSchema(FAQS),
  ];

  return (
    <Box sx={{ pb: { xs: `${STICKY_CTA_HEIGHT}px`, md: 0 } }}>
      <JsonLd data={schema} />
      <Box component="header" sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="md">
          <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'NATA Coaching' }]} />
          <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem', md: '2.5rem' }, fontWeight: 800, lineHeight: 1.2, mb: 2 }}>
            NATA Coaching in India: Every State and City
          </Typography>
          <Typography id="answer" sx={{ fontSize: '1.0625rem', lineHeight: 1.65, mb: 2 }}>
            Neram Classes has taught NATA and JEE Paper 2 since 2009. Students in every state learn through live online classes
            with drawing feedback, and classroom batches run in Tamil Nadu and Bangalore. Choose your state to see local B.Arch
            colleges, the nearest NATA test cities and how state counselling works.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button variant="contained" component={Link} href="/demo-class" sx={{ minHeight: 48, fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
              Book a free demo class
            </Button>
            <Button variant="outlined" component={Link} href={exam.nationalPath} sx={{ minHeight: 48, fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
              How online coaching works
            </Button>
          </Box>
        </Container>
      </Box>

      {REGIONS.map((region, i) => {
        const states = STATES.filter((s) => s.region === region.key);
        if (!states.length) return null;
        return (
          <Section key={region.key} id={`region-${region.key}`} title={region.name} muted={i % 2 === 1}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {states.map((s) => {
                const cities = (indianByState.get(s.slug) ?? []).sort((a, b) => b.place.population - a.place.population);
                const sg = stateGates.get(s.slug);
                return (
                  <Box key={s.slug}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                      <Typography variant="h3" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                        <Box
                          component={Link}
                          href={exam.statePath(s.slug)}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 44,
                            color: 'primary.main',
                            textUnderlineOffset: '3px',
                            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                          }}
                        >
                          NATA coaching in {s.name}
                        </Box>
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                        {sg?.facts.classrooms.length ? 'Classroom and online' : 'Online'}
                        {sg?.facts.collegeCount ? ` · ${sg.facts.collegeCount} B.Arch colleges listed` : ''}
                      </Typography>
                    </Box>
                    {cities.length > 0 && (
                      <LinkGrid items={cities.map((c) => ({ label: c.place.name, href: exam.cityPath(c.place.slug) }))} />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Section>
        );
      })}

      {gulf.length > 0 && (
        <Section id="gulf" title="Gulf countries">
          <Typography sx={{ color: 'text.secondary', mb: 2 }}>
            Indian students in the Gulf join the live online classes. The NATA 2025 test city list included Dubai.
          </Typography>
          <LinkGrid items={gulf.map((c) => ({ label: c.place.name, href: exam.cityPath(c.place.slug), hint: c.facts.regionName }))} />
        </Section>
      )}

      <Section id="faq" title="Questions students ask" muted>
        <FaqList faqs={FAQS} />
      </Section>

      <Section id="related" title="Keep exploring">
        <LinkGrid
          items={[
            { label: 'Online NATA coaching', href: '/nata-online-coaching', hint: 'Live classes, drawing review, mock tests' },
            { label: 'JEE Paper 2 coaching', href: '/jee-paper-2-preparation', hint: 'B.Arch through JEE Main' },
            { label: 'Fees and batches', href: '/fees' },
            { label: 'Classroom centres', href: '/centers', hint: 'Tamil Nadu and Bangalore' },
          ]}
        />
      </Section>
      <StickyCta />
    </Box>
  );
}
