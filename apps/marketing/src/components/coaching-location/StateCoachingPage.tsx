/**
 * "NATA / JEE Paper 2 coaching in {state}". Lists every city page in the state,
 * the state's B.Arch colleges, NATA test cities, counselling route and, where
 * relevant, AAT (IIT B.Arch) and PGETA (M.Arch) blocks.
 *
 * Journey: entered from search, the all-India directory or a city page's
 * breadcrumb. Back goes to the directory; city links go down a level.
 */
import Link from 'next/link';
import { Box, Container, Typography, Button, Chip } from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LaptopOutlinedIcon from '@mui/icons-material/LaptopOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { JsonLd } from '@/components/seo/JsonLd';
import { NataAssistanceForm } from '@/components/nata/NataAssistanceForm';
import { BASE_URL } from '@/lib/seo/constants';
import { COURSE_FEES } from '@/lib/fees';
import { EXAMS } from '@/lib/seo/exam-config';
import type { StateFacts } from '@/lib/seo/location-facts';
import { classroomPlaces, hubNames, inr, stateAnswer, stateFaqs } from '@/lib/seo/location-copy';
import { generateBreadcrumbSchema, generateFAQSchema, generateLocationCourseSchema } from '@/lib/seo/schemas';
import { stateToolLinks } from '@/lib/seo/app-tool-links';
import { Breadcrumbs, FactTable, FaqList, LinkGrid, Section, StickyCta, STICKY_CTA_HEIGHT, type Crumb, type LinkItem } from './parts';

export interface StateCoachingPageProps {
  facts: StateFacts;
  locale: string;
  /** City pages in the state; indexed ones are shown first. */
  cities: Array<LinkItem & { indexed: boolean }>;
  siblingExam?: LinkItem | null;
}

export function StateCoachingPage({ facts, locale, cities, siblingExam }: StateCoachingPageProps) {
  const exam = EXAMS[facts.exam];
  const state = facts.state;
  const path = exam.statePath(state.slug);
  const url = `${BASE_URL}${path}`;
  const h1 = `${exam.name} Coaching in ${state.name}`;
  const answer = stateAnswer(facts);
  const faqs = stateFaqs(facts);
  const hubs = hubNames(facts.counsellingHubs);
  const content = facts.content;
  const featured = cities.filter((c) => c.indexed);
  const others = cities.filter((c) => !c.indexed);

  const crumbs: Crumb[] = [
    { name: 'Home', href: '/' },
    { name: `${exam.name} Coaching`, href: exam.directoryPath },
    { name: state.name },
  ];

  const factRows = [
    {
      label: 'How you learn',
      value: facts.classrooms.length ? `Classroom in ${classroomPlaces(facts.classrooms)}; live online everywhere else` : 'Live online',
    },
    { label: 'B.Arch colleges listed', value: facts.collegeCount ? String(facts.collegeCount) : 'None in our list yet' },
    ...(facts.testCities.length ? [{ label: `NATA ${facts.testCities[0].year} test cities`, value: facts.testCities.map((t) => t.label).join(', ') }] : []),
    ...(hubs.length
      ? [
          {
            label: 'State counselling',
            value: (
              <>
                {hubs.map((h, i) => (
                  <span key={h.slug}>
                    {i > 0 && ', '}
                    {h.url ? <Link href={h.url}>{h.name}</Link> : h.name}
                  </span>
                ))}
              </>
            ),
          },
        ]
      : []),
    { label: 'Fees', value: <Link href="/fees">From {inr(Math.min(...COURSE_FEES.map((c) => c.price)))}</Link> },
  ];

  const schema = [
    generateLocationCourseSchema({
      name: h1,
      description: answer.join(' '),
      url,
      exam: facts.exam === 'nata' ? 'NATA' : 'JEE Paper 2',
      area: { type: 'State', name: state.name, containedIn: { type: 'Country', name: 'India' } },
      classroom: facts.classrooms[0] ? { name: facts.classrooms[0].centre.name, url: `${BASE_URL}${facts.classrooms[0].url}` } : null,
    }),
    generateFAQSchema(faqs),
    generateBreadcrumbSchema(crumbs.map((c) => ({ name: c.name, url: c.href ? `${BASE_URL}${c.href}` : url }))),
  ];

  return (
    <Box sx={{ pb: { xs: `${STICKY_CTA_HEIGHT}px`, md: 0 } }}>
      <JsonLd data={schema} />

      <Box component="header" sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="md">
          <Breadcrumbs items={crumbs} />
          <Typography variant="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem', md: '2.5rem' }, fontWeight: 800, lineHeight: 1.2, mb: 2 }}>
            {h1}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip
              icon={facts.classrooms.length ? <SchoolOutlinedIcon aria-hidden /> : <LaptopOutlinedIcon aria-hidden />}
              label={facts.classrooms.length ? 'Classroom and live online' : 'Live online'}
              color="primary"
              variant="outlined"
            />
            <Chip label={`${cities.length} city pages`} variant="outlined" />
          </Box>
          <Box id="answer" sx={{ '& p': { fontSize: '1.0625rem', lineHeight: 1.65, mb: 1.5 } }}>
            {answer.map((s) => (
              <Typography key={s} component="p">
                {s}
              </Typography>
            ))}
          </Box>
          <Button variant="contained" component={Link} href="/demo-class" sx={{ mt: 1, minHeight: 48, fontWeight: 600, width: { xs: '100%', sm: 'auto' } }}>
            Book a free demo class
          </Button>
        </Container>
      </Box>

      <Section id="facts" title={`${exam.name} in ${state.name} at a glance`}>
        <FactTable caption={`Key facts for students in ${state.name}`} rows={factRows} />
      </Section>

      {cities.length > 0 && (
        <Section id="cities" title={`${exam.name} coaching by city in ${state.name}`} muted>
          <LinkGrid items={featured.length ? featured : cities.slice(0, 12)} />
          {featured.length > 0 && others.length > 0 && (
            <>
              <Typography variant="h3" sx={{ fontSize: '1.0625rem', fontWeight: 700, mt: 3, mb: 1 }}>
                More cities in {state.name}
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {others.map((c) => (
                  <li key={c.href}>
                    <Box
                      component={Link}
                      href={c.href}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: 44,
                        px: 1.5,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 5,
                        color: 'text.primary',
                        textDecoration: 'none',
                        fontSize: '0.9375rem',
                        '&:hover': { borderColor: 'primary.main' },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                      }}
                    >
                      {c.label}
                    </Box>
                  </li>
                ))}
              </Box>
            </>
          )}
        </Section>
      )}

      <Section id="free-tools" title={`Free tools for students in ${state.name}`}>
        <LinkGrid items={stateToolLinks(state.slug, state.name, facts.collegeCount > 0)} />
      </Section>

      {content && (
        <Section id="local" title={`Architecture in ${state.name}`}>
          <Typography sx={{ lineHeight: 1.7, mb: 2 }}>{content.description}</Typography>
          <Box component="ul" sx={{ pl: 0, listStyle: 'none', m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {content.highlights.map((h) => (
              <Box component="li" key={h} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <CheckCircleOutlineIcon aria-hidden fontSize="small" sx={{ color: 'success.main', mt: '3px' }} />
                <Typography sx={{ lineHeight: 1.6 }}>{h}</Typography>
              </Box>
            ))}
          </Box>
        </Section>
      )}

      {facts.colleges.length > 0 && (
        <Section id="colleges" title={`B.Arch colleges in ${state.name}`} muted>
          <LinkGrid
            items={facts.colleges.map((c) => ({
              label: c.shortName || c.name,
              href: c.url,
              hint: [c.city, c.nirfRank ? `NIRF #${c.nirfRank}` : null].filter(Boolean).join(' · '),
            }))}
          />
          {facts.collegeCount > facts.colleges.length && (
            <Button component={Link} href={`/colleges/${state.slug}`} sx={{ mt: 2, minHeight: 48 }}>
              See all {facts.collegeCount} colleges in {state.name}
            </Button>
          )}
        </Section>
      )}

      <Section id="counselling" title={`From ${exam.name} score to a B.Arch seat in ${state.name}`}>
        <Typography sx={{ lineHeight: 1.7, mb: 2 }}>
          {hubs.length
            ? `State B.Arch seats in ${state.name} are allotted through ${hubs.map((h) => h.name).join(' and ')} counselling.`
            : `${state.name} has no separate B.Arch counselling, so students apply to colleges in other states and through national counselling.`}{' '}
          NIT, IIIT and SPA seats are filled through JoSAA with a JEE Paper 2 score.
        </Typography>
        <LinkGrid
          items={[
            ...hubs.filter((h) => h.url).map((h) => ({ label: `${h.name} B.Arch counselling`, href: h.url!, hint: 'Dates, documents, cutoffs' })),
            { label: 'JoSAA B.Arch counselling', href: '/counseling/josaa', hint: 'NITs, IIITs, SPAs' },
          ]}
        />
      </Section>

      {(facts.aatColleges.length > 0 || facts.exam === 'jee-paper-2') && (
        <Section id="aat" title="Aiming for an IIT? AAT and PGETA" muted>
          <Typography sx={{ lineHeight: 1.7, mb: 2 }}>
            IIT B.Arch seats need JEE Advanced and the Architecture Aptitude Test (AAT).
            {facts.aatColleges.length > 0 &&
              ` In ${state.name}, ${facts.aatColleges.map((c) => c.shortName || c.name).join(' and ')} ${facts.aatColleges.length === 1 ? 'admits' : 'admit'} through AAT.`}{' '}
            After B.Arch, PGETA is the entrance for M.Arch at the SPAs.
          </Typography>
          <LinkGrid
            items={[
              { label: 'AAT 2026 guide', href: '/aat-2026', hint: 'Exam pattern, IIT seats, centres' },
              { label: 'PGETA 2026 guide', href: '/pgeta-2026', hint: 'M.Arch entrance for the SPAs' },
            ]}
          />
        </Section>
      )}

      <Section id="callback" title={`Get a free ${exam.name} study plan`}>
        <NataAssistanceForm locale={locale} defaultDistrict={state.capital} source={path.slice(1)} />
      </Section>

      <Section id="faq" title="Questions students ask" muted>
        <FaqList faqs={faqs} />
      </Section>

      <Section id="related" title="Keep exploring">
        <LinkGrid
          items={[
            { label: `Online ${exam.name} coaching`, href: exam.nationalPath, hint: 'How the live classes work' },
            { label: 'Fees and batches', href: '/fees' },
            { label: 'All states and cities', href: exam.directoryPath },
            ...(siblingExam ? [siblingExam] : []),
          ]}
        />
      </Section>

      <StickyCta />
    </Box>
  );
}
