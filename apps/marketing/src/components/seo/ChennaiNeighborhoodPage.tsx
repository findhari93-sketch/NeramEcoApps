/**
 * "Best NATA coaching in {neighbourhood}, Chennai" (T6 city coaching template).
 * Server-rendered; the only client JS is the lead form and the WhatsApp button.
 * The page files own the JSON-LD (course, breadcrumb, FAQ); this renders the body.
 *
 * Journey: entered from search or a sibling neighbourhood. Back goes to the
 * Chennai city page (breadcrumb, "Chennai center details"); the CTAs go to the
 * demo class and the application form.
 */
import { getLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { NataAssistanceForm } from '@/components/nata/NataAssistanceForm';
import { WhatsAppLinkButton } from '@/components/WhatsAppLinkButton';
import type { ChennaiNeighborhood } from '@/lib/seo/chennai-neighborhoods';
import { chennaiNeighborhoods } from '@/lib/seo/chennai-neighborhoods';
import { AsideLayout, CheckList, CtaBand, CtaButton, FeeCard, PageHero, Section as Band } from '@/design-system';
import { FactTable, FaqList, LeadCard, LinkGrid, Section, StickyCta, STICKY_CTA_HEIGHT, type Crumb } from '@/components/coaching-location/parts';

interface Props {
  neighborhood: ChennaiNeighborhood;
  /** The page's FAQ; shown on the page because the page also emits it as FAQPage JSON-LD. */
  faqs?: Array<{ question: string; answer: string }>;
}

const CHENNAI_PAGE = '/coaching/nata-coaching/nata-coaching-centers-in-chennai';

const STATS = [
  { value: 'AIR 1', label: 'JEE B.Arch 2024' },
  { value: '1,000+', label: 'Students' },
  { value: '10+', label: 'Years' },
  { value: 'Since 2009', label: 'Founded' },
];

const COURSES = [
  { name: 'NATA Crash Course', duration: '3 Months', fee: '₹15,000', features: ['Quick revision', '30+ mock tests', 'Drawing practice', 'Online + offline'] },
  { name: 'NATA 1-Year Program', duration: '12 Months', fee: '₹25,000', features: ['Complete syllabus', '100+ mock tests', 'Daily drawing (2+ hrs)', 'Personal mentoring', 'Free NATA study app'] },
  { name: 'NATA 2-Year Program', duration: '24 Months', fee: '₹30,000', features: ['Foundation + Advanced', '1-on-1 mentoring', 'NATA + JEE Paper 2', 'Scholarship eligible'] },
];

const bodySx = { m: 0, fontSize: '1.0625rem', lineHeight: 1.7 } as const;
const subheadSx = { m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.35 } as const;

/** A ruled, non-interactive list (landmarks, schools): two columns from ~560px. */
function RuledList({ items }: { items: string[] }) {
  return (
    <Box
      component="ul"
      sx={{
        m: 0,
        p: 0,
        listStyle: 'none',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
        columnGap: 3,
        borderTop: `1px solid ${t.ink}`,
      }}
    >
      {items.map((item) => (
        <Box component="li" key={item} sx={{ py: 1.5, borderBottom: `1px solid ${t.line}`, lineHeight: 1.5 }}>
          {item}
        </Box>
      ))}
    </Box>
  );
}

export default async function ChennaiNeighborhoodPage({ neighborhood, faqs = [] }: Props) {
  const locale = await getLocale();
  const otherNeighborhoods = chennaiNeighborhoods.filter((n) => n.slug !== neighborhood.slug);
  const path = `/coaching/nata-coaching-chennai/${neighborhood.slug}`;

  // Mirrors the BreadcrumbList JSON-LD on the page files.
  const crumbs: Crumb[] = [
    { name: 'Home', href: '/' },
    { name: 'Coaching', href: '/coaching' },
    { name: 'NATA Coaching Chennai', href: CHENNAI_PAGE },
    { name: `NATA Coaching ${neighborhood.name}` },
  ];

  const why = [
    { title: 'Free NATA Study App', body: 'Cutoff calculator, B.Arch college predictor, exam centre finder and question bank preview at app.neramclasses.com.' },
    { title: 'Classroom + Online', body: `Study online from ${neighborhood.name} or attend classes at our Ashok Nagar or Tambaram centre.` },
    { title: 'Individual Drawing Feedback', body: 'Faculty review your drawings one by one and mentor you through your preparation.' },
    { title: 'AIR 1 in JEE B.Arch 2024', body: 'One of our students secured All India Rank 1 in JEE B.Arch 2024. 1,000+ students coached since 2009.' },
    { title: 'Founded by an Architect', body: 'Neram Classes was founded in 2009 by Pushparaj Manoharan, a B.Arch graduate of NIT Trichy.' },
    { title: 'Daily Drawing (2+ hrs)', body: 'Drawing is 80/200 marks in NATA. We provide 2+ hours of supervised drawing practice daily.' },
  ];

  return (
    <Box sx={{ pb: { xs: `${STICKY_CTA_HEIGHT}px`, md: 0 } }}>
      <PageHero
        breadcrumb={crumbs}
        pills={[`${neighborhood.name}, Chennai`]}
        title={`Best NATA Coaching in ${neighborhood.name}, Chennai`}
        stats={STATS}
        actions={
          <>
            <CtaButton href="/demo-class" startIcon={<VideocamOutlinedIcon aria-hidden />} endIcon={null}>
              Book Free Demo Class
            </CtaButton>
            <CtaButton variant="outline" href={CHENNAI_PAGE} endIcon={null}>
              Chennai Center Details
            </CtaButton>
          </>
        }
      >
        <Box id="answer" sx={{ maxWidth: 650 }}>
          <Typography component="p" sx={{ m: 0, fontSize: '1.0625rem', lineHeight: 1.6, color: t.paperMuted }}>
            {neighborhood.distanceFromCenter}. Coaching NATA and JEE B.Arch since 2009, with 1,000+ students and AIR 1 in JEE
            B.Arch 2024. Classroom batches in Chennai, live online classes, and a free NATA study app.
          </Typography>
        </Box>
      </PageHero>

      <Box sx={{ bgcolor: t.ground }}>
        <AsideLayout
          aside={
            <LeadCard id="callback" title="Get a free NATA study plan" body="Share your number and a mentor will call with a study plan, fee details and a demo class slot.">
              <NataAssistanceForm locale={locale} defaultDistrict="Chennai" source={path.slice(1)} bare />
              <WhatsAppLinkButton city={`${neighborhood.name}, Chennai`} citySlug="chennai" variant="text" label="Or message us on WhatsApp" />
            </LeadCard>
          }
        >
          <Section id="about" title={`NATA Coaching for ${neighborhood.name} Students`}>
            <Typography sx={bodySx}>{neighborhood.description}</Typography>
            <Typography sx={bodySx}>{neighborhood.whyStudentsChoose}</Typography>
          </Section>

          <Section id="visit" title={`How to Reach Neram from ${neighborhood.name}`}>
            <FactTable
              caption={`Getting to the Neram Ashok Nagar centre from ${neighborhood.name}`}
              rows={[
                { label: 'Distance & Transport', value: neighborhood.transportInfo },
                {
                  label: 'Center Address',
                  value: (
                    <Box component="span" sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'flex-start' }}>
                      <PlaceOutlinedIcon aria-hidden fontSize="small" sx={{ color: t.gold800, mt: '2px' }} />
                      PT Rajan Road, Sector 13, Ashok Nagar, Chennai 600083
                    </Box>
                  ),
                },
              ]}
            />
            <Typography component="h3" sx={subheadSx}>
              Landmarks in {neighborhood.name}
            </Typography>
            <RuledList items={neighborhood.landmarks} />
            <Typography component="h3" sx={subheadSx}>
              Schools Near {neighborhood.name}
            </Typography>
            <RuledList items={neighborhood.nearbySchools} />
          </Section>

          <Section id="why-neram" title={`Why ${neighborhood.name} Students Choose Neram Classes`}>
            <CheckList items={why} titleAs="h3" />
          </Section>

          <Section id="programs" title={`NATA Coaching Programs Available from ${neighborhood.name}`}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 2 }}>
              {COURSES.map((course, i) => (
                <FeeCard
                  key={course.name}
                  component="article"
                  title={course.name}
                  label={course.duration}
                  highlight={i === 1}
                  price={
                    <>
                      <Box component="span" sx={{ display: 'block', fontSize: '0.9375rem', fontWeight: 600, color: t.inkMuted, mb: 0.5 }}>
                        Starting
                      </Box>
                      {course.fee}
                    </>
                  }
                  features={course.features}
                  actions={
                    <CtaButton href="/apply" fullWidth size="md">
                      Apply Now
                    </CtaButton>
                  }
                />
              ))}
            </Box>
          </Section>
          {faqs.length > 0 && (
            <Section id="faq" title={`Questions from ${neighborhood.name}`}>
              <FaqList faqs={faqs} />
            </Section>
          )}
        </AsideLayout>
      </Box>

      <Band
        id="across-chennai"
        tone="white"
        gap={2}
        py={{ xs: 6, md: 7 }}
        header={{
          title: 'NATA Coaching Across Chennai',
          lede: 'Neram Classes serves students from all Chennai neighborhoods through our Ashok Nagar and Tambaram centres and live online classes.',
          align: 'start',
          size: 'article',
        }}
      >
        <LinkGrid
          columnMin={200}
          items={[
            ...otherNeighborhoods.map((n) => ({ label: `NATA Coaching ${n.name}`, href: `/coaching/nata-coaching-chennai/${n.slug}` })),
            { label: 'Chennai Overview', href: CHENNAI_PAGE },
          ]}
        />
      </Band>

      <CtaBand
        title="Ready to Start NATA Preparation?"
        lede={`Book a free demo class, attend online from ${neighborhood.name} or visit our Ashok Nagar center.`}
        actions={
          <>
            <CtaButton href="/demo-class">Free Demo Class</CtaButton>
            <CtaButton variant="link" href="/apply">
              Apply Now, ₹15,000 Onwards
            </CtaButton>
          </>
        }
      />

      <StickyCta whatsapp={{ city: `${neighborhood.name}, Chennai`, citySlug: 'chennai' }} />
    </Box>
  );
}
