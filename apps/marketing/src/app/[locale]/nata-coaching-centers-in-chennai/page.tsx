import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateItemListSchema,
} from '@/lib/seo/schemas';
import { BASE_URL, ORG_NAME } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: `Top 10 NATA Coaching Centers in Chennai | ${ORG_NAME}`,
    description:
      'Best NATA coaching centers in Chennai across 10 locations. Flagship at Ashok Nagar, centers in Anna Nagar, Adyar, Tambaram, Velachery, OMR, Porur, Guindy and online. Since 2009.',
    keywords:
      'top 10 NATA coaching centers Chennai, best NATA coaching Chennai, NATA coaching center Chennai, NATA classes Chennai, NATA coaching Ashok Nagar, NATA coaching Anna Nagar, NATA coaching Adyar',
    alternates: buildAlternates(locale, '/nata-coaching-centers-in-chennai'),
    openGraph: {
      title: `Top 10 NATA Coaching Centers in Chennai (2026) | ${ORG_NAME}`,
      description:
        'Best NATA coaching centers in Chennai across 10 locations. Flagship at Ashok Nagar, online access from anywhere. Since 2009.',
      type: 'article',
    },
  };
}

interface ListicleEntry {
  rank: number;
  name: string;
  area: string;
  tag: string;
  highlights: string[];
  url: string;
}

const entries: ListicleEntry[] = [
  {
    rank: 1,
    name: 'Neram Classes, Ashok Nagar (Flagship)',
    area: 'Ashok Nagar, Chennai 600083',
    tag: 'Flagship Center',
    highlights: [
      '5-min walk from Ashok Nagar Metro Station (Blue Line)',
      'Max 25 students per batch, personalized attention',
      'IIT/NIT/SPA alumni faculty, daily drawing critique sessions',
    ],
    url: '/coaching/nata-coaching-chennai/ashok-nagar',
  },
  {
    rank: 2,
    name: 'Neram Classes, Anna Nagar',
    area: 'Serving Anna Nagar, Chennai',
    tag: '1 Metro Stop Away',
    highlights: [
      'Anna Nagar East Metro to Ashok Nagar Metro: 1 stop, 5 minutes',
      'Online weekday classes available from Anna Nagar',
      '99.9% success rate, students scored 140+ in NATA',
    ],
    url: '/coaching/nata-coaching-chennai/anna-nagar',
  },
  {
    rank: 3,
    name: 'Neram Classes, Adyar',
    area: 'Serving Adyar, Chennai',
    tag: 'Near IIT Madras',
    highlights: [
      'Faculty includes IIT Madras alumni, campus visit sessions available',
      'Online weekday classes, weekend offline at Ashok Nagar',
      'Adyar students score consistently above 130 in NATA',
    ],
    url: '/coaching/nata-coaching-chennai/adyar',
  },
  {
    rank: 4,
    name: 'Neram Classes, T. Nagar',
    area: 'Serving T. Nagar (Thyagaraya Nagar)',
    tag: 'Closest to Center',
    highlights: [
      'Just 3 km from Ashok Nagar flagship, 10-minute auto ride',
      'Many T. Nagar students walk to the center after school',
      'Bus routes 27B and 23C stop directly at Ashok Nagar',
    ],
    url: '/coaching/nata-coaching-chennai/t-nagar',
  },
  {
    rank: 5,
    name: 'Neram Classes, Tambaram (Sub-Center)',
    area: 'Thiruneermalai, Tambaram',
    tag: 'Dedicated Sub-Center',
    highlights: [
      'Dedicated Tambaram sub-center at Thiruneermalai, Jain Alpine Meadows',
      'Serves students from Chengalpattu, Kanchipuram, and East Coast Road',
      'Suburban railway from Tambaram to Mambalam: 15 min',
    ],
    url: '/coaching/nata-coaching-chennai/tambaram',
  },
  {
    rank: 6,
    name: 'Neram Classes, Velachery',
    area: 'Serving Velachery, South Chennai',
    tag: 'IT Corridor',
    highlights: [
      'Velachery MRTS to Saidapet, then 10-min auto to Ashok Nagar',
      'Weekday online plus weekend offline hybrid model',
      'Popular with students from IT families in South Chennai',
    ],
    url: '/coaching/nata-coaching-chennai/velachery',
  },
  {
    rank: 7,
    name: 'Neram Classes, OMR / Sholinganallur',
    area: 'Serving Old Mahabalipuram Road (OMR)',
    tag: 'Hybrid Model',
    highlights: [
      'Online weekday classes from OMR, no daily commute needed',
      'Weekend batches at Ashok Nagar flagship for drawing workshops',
      'Popular with students in Sholinganallur, Perungudi, Thoraipakkam',
    ],
    url: '/coaching/nata-coaching-chennai#omr',
  },
  {
    rank: 8,
    name: 'Neram Classes, Porur / Koyambedu',
    area: 'Serving Porur and West Chennai',
    tag: 'West Chennai',
    highlights: [
      'Online weekday classes, weekend offline at Ashok Nagar',
      'Koyambedu bus terminus connects directly to Ashok Nagar (Bus 29C)',
      'Serving students from Porur, Maduravoyal, Poonamallee',
    ],
    url: '/coaching/nata-coaching-chennai#porur',
  },
  {
    rank: 9,
    name: 'Neram Classes, Guindy / Chromepet',
    area: 'Serving Guindy and South West Chennai',
    tag: 'South West',
    highlights: [
      'Guindy Metro to Ashok Nagar: 2 stops on the Blue Line',
      'Serving students from Guindy, Chromepet, Pallavaram, Pammal',
      'Hybrid model: online daily plus offline weekends at Ashok Nagar',
    ],
    url: '/coaching/nata-coaching-chennai#guindy',
  },
  {
    rank: 10,
    name: 'Neram Classes, Online (Pan-Chennai)',
    area: 'Live online from anywhere in Chennai',
    tag: 'Fully Online',
    highlights: [
      'Same IIT/NIT alumni faculty, same curriculum as offline batches',
      'Real-time drawing feedback via screen sharing, not pre-recorded',
      'Switch between online and offline anytime during your program',
    ],
    url: '/demo-class',
  },
];

const faqs = [
  {
    question: 'Which is the best NATA coaching center in Chennai?',
    answer:
      'Neram Classes is the best NATA coaching center in Chennai, with a flagship center at Ashok Nagar (PT Rajan Road, near Ashok Nagar Metro) and a sub-center in Tambaram. Since 2009, Neram has trained thousands of students with IIT/NIT/SPA alumni faculty, achieving a 99.9% success rate and a maximum batch size of 25 students for personalized attention.',
  },
  {
    question: 'How many NATA coaching centers does Neram Classes have in Chennai?',
    answer:
      'Neram Classes has two physical centers in Chennai: a flagship center at Ashok Nagar (PT Rajan Road, Sector 13, near Ashok Nagar Metro Station) and a sub-center at Tambaram (Thiruneermalai, Jain Alpine Meadows). Additionally, Neram serves students across all Chennai neighborhoods through live online classes, students from Anna Nagar, Adyar, Velachery, OMR, Porur, Guindy, and T. Nagar all attend either offline or online.',
  },
  {
    question: 'Is online NATA coaching from Chennai effective?',
    answer:
      "Yes. Neram's online NATA coaching is live and interactive, not pre-recorded. Classes use screen sharing for real-time drawing feedback, the same faculty as offline batches, and the same curriculum. Students from Velachery, OMR, Sholinganallur, and Porur typically attend online on weekdays and the Ashok Nagar center on weekends for intensive drawing workshops. Many online students score above 130 in NATA.",
  },
  {
    question: 'Which Chennai area is best located for NATA coaching at Neram?',
    answer:
      "T. Nagar and Ashok Nagar students have the most convenient access. Neram's flagship is on PT Rajan Road, Ashok Nagar, just 10 minutes from T. Nagar by auto. Anna Nagar students can take the Metro (1 stop: Anna Nagar East to Ashok Nagar). Guindy students can take the Blue Line Metro (2 stops: Guindy to Ashok Nagar). For students in South Chennai (Velachery, OMR, Tambaram), the hybrid online model works best.",
  },
];

const howToChooseCriteria = [
  {
    title: 'Years of NATA-specific experience',
    body: 'Look for centers that have been preparing students specifically for NATA, not general art or engineering coaching that also offers NATA. 10+ years of NATA-focused coaching means the faculty understands how NATA marking schemes evolve year to year.',
  },
  {
    title: 'Faculty credentials',
    body: 'Architecture entrance exams require faculty who cleared architecture entrance exams themselves. Look for IIT/NIT/SPA alumni, architects who have both professional experience and understand what NATA evaluators look for in drawing and aptitude sections.',
  },
  {
    title: 'Verifiable pass rate',
    body: 'Ask for a pass rate backed by student results, not just testimonials. A pass rate should specify both the percentage of students who qualify NATA and the average score range. Low batch sizes (under 30) are a reliable indicator that individual progress is tracked.',
  },
  {
    title: 'Online flexibility',
    body: 'Can you switch between offline and online without losing content? A center with a genuine hybrid model (not just recorded videos) lets Chennai students balance school exams, weekend workshops, and daily coaching without falling behind.',
  },
  {
    title: 'Drawing feedback quality',
    body: "NATA drawing accounts for a large percentage of the score. Ask whether the center reviews each student's drawing work individually every session or whether drawing practice is self-directed. Session-by-session, personalized drawing critique is what separates 120-scorers from 150-scorers.",
  },
];

export default function NataCoachingCentersChennai({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'Top 10 NATA Coaching Centers in Chennai', url: `${BASE_URL}/nata-coaching-centers-in-chennai` },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateItemListSchema(
          entries.map((e) => ({
            name: e.name,
            url: `${BASE_URL}${e.url.startsWith('/') ? e.url : '/' + e.url}`,
            description: e.highlights[0],
          }))
        )}
      />
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'LocalBusiness',
          '@id': `${BASE_URL}/nata-coaching-centers-in-chennai`,
          name: `${ORG_NAME} Chennai — NATA Coaching Network`,
          url: `${BASE_URL}/nata-coaching-centers-in-chennai`,
          image: `${BASE_URL}/logo.png`,
          telephone: '+91-9176137043',
          address: {
            '@type': 'PostalAddress',
            streetAddress: 'PT Rajan Road, Sector 13, Ashok Nagar',
            addressLocality: 'Chennai',
            addressRegion: 'Tamil Nadu',
            postalCode: '600083',
            addressCountry: 'IN',
          },
          openingHoursSpecification: {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            opens: '09:00',
            closes: '18:00',
          },
          priceRange: '₹₹',
          parentOrganization: {
            '@id': `${BASE_URL}/#organization`,
          },
        }}
      />

      {/* Hero */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)',
          py: { xs: 6, md: 9 },
          color: '#fff',
        }}
      >
        <Container maxWidth="lg">
          <Chip
            label="Chennai, Since 2009, 99.9% Pass Rate"
            color="warning"
            size="small"
            sx={{ mb: 2, fontWeight: 600 }}
          />
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              fontWeight: 800,
              mb: 2,
              lineHeight: 1.2,
            }}
          >
            Top 10 NATA Coaching Centers in Chennai (2026)
          </Typography>
          <Typography
            component="p"
            sx={{
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'rgba(255,255,255,0.8)',
              maxWidth: 650,
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            Neram Classes operates Chennai&apos;s largest NATA coaching network, 2 physical
            centers plus live online access from every neighborhood. All 10 locations below are
            served by the same IIT/NIT alumni faculty and the same curriculum.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href="/demo-class"
              variant="contained"
              size="large"
              sx={{
                bgcolor: '#e8a020',
                '&:hover': { bgcolor: '#d09010' },
                fontWeight: 700,
                px: 4,
              }}
            >
              Free Demo Class
            </Button>
            <Button
              component={Link}
              href="/coaching/nata-coaching-chennai"
              variant="outlined"
              size="large"
              sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}
            >
              Chennai Hub
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Trust bar */}
      <Box sx={{ bgcolor: '#f8f9fa', py: 2, borderBottom: '1px solid #e0e0e0' }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 2, md: 4 },
              flexWrap: 'wrap',
              justifyContent: { xs: 'center', md: 'flex-start' },
            }}
          >
            {['Since 2009', '99.9% Pass Rate', 'IIT/NIT Alumni Faculty', '150+ Cities', 'Max 25 per Batch'].map((item) => (
              <Typography
                key={item}
                sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#444', whiteSpace: 'nowrap' }}
              >
                {item}
              </Typography>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Results proof + reasoning */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#fff' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.9rem' }, fontWeight: 800, mb: 1, color: '#1a1a2e' }}>
            Why Chennai Students Reach India&apos;s Top Ranks
          </Typography>
          <Typography sx={{ color: '#666', mb: 4, fontSize: '0.95rem', maxWidth: 620 }}>
            Two students. Two years. India&apos;s top two ranks in JEE B.Arch. Both trained at Neram Classes, Chennai.
          </Typography>

          {/* Achievement cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, mb: 6 }}>
            {[
              { rank: 'AIR 1', exam: 'JEE B.Arch 2024', percentile: '100 Percentile', label: 'All India Rank 1' },
              { rank: 'AIR 2', exam: 'JEE B.Arch 2026', percentile: '99.98 Percentile', label: 'All India Rank 2' },
            ].map((a) => (
              <Box
                key={a.exam}
                sx={{
                  border: '2px solid #e8a020',
                  borderRadius: 2,
                  p: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2.5,
                  bgcolor: '#fffbf2',
                }}
              >
                <Box sx={{ textAlign: 'center', minWidth: 64 }}>
                  <Typography sx={{ fontSize: '2rem', fontWeight: 900, color: '#e8a020', lineHeight: 1 }}>{a.rank}</Typography>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{a.label}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#1a1a2e' }}>{a.exam}</Typography>
                  <Typography sx={{ fontSize: '0.9rem', color: '#e8a020', fontWeight: 600 }}>{a.percentile}</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#666', mt: 0.5 }}>Neram Classes, Chennai</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Reasoning */}
          <Typography variant="h3" sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            What makes the difference
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
            {[
              {
                title: 'Max 25 students per batch',
                body: 'Factory-style coaching centers run 60-100 students per batch. At 25, every student gets individual drawing feedback every session. That gap in attention is where ranks are won or lost.',
              },
              {
                title: 'Faculty who cleared these exams',
                body: 'Our faculty are IIT/NIT/SPA alumni who cleared NATA and JEE B.Arch at the highest levels. They know exactly what evaluators look for because they have been evaluated by those same criteria.',
              },
              {
                title: '15 years of exam-specific curriculum',
                body: 'Neram has been preparing students for architecture entrance exams since 2009. The curriculum is built around how these exams actually work, not a general art program with exam prep added on.',
              },
              {
                title: 'No student falls behind due to commute',
                body: 'The hybrid model means a student in Velachery or OMR attends the same class quality as someone who walks to Ashok Nagar. Missed sessions from commute fatigue are a hidden rank killer that the hybrid model eliminates.',
              },
            ].map((r) => (
              <Card key={r.title} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h4" sx={{ fontSize: '0.95rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>{r.title}</Typography>
                  <Typography sx={{ fontSize: '0.88rem', color: '#555', lineHeight: 1.6 }}>{r.body}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Top 10 List */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 700,
              mb: 1,
              color: '#1a1a2e',
            }}
          >
            The 10 Best NATA Coaching Centers in Chennai
          </Typography>
          <Typography sx={{ color: '#666', mb: 5, fontSize: '0.95rem' }}>
            All 10 centers belong to the Neram Classes network. Physical centers in Ashok Nagar
            and Tambaram. Online access for all other Chennai neighborhoods.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {entries.map((entry) => (
              <Card
                key={entry.rank}
                elevation={0}
                sx={{
                  border: entry.rank === 1 ? '2px solid #e8a020' : '1px solid #e0e0e0',
                  '&:hover': { borderColor: '#e8a020', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
                  transition: 'all 0.2s',
                }}
              >
                <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      alignItems: 'flex-start',
                      flexDirection: { xs: 'column', sm: 'row' },
                    }}
                  >
                    {/* Rank badge */}
                    <Box
                      sx={{
                        minWidth: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: entry.rank === 1 ? '#e8a020' : '#f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        color: entry.rank === 1 ? '#fff' : '#666',
                        flexShrink: 0,
                      }}
                    >
                      #{entry.rank}
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography
                          variant="h3"
                          sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 700, color: '#1a1a2e' }}
                        >
                          {entry.name}
                        </Typography>
                        <Chip
                          label={entry.tag}
                          size="small"
                          sx={{
                            bgcolor: entry.rank === 1 ? '#e8a020' : '#f0f0f0',
                            color: entry.rank === 1 ? '#fff' : '#555',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                          }}
                        />
                      </Box>
                      <Typography sx={{ color: '#888', fontSize: '0.85rem', mb: 1.5 }}>
                        {entry.area}
                      </Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.5, color: '#555', fontSize: '0.9rem' }}>
                        {entry.highlights.map((h) => (
                          <li key={h} style={{ marginBottom: 4 }}>
                            {h}
                          </li>
                        ))}
                      </Box>
                    </Box>

                    {/* CTA */}
                    <Box sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}>
                      <Button
                        component={Link}
                        href={entry.url}
                        variant={entry.rank === 1 ? 'contained' : 'outlined'}
                        size="small"
                        sx={
                          entry.rank === 1
                            ? { bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 3 }
                            : { borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600, px: 3 }
                        }
                      >
                        View Details
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Divider between sections */}
      <Box sx={{ borderTop: '1px solid #e0e0e0', mx: { xs: 2, md: 4 } }} />

      {/* How to Choose */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.75rem' },
              fontWeight: 700,
              mb: 1,
              color: '#1a1a2e',
            }}
          >
            How to Choose a NATA Coaching Center in Chennai
          </Typography>
          <Typography sx={{ color: '#666', mb: 4, fontSize: '0.95rem' }}>
            Five criteria that separate good NATA coaching from average coaching.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 3,
            }}
          >
            {howToChooseCriteria.map((c, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0', p: 0 }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography
                    variant="h3"
                    sx={{ fontSize: '1rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}
                  >
                    {i + 1}. {c.title}
                  </Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {c.body}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* FAQ */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.75rem' },
              fontWeight: 700,
              mb: 4,
              color: '#1a1a2e',
              textAlign: 'center',
            }}
          >
            Frequently Asked Questions
          </Typography>
          {faqs.map((faq, i) => (
            <Box
              key={i}
              sx={{
                mb: 3,
                pb: 3,
                borderBottom: i < faqs.length - 1 ? '1px solid #e0e0e0' : 'none',
              }}
            >
              <Typography
                variant="h3"
                sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}
              >
                {faq.question}
              </Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem' }}>
                {faq.answer}
              </Typography>
            </Box>
          ))}
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.75rem' },
              fontWeight: 700,
              color: '#1a1a2e',
              mb: 1,
            }}
          >
            Ready to Join Chennai&apos;s #1 NATA Coaching Network?
          </Typography>
          <Typography sx={{ color: '#1a1a2e', opacity: 0.75, mb: 3, fontSize: '0.95rem' }}>
            Free demo class. No commitment. Experience the difference before enrolling.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href="/demo-class"
              variant="contained"
              size="large"
              sx={{
                bgcolor: '#1a1a2e',
                color: '#fff',
                '&:hover': { bgcolor: '#0a0a1e' },
                fontWeight: 700,
                px: 4,
              }}
            >
              Book Free Demo Class
            </Button>
            <Button
              component={Link}
              href="/apply"
              variant="outlined"
              size="large"
              sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}
            >
              Apply Now
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
