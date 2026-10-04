/**
 * "NATA / JEE Paper 2 coaching in {city}". One template for every city page,
 * built entirely from computed facts (lib/seo/location-facts.ts) and the copy
 * builders (lib/seo/location-copy.ts). Server-rendered; the only client JS is
 * the lead form.
 *
 * Journey: entered from search, the state page, the all-India directory or a
 * nearby city. Back goes to the state page (breadcrumb); the CTAs go to the
 * demo class and the application form.
 */
import Link from 'next/link';
import { Box, Container, Typography, Button, Chip } from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LaptopOutlinedIcon from '@mui/icons-material/LaptopOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { JsonLd } from '@/components/seo/JsonLd';
import { NataAssistanceForm } from '@/components/nata/NataAssistanceForm';
import { BASE_URL } from '@/lib/seo/constants';
import { COURSE_FEES } from '@/lib/fees';
import { EXAMS } from '@/lib/seo/exam-config';
import type { CityFacts } from '@/lib/seo/location-facts';
import { cityAnswer, cityFaqs, cityH1, hubNames, inr } from '@/lib/seo/location-copy';
import { centreSchemaId, generateBreadcrumbSchema, generateCentreSchema, generateFAQSchema, generateLocationCourseSchema } from '@/lib/seo/schemas';
import { hasFullAddress } from '@/lib/seo/facts';
import { appToolLinks, stateToolLinks } from '@/lib/seo/app-tool-links';
import { CentreVisit } from './CentreVisit';
import { CentreAbout, CentreHeroPhoto, heroPhotoOf, type TravelFrom } from './CentreAbout';
import { fullAddressLine } from '@/lib/seo/centre-page';
import { ClassVideo } from './ClassVideo';
import { cityVideoSchema, type CityVideo } from '@/lib/seo/location-videos';
import type { PublicReview } from '@/lib/reviews/json-ld';
import { WhatsAppLinkButton } from '@/components/WhatsAppLinkButton';
import { Breadcrumbs, FactTable, FaqList, LinkGrid, Section, StickyCta, STICKY_CTA_HEIGHT, UpdatedLine, type Crumb, type LinkItem } from './parts';

export interface CityCoachingPageProps {
  facts: CityFacts;
  locale: string;
  /** Nearby city pages (indexable ones first). */
  nearby: LinkItem[];
  /** The other exam's page for the same city, when it exists. */
  siblingExam?: LinkItem | null;
  /** Published, moderated reviews: from this city, or the state when the city has fewer than two. */
  reviews?: { scope: 'city' | 'state'; reviews: PublicReview[] };
  /** Class clips and reviews tagged with this city. */
  videos?: CityVideo[];
  /** Classroom cities: nearby towns with no classroom of their own. */
  travelFrom?: TravelFrom[];
}

const MODE_LABEL: Record<CityFacts['mode'], string> = {
  classroom: 'Classroom and live online',
  'online-near-classroom': 'Live online, classroom nearby',
  online: 'Live online',
};

/** "Madurai · NATA 2025 · Anna University" from whatever the review has. */
const reviewMeta = (r: PublicReview) =>
  [r.city, r.examType && r.year ? `${r.examType.replace(/_/g, ' ')} ${r.year}` : null, r.collegeAdmitted].filter(Boolean).join(' · ');

export function CityCoachingPage({ facts, locale, nearby, siblingExam, reviews, videos = [], travelFrom = [] }: CityCoachingPageProps) {
  const exam = EXAMS[facts.exam];
  const place = facts.place;
  const path = exam.cityPath(place.slug);
  const url = `${BASE_URL}${path}`;
  const h1 = cityH1(facts);
  const isCentrePage = facts.mode === 'classroom' && facts.centres.length > 0;
  const hero = isCentrePage ? heroPhotoOf(facts.centres) : null;
  const addressLine = isCentrePage && facts.centres.length === 1 ? fullAddressLine(facts.centres[0]) : null;
  const answer = cityAnswer(facts);
  const faqs = cityFaqs(facts);
  const hubs = hubNames(facts.counsellingHubs);
  const content = facts.content;

  const crumbs: Crumb[] = [
    { name: 'Home', href: '/' },
    { name: `${exam.name} Coaching`, href: exam.directoryPath },
    ...(place.kind === 'india' && facts.state ? [{ name: facts.state.name, href: exam.statePath(facts.state.slug) }] : []),
    { name: place.name },
  ];

  const test = facts.testCities[0];
  const factRows = [
    { label: 'How you learn', value: MODE_LABEL[facts.mode] },
    ...(facts.classroom
      ? [
          {
            label: 'Nearest classroom',
            value: (
              <Link href={facts.classroom.url}>
                {facts.classroom.centre.areaLabel}
                {facts.mode === 'classroom' ? '' : `, about ${facts.classroom.km} km`}
              </Link>
            ),
          },
        ]
      : []),
    ...(test
      ? [
          {
            label: `Nearest NATA ${test.year} test city`,
            value: test.inThisCity ? `${test.label} (in the city)` : test.km === null ? test.label : `${test.label}, about ${test.km} km`,
          },
        ]
      : []),
    ...(place.kind === 'india'
      ? [
          {
            label: 'B.Arch colleges listed',
            value: facts.localCollegeCount
              ? `${facts.localCollegeCount} in and around ${place.name}, ${facts.stateCollegeCount} in ${facts.regionName}`
              : `${facts.stateCollegeCount} in ${facts.regionName}`,
          },
        ]
      : []),
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

  // The centre belongs to its NATA city page; JEE pages point at that @id.
  const centreId = (c: NonNullable<CityFacts['classroom']>['centre']) =>
    hasFullAddress(c) ? centreSchemaId(`${BASE_URL}${EXAMS.nata.cityPath(c.citySlug)}`, c.slug) : null;
  const schema = [
    ...(facts.exam === 'nata'
      ? facts.centres.filter(hasFullAddress).map((c) => generateCentreSchema(c, url, { areaServed: travelFrom.map((t) => t.label) }))
      : []),
    ...(hero
      ? [
          {
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            '@id': `${url}#webpage`,
            url,
            name: h1,
            primaryImageOfPage: { '@type': 'ImageObject', contentUrl: hero.url, caption: hero.alt },
          },
        ]
      : []),
    generateLocationCourseSchema({
      name: h1,
      description: answer.join(' '),
      url,
      exam: facts.exam === 'nata' ? 'NATA' : 'JEE Paper 2',
      area: {
        type: 'City',
        name: place.name,
        containedIn: { type: place.kind === 'india' ? 'State' : 'Country', name: facts.regionName },
      },
      classroom: facts.classroom
        ? { name: facts.classroom.centre.name, url: `${BASE_URL}${facts.classroom.url}`, id: centreId(facts.classroom.centre) }
        : null,
    }),
    ...videos.map(cityVideoSchema),
    generateFAQSchema(faqs),
    generateBreadcrumbSchema(crumbs.map((c) => ({ name: c.name, url: c.href ? `${BASE_URL}${c.href}` : url }))),
  ];

  const related: LinkItem[] = [
    ...(place.kind === 'india' && facts.state
      ? [{ label: `${exam.name} coaching in ${facts.state.name}`, href: exam.statePath(facts.state.slug), hint: 'All cities in the state' }]
      : []),
    { label: `Online ${exam.name} coaching`, href: exam.nationalPath, hint: 'How the live classes work' },
    { label: 'Fees and batches', href: '/fees' },
    { label: 'All states and cities', href: exam.directoryPath },
    ...(siblingExam ? [siblingExam] : []),
  ];

  return (
    <Box sx={{ pb: { xs: `${STICKY_CTA_HEIGHT}px`, md: 0 } }}>
      <JsonLd data={schema} />

      {/* Hero: breadcrumb, H1 and the answer AI assistants quote */}
      <Box component="header" sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 4, md: 6 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="md">
          <Breadcrumbs items={crumbs} />
          {/*
            One photo element placed by grid areas: under the address on a
            phone, beside the text from md up. (Two copies would preload twice.)
          */}
          <Box
            sx={{
              display: 'grid',
              columnGap: 4,
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: hero ? 'minmax(0, 1.15fr) minmax(0, 1fr)' : 'minmax(0, 1fr)' },
              gridTemplateAreas: { xs: '"head" "photo" "body"', md: hero ? '"head photo" "body photo"' : '"head" "body"' },
              alignItems: 'start',
            }}
          >
            <Box sx={{ gridArea: 'head', minWidth: 0 }}>
              <Typography
                variant="h1"
                sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem', md: '2.5rem' }, fontWeight: 800, lineHeight: 1.2, mb: addressLine ? 1 : 2 }}
              >
                {h1}
              </Typography>
              {addressLine && (
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 2 }}>
                  <PlaceOutlinedIcon aria-hidden fontSize="small" sx={{ color: 'primary.main', mt: '3px' }} />
                  <Typography component="p" sx={{ lineHeight: 1.55 }}>
                    <Box component="a" href="#visit" sx={{ color: 'text.primary', fontWeight: 600 }}>
                      {addressLine}
                    </Box>
                    {facts.centres[0].landmark && (
                      <Box component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                        {facts.centres[0].landmark}
                      </Box>
                    )}
                  </Typography>
                </Box>
              )}
            </Box>

            {hero && (
              <Box sx={{ gridArea: 'photo', mb: { xs: 2, md: 0 }, pt: { md: 1 } }}>
                <CentreHeroPhoto photo={hero} />
              </Box>
            )}

            <Box sx={{ gridArea: 'body', minWidth: 0 }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Chip
                  icon={facts.mode === 'classroom' ? <SchoolOutlinedIcon aria-hidden /> : <LaptopOutlinedIcon aria-hidden />}
                  label={MODE_LABEL[facts.mode]}
                  color="primary"
                  variant="outlined"
                />
                {facts.regionName && <Chip icon={<PlaceOutlinedIcon aria-hidden />} label={facts.regionName} variant="outlined" />}
              </Box>
              <Box id="answer" sx={{ '& p': { fontSize: '1.0625rem', lineHeight: 1.65, color: 'text.primary', mb: 1.5 } }}>
                {answer.map((s) => (
                  <Typography key={s} component="p">
                    {s}
                  </Typography>
                ))}
              </Box>
              <UpdatedLine
                iso={facts.lastModified}
                sources={[
                  ...(facts.testCities[0] ? [`NATA ${facts.testCities[0].year} test city list`] : []),
                  ...(facts.colleges.length ? ['the Neram college hub'] : []),
                  ...(facts.classroom ? ['Neram classroom records'] : []),
                ]}
              />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
                <Button variant="contained" component={Link} href="/demo-class" sx={{ minHeight: 48, fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
                  Book a free demo class
                </Button>
                <WhatsAppLinkButton city={place.name} citySlug={place.slug} variant="outlined" sx={{ display: { xs: 'none', md: 'inline-flex' } }} />
                {facts.classroom && (
                  <Button variant="outlined" component={Link} href={facts.classroom.url} sx={{ minHeight: 48, fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
                    {facts.mode === 'classroom' ? 'Visit the classroom' : `Nearest classroom: ${facts.classroom.centre.areaLabel}`}
                  </Button>
                )}
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      {isCentrePage && <CentreAbout placeName={place.name} centres={facts.centres} travelFrom={travelFrom} heroShown={!!hero} />}

      <Section id="facts" title={`${exam.name} preparation in ${place.name} at a glance`}>
        <FactTable caption={`Key facts for ${place.name} students`} rows={factRows} />
      </Section>

      {videos.length > 0 && (
        <Section id="videos" title={`Watch a Neram class from ${place.name}`}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {videos.slice(0, 4).map((v) => (
              <ClassVideo key={v.youtubeId} youtubeId={v.youtubeId} title={v.title} />
            ))}
          </Box>
        </Section>
      )}

      <CentreVisit placeName={place.name} centres={facts.centres} siblings={facts.siblingCentres} />

      {reviews && reviews.reviews.length > 0 && (
        <Section id="students" title={reviews.scope === 'city' ? `Students from ${place.name}` : `Students from ${facts.regionName}`}>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            {reviews.reviews.map((r) => (
              <Box component="li" key={r.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                <Typography component="blockquote" sx={{ m: 0, lineHeight: 1.6 }}>
                  {r.body}
                </Typography>
                <Typography sx={{ mt: 1, fontWeight: 600, fontSize: '0.9375rem' }}>
                  {r.displayName}
                  {reviewMeta(r) && (
                    <Typography component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                      {' · '}
                      {reviewMeta(r)}
                    </Typography>
                  )}
                </Typography>
              </Box>
            ))}
          </Box>
          <Button component={Link} href="/reviews" sx={{ mt: 2, minHeight: 48 }}>
            Read more student reviews
          </Button>
        </Section>
      )}

      {content && (content.intro || content.localContext || content.highlights.length > 0) && (
        <Section id="local" title={`Studying for architecture in ${place.name}`} muted>
          {content.intro && <Typography sx={{ lineHeight: 1.7, mb: 2 }}>{content.intro}</Typography>}
          {content.localContext && <Typography sx={{ lineHeight: 1.7, mb: 2 }}>{content.localContext}</Typography>}
          {content.highlights.length > 0 && (
            <Box component="ul" sx={{ pl: 0, listStyle: 'none', m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              {content.highlights.map((h) => (
                <Box component="li" key={h} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <CheckCircleOutlineIcon aria-hidden fontSize="small" sx={{ color: 'success.main', mt: '3px' }} />
                  <Typography sx={{ lineHeight: 1.6 }}>{h}</Typography>
                </Box>
              ))}
            </Box>
          )}
          {content.servedAreas && content.servedAreas.length > 0 && (
            <Typography sx={{ mt: 2, color: 'text.secondary', fontSize: '0.9375rem' }}>
              Students join from {content.servedAreas.join(', ')}.
            </Typography>
          )}
        </Section>
      )}

      {facts.colleges.length > 0 && (
        <Section id="colleges" title={facts.localCollegeCount ? `B.Arch colleges near ${place.name}` : `B.Arch colleges in ${facts.regionName}`}>
          <Typography sx={{ color: 'text.secondary', mb: 2 }}>
            From the Neram college hub, which lists fees, cutoffs and counselling for each college.
          </Typography>
          <LinkGrid
            items={facts.colleges.map((c) => ({
              label: c.shortName || c.name,
              href: c.url,
              hint: [c.city, c.match === 'city' ? 'in the city' : c.match === 'district' ? 'same district' : null, c.nirfRank ? `NIRF #${c.nirfRank}` : null]
                .filter(Boolean)
                .join(' · '),
            }))}
          />
        </Section>
      )}

      {facts.testCities.length > 0 && (
        <Section id="test-cities" title={`NATA test cities near ${place.name}`} muted>
          <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 1, lineHeight: 1.6 } }}>
            {facts.testCities.map((t) => (
              <li key={t.label}>
                <strong>{t.label}</strong>
                {t.inThisCity ? ' (in the city)' : t.km !== null ? `, about ${t.km} km away` : ''}
              </li>
            ))}
          </Box>
          <Typography sx={{ mt: 1.5, color: 'text.secondary', fontSize: '0.9375rem' }}>
            From the NATA {facts.testCities[0].year} test city list. The list can change each year, so check the official
            brochure before you apply.{' '}
            {place.kind === 'india' ? (
              <a href={appToolLinks.examCentresCity(place.stateSlug, place.slug)}>Find the nearest NATA test city to {place.name}</a>
            ) : (
              <Link href="/tools/exam-centers">Find all NATA exam centres</Link>
            )}
            .
          </Typography>
        </Section>
      )}

      {place.kind === 'india' && (
        <Section id="counselling" title={`From ${exam.name} score to a B.Arch seat`}>
          <Typography sx={{ lineHeight: 1.7, mb: 2 }}>
            {hubs.length
              ? `In ${facts.regionName}, state B.Arch seats are allotted through ${hubs.map((h) => h.name).join(' and ')} counselling.`
              : `${facts.regionName} has no separate B.Arch counselling, so students apply to colleges in other states and through national counselling.`}{' '}
            {facts.exam === 'jee-paper-2'
              ? 'NIT, IIIT and SPA seats are filled through JoSAA, with CSAB rounds after it.'
              : 'With a JEE Paper 2 score you can also apply to NITs, IIITs and SPAs through JoSAA.'}
          </Typography>
          <LinkGrid
            items={[
              ...hubs.filter((h) => h.url).map((h) => ({ label: `${h.name} B.Arch counselling`, href: h.url!, hint: 'Dates, documents, cutoffs' })),
              { label: 'JoSAA B.Arch counselling', href: '/counseling/josaa', hint: 'NITs, IIITs, SPAs' },
            ]}
          />
        </Section>
      )}

      <Section id="fees" title="Fees" muted>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {COURSE_FEES.map((c) => (
            <Box key={c.slug} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
              <Typography sx={{ fontWeight: 700 }}>{c.name}</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: '0.9375rem' }}>{c.duration}</Typography>
              <Typography sx={{ fontSize: '1.375rem', fontWeight: 800, mt: 1 }}>{inr(c.price)}</Typography>
              {c.singlePaymentPrice && (
                <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{inr(c.singlePaymentPrice)} if paid at once</Typography>
              )}
            </Box>
          ))}
        </Box>
        <Button component={Link} href="/fees" sx={{ mt: 2, minHeight: 48 }}>
          See what each course includes
        </Button>
      </Section>

      <Section id="callback" title={`Get a free ${exam.name} study plan`}>
        <Typography sx={{ color: 'text.secondary', mb: 2 }}>
          Share your number and a mentor will call with a study plan, fee details and a demo class slot.
        </Typography>
        <NataAssistanceForm locale={locale} defaultDistrict={place.name} source={path.slice(1)} />
      </Section>

      <Section id="faq" title="Questions students ask" muted>
        <FaqList faqs={faqs} />
      </Section>

      {nearby.length > 0 && (
        <Section id="nearby" title="Nearby cities">
          <LinkGrid items={nearby} />
        </Section>
      )}

      {place.kind === 'india' && facts.state && (
        <Section id="free-tools" title={`Free tools for students in ${facts.state.name}`}>
          <LinkGrid items={stateToolLinks(facts.state.slug, facts.state.name, facts.stateCollegeCount > 0)} />
        </Section>
      )}

      <Section id="related" title="Keep exploring" muted>
        <LinkGrid items={related} />
      </Section>

      <StickyCta whatsapp={{ city: place.name, citySlug: place.slug }} />
    </Box>
  );
}
