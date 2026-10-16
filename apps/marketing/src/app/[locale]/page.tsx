import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateOrganizationSchema, generateWebSiteSchema, generateBreadcrumbSchema, generateFAQSchema, generateFounderPersonSchema } from '@/lib/seo/schemas';
import HomePageContent from '@/components/HomePageContent';
import { getCachedAskSeniorsEvent, getCachedAskSeniorsColleges } from '@/lib/ask-seniors-data';
import ClientIntl from '@/components/i18n/ClientIntl';
import { buildAlternates } from '@/lib/seo/metadata';
import { COURSE_FEES, ORG_FACTS, PROOF_POINTS } from '@/lib/seo/facts';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { Section, CtaBand, CtaButton, FaqList } from '@/design-system';
import { APP_URL } from '@/lib/seo/constants';

// ISR daily. The only data here is the #AskSeniors block (tagged 'ask-seniors',
// purged on admin event edits). It used to be hourly, which rebuilt the home
// page 24 times a day in every locale.
export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';

// Light long-form band (server-rendered for crawlers). Inline styles read the
// design-system tokens; gold text on light is gold800.
const LINK = { color: t.gold800, textDecoration: 'underline', textUnderlineOffset: '2px' } as const;
const H2 = { fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, color: t.ink, margin: '0 0 24px', lineHeight: 1.15 } as const;
const H3 = { fontSize: 'clamp(1.25rem, 2vw, 1.375rem)', fontWeight: 700, color: t.ink, margin: '40px 0 16px', lineHeight: 1.25 } as const;
const P = { fontSize: '1rem', lineHeight: 1.7, color: t.ink, margin: '0 0 20px', maxWidth: '780px' } as const;
const CARD = {
  display: 'flex',
  alignItems: 'center',
  minHeight: '48px',
  boxSizing: 'border-box',
  color: t.ink,
  background: t.ground,
  textDecoration: 'none',
  padding: '12px 16px',
  border: `1px solid ${t.line}`,
  borderRadius: `${t.radius}px`,
  fontSize: '0.9375rem',
} as const;

const crash = COURSE_FEES.find((c) => c.slug === 'crash-course')!;
const oneYear = COURSE_FEES.find((c) => c.slug === '1-year-program')!;
const twoYear = COURSE_FEES.find((c) => c.slug === '2-year-program')!;
const FEES_LINE =
  `The ${crash.name} (${crash.duration.toLowerCase()}) is ₹${crash.priceDisplay}. ` +
  `The ${oneYear.name} is ₹${oneYear.priceDisplay}, or ₹${oneYear.singlePaymentDisplay} if paid at once. ` +
  `The ${twoYear.name} is ₹${twoYear.priceDisplay}, or ₹${twoYear.singlePaymentDisplay} if paid at once.`;

/** Classroom cities, each linked to its one city page. */
const CLASSROOM_CITIES: Array<[label: string, slug: string]> = [
  ['Chennai (Ashok Nagar)', 'chennai'],
  ['Tambaram', 'tambaram'],
  ['Kanchipuram', 'kanchipuram'],
  ['Coimbatore', 'coimbatore'],
  ['Tiruppur', 'tiruppur'],
  ['Trichy', 'trichy'],
  ['Madurai', 'madurai'],
  ['Pudukkottai', 'pudukkottai'],
  ['Bangalore (Electronic City)', 'bangalore'],
];
const cityHref = (slug: string) => `/coaching/nata-coaching/nata-coaching-centers-in-${slug}`;

/** One list feeds both the FAQPage JSON-LD and the visible FAQ, so they never drift. */
const HOME_FAQS = [
  {
    question: 'What is Neram Classes?',
    answer: `Neram Classes coaches students for NATA, JEE Main Paper 2 (B.Arch), AAT and PGETA. It was founded in 2009 by ${ORG_FACTS.founder} (${ORG_FACTS.founderCredential}). In ${PROOF_POINTS.years} Neram has taught ${PROOF_POINTS.students}, and a Neram student secured ${PROOF_POINTS.topResult}.`,
  },
  {
    question: 'Where are Neram Classes classrooms?',
    answer: 'Neram has classrooms in Chennai (Ashok Nagar and Tambaram), Kanchipuram, Coimbatore, Tiruppur, Trichy, Madurai and Pudukkottai in Tamil Nadu, and in Electronic City, Bangalore. Students in every other city join live online classes.',
  },
  {
    question: 'Can I prepare for NATA through online classes?',
    answer: 'Yes. Online students attend the same live classes as classroom students, send their drawings for feedback, and take the same mock tests. Students join from across India and the Gulf.',
  },
  {
    question: 'How much does NATA coaching cost at Neram Classes?',
    answer: `${FEES_LINE} Scholarships and instalment options are available. See the fees page for details.`,
  },
  {
    question: 'Which exams does Neram Classes prepare students for?',
    answer: 'NATA, JEE Main Paper 2A (B.Arch) and 2B (B.Planning), AAT for the IIT B.Arch programmes, and PGETA for M.Arch. Neram covers architecture entrance exams only.',
  },
  {
    question: 'What free tools does Neram offer?',
    answer: 'The free Neram app at app.neramclasses.com has a NATA cutoff calculator, a B.Arch college predictor, an exam centre finder and a question bank preview. You can try each tool before signing in.',
  },
  {
    question: 'What is the difference between the free app and Nexus?',
    answer: 'The free app is open to everyone. Nexus is the learning platform for enrolled Neram students, built with Microsoft Education. It holds the full question bank with past papers, drawing reviews by tutors, recorded classes, the class timetable and a dashboard for parents.',
  },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    // The layout's '%s | Neram Classes' template does not apply to the page in the
    // layout's own segment, so the home title carries the brand itself.
    title: { absolute: 'NATA Coaching: Online and Classroom Since 2009 | Neram Classes' },
    description: `NATA and JEE Paper 2 coaching since 2009: ${PROOF_POINTS.line}. Live online classes across India and the Gulf, classrooms in Tamil Nadu and Bangalore.`,
    keywords:
      'NATA coaching, NATA coaching online, NATA coaching centre, NATA classes, NATA drawing classes, JEE Paper 2 coaching, B.Arch entrance coaching, NATA coaching Chennai, NATA coaching Bangalore, NATA coaching Tamil Nadu, NATA 2026 preparation',
    // The home page is English in every locale, so /ta, /hi, /kn and /ml point
    // their canonical at / (lib/seo/indexable-locales.ts).
    alternates: buildAlternates(locale, ''),
    openGraph: {
      title: 'Neram Classes: NATA Coaching Online and in Classrooms Since 2009',
      description: `${PROOF_POINTS.line}. Live online NATA classes across India and the Gulf, classrooms in Tamil Nadu and Bangalore.`,
      type: 'website',
      url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}`,
    },
  };
}

export default async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const [askSeniorsEvent, askSeniorsColleges] = await Promise.all([
    getCachedAskSeniorsEvent().catch(() => null),
    getCachedAskSeniorsColleges().catch(() => []),
  ]);

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd data={generateWebSiteSchema()} />
      <JsonLd data={generateFounderPersonSchema()} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
        ])}
      />
      <JsonLd data={generateFAQSchema(HOME_FAQS)} />
      <ClientIntl locale={locale} namespaces={['home', 'youtube']}><HomePageContent askSeniorsEvent={askSeniorsEvent} askSeniorsColleges={askSeniorsColleges} /></ClientIntl>

      {/* SEO Content: server-rendered for full crawler visibility */}
      <Section tone="white" id="about-neram" gap={0}>
        <div>

          <h2 style={H2}>NATA Coaching Since 2009: Neram Classes</h2>
          <p style={P}>
            Neram Classes prepares students for NATA (the National Aptitude Test in Architecture), JEE Main Paper 2, AAT and PGETA. It was founded in 2009 by {ORG_FACTS.founder} ({ORG_FACTS.founderCredential}). In {PROOF_POINTS.years} Neram has taught {PROOF_POINTS.students}, and a Neram student secured {PROOF_POINTS.topResult}.
          </p>
          <p style={P}>
            Classes cover the full NATA syllabus: mathematics, general aptitude and drawing. Drawing gets the most time, because every sketch a student submits comes back with a tutor&apos;s feedback. Students take timed mock tests in the same format as the exam, and get help with B.Arch counselling after the results.
          </p>

          <h3 style={H3}>Live online classes and classrooms</h3>
          <p style={P}>
            Students anywhere in India or the Gulf join the <a href="/nata-online-coaching" style={{ ...LINK, fontWeight: 600 }}>live online NATA classes</a>. Students near a Neram classroom can attend in person:{' '}
            {CLASSROOM_CITIES.map(([label, slug], i) => (
              <span key={slug}>
                <a href={cityHref(slug)} style={LINK}>{label}</a>
                {i < CLASSROOM_CITIES.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>
          <p style={P}>
            {FEES_LINE} See <a href="/fees" style={LINK}>all fees</a>, compare us with <a href="/nata-online-coaching/comparison" style={LINK}>other institutes</a>, or study the <a href="/nata-cutoff-trends-2015-2025" style={LINK}>10-year NATA cutoff trend</a> before you set your target.
          </p>

          <h3 style={H3}>Free NATA tools</h3>
          <p style={P}>
            The free Neram app at <a href="https://app.neramclasses.com" style={LINK}>app.neramclasses.com</a> has a NATA cutoff calculator, a B.Arch college predictor, an exam centre finder and a question bank preview. Read more about the tools and the classroom AI features on the <a href="/aiarchitek" style={LINK}>aiArchitek page</a>.
          </p>

          <h3 style={H3}>NATA coaching near you</h3>
          <p style={P}>
            Each city page lists the nearest NATA test centres, the architecture colleges nearby and how classes work from that city. Browse the <a href="/coaching/nata-coaching" style={LINK}>all-India list of states and cities</a>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {CLASSROOM_CITIES.map(([label, slug]) => (
              <a key={slug} href={cityHref(slug)} style={CARD}>NATA coaching in {label.replace(/ \(.*\)$/, '')} →</a>
            ))}
            <a href="/nata-online-coaching" style={{ ...CARD, fontWeight: 600 }}>NATA online coaching →</a>
          </div>

          <h3 style={H3}>NATA Coaching by State</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              ['tamil-nadu', 'Tamil Nadu'], ['karnataka', 'Karnataka'], ['kerala', 'Kerala'], ['maharashtra', 'Maharashtra'],
              ['delhi', 'Delhi'], ['andhra-pradesh', 'Andhra Pradesh'], ['telangana', 'Telangana'], ['rajasthan', 'Rajasthan'],
              ['gujarat', 'Gujarat'], ['west-bengal', 'West Bengal'],
            ].map(([slug, name]) => (
              <a key={slug} href={`/coaching/nata-coaching-in-${slug}`} style={CARD}>NATA Coaching in {name} →</a>
            ))}
          </div>

          <h3 style={H3}>Frequently Asked Questions</h3>
          <div style={{ maxWidth: `${t.container.narrow}px` }}>
            <FaqList items={HOME_FAQS} />
          </div>

        </div>
      </Section>

      <CtaBand
        title="Ready to Start Your Journey?"
        lede="Join thousands of successful students who chose Neram Classes"
        actions={
          <>
            <CtaButton href="/apply">Apply Now</CtaButton>
            <CtaButton variant="link" href={`${APP_URL}/tools`} external>
              Explore Free Tools
            </CtaButton>
          </>
        }
      />
    </>
  );
}
