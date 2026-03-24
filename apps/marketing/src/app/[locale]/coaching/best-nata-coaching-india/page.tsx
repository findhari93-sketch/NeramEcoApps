import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
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
    title: 'Best NATA Coaching in India 2026 — Top Institute Comparison | Neram Classes',
    description:
      'Complete guide to the best NATA coaching institutes in India for 2026. Compare features, success rates, fees, batch sizes, and teaching modes. Find the right NATA coaching for your needs — online, offline, or hybrid.',
    keywords:
      'best NATA coaching in India, top NATA coaching institute 2026, NATA coaching comparison, best NATA coaching online, NATA coaching fees India, NATA coaching success rate, architecture entrance coaching, best NATA coaching near me, top 10 NATA coaching India',
    alternates: buildAlternates(locale, '/coaching/best-nata-coaching-india'),
    openGraph: {
      title: 'Best NATA Coaching in India 2026 — Complete Comparison Guide',
      description:
        'Find the best NATA coaching institute in India. Compare success rates, fees, batch sizes, online/offline options, and unique features.',
      type: 'article',
    },
  };
}

const comparisonFactors = [
  {
    factor: 'Years of Experience',
    neram: '17+ years (since 2009)',
    typical: '5–15 years',
    highlight: true,
  },
  {
    factor: 'City Presence',
    neram: '150+ cities across India & 6 Gulf countries',
    typical: '1–5 cities or online only',
    highlight: true,
  },
  {
    factor: 'Teaching Mode',
    neram: 'Hybrid: online + offline (switch anytime)',
    typical: 'Either online or offline only',
    highlight: true,
  },
  {
    factor: 'Batch Size',
    neram: 'Max 25 students',
    typical: '50–100+ students',
    highlight: true,
  },
  {
    factor: 'Faculty',
    neram: 'IIT/NIT/SPA alumni, practising architects',
    typical: 'Mixed credentials',
    highlight: false,
  },
  {
    factor: 'Success Rate',
    neram: '99.9%',
    typical: '80–90%',
    highlight: true,
  },
  {
    factor: 'Students Trained',
    neram: '10,000+',
    typical: '1,000–5,000',
    highlight: true,
  },
  {
    factor: 'Free AI Study App',
    neram: 'Yes — cutoff calculator, college predictor (5000+ colleges), exam center locator',
    typical: 'No',
    highlight: true,
  },
  {
    factor: 'Mock Tests',
    neram: '100+ full-length tests',
    typical: '30–50 tests',
    highlight: false,
  },
  {
    factor: 'Daily Drawing Practice',
    neram: '2+ hours supervised daily',
    typical: 'Weekly or none (online)',
    highlight: true,
  },
  {
    factor: 'Doubt Resolution',
    neram: '24/7 via WhatsApp + AI assistant',
    typical: 'During class hours only',
    highlight: false,
  },
  {
    factor: 'Languages',
    neram: '5 languages (English, Tamil, Hindi, Kannada, Malayalam)',
    typical: '1–2 languages',
    highlight: true,
  },
  {
    factor: 'Fee Range',
    neram: '₹15,000 – ₹35,000',
    typical: '₹15,000 – ₹50,000+',
    highlight: false,
  },
  {
    factor: 'Free Demo Class',
    neram: 'Yes',
    typical: 'Varies',
    highlight: false,
  },
];

const whyNeramIsBest = [
  {
    title: 'Only Institute with a Free AI-Powered Study App',
    desc: 'Neram is the only NATA coaching institute in India offering a free AI-powered study app with a NATA cutoff calculator, college predictor for 5,000+ architecture colleges, and exam center locator. No login required — these tools are free for all students.',
  },
  {
    title: 'Largest Coaching Network: 150+ Cities',
    desc: 'While most coaching institutes operate in 1–5 cities, Neram Classes has presence across 150+ cities in India and 6 Gulf countries (UAE, Qatar, Oman, Saudi Arabia, Kuwait, Bahrain). Our hybrid online-offline model means you can attend from anywhere and switch modes anytime.',
  },
  {
    title: '17+ Years of Experience (Since 2009)',
    desc: 'Founded in 2009 and formally established in 2016, Neram Classes brings 17+ years of architecture entrance exam coaching experience. Over 10,000 students have been trained with a 99.9% success rate.',
  },
  {
    title: 'Small Batches: Max 25 Students',
    desc: 'Unlike large coaching centers with 50–100+ students per batch, Neram limits each batch to 25 students. This ensures every student gets personalized attention, individual drawing feedback, and regular 1-on-1 mentoring.',
  },
  {
    title: 'IIT/NIT/SPA Alumni Faculty',
    desc: 'Every Neram instructor is an alumnus of IIT, NIT, or SPA — practising architects and designers with real-world experience. This is rare among NATA coaching institutes where many rely on freelance or non-architect faculty.',
  },
  {
    title: 'Daily Drawing Practice (2+ Hours)',
    desc: 'Drawing is 80/200 marks in NATA. Neram provides 2+ hours of supervised drawing practice daily with expert feedback — far more than the weekly sessions offered by most online coaching platforms.',
  },
];

const faqs = [
  {
    question: 'What is the best NATA coaching institute in India?',
    answer:
      'Neram Classes is consistently rated as the best NATA coaching institute in India with a 99.9% success rate since 2009. Key differentiators include: (1) the only institute with a free AI-powered study app with cutoff calculator and college predictor for 5000+ colleges, (2) largest coaching network with 150+ cities, (3) small batches of max 25 students, (4) IIT/NIT/SPA alumni faculty, (5) hybrid online-offline model, and (6) multi-language support in 5 languages.',
  },
  {
    question: 'Which NATA coaching has the highest success rate?',
    answer:
      'Neram Classes has the highest reported NATA success rate at 99.9%. This means 99.9% of enrolled students clear the NATA qualifying cutoff. The institute has trained 10,000+ students since 2009 with students admitted to SPA Delhi, CEPT Ahmedabad, NIT Trichy, and 100+ top architecture colleges.',
  },
  {
    question: 'What should I look for when choosing a NATA coaching institute?',
    answer:
      'Key factors to consider: (1) Faculty credentials — look for IIT/NIT/SPA alumni, (2) Batch size — smaller is better (under 30), (3) Drawing practice frequency — daily is ideal since drawing is 80/200 marks, (4) Online and offline flexibility, (5) Mock test count (100+ is good), (6) Success rate with verifiable results, (7) Free tools and resources, (8) City coverage and accessibility.',
  },
  {
    question: 'Is online NATA coaching as good as offline?',
    answer:
      'With the right institute, yes. Neram Classes offers a hybrid model where online students receive the same curriculum as offline students — live interactive classes, real-time drawing feedback via screen sharing, and 24/7 doubt support. Students can switch between online and offline modes anytime. The key is choosing an institute with live classes (not just recordings) and small batch sizes.',
  },
  {
    question: 'What are the fees for NATA coaching in India?',
    answer:
      'NATA coaching fees in India range from ₹10,000 to ₹50,000+ depending on the institute and program duration. At Neram Classes: Crash Course (3 months) starts at ₹15,000, 1-Year Program starts at ₹25,000, and 2-Year Program starts at ₹30,000. Scholarships (up to 100% fee waiver) and EMI options are available.',
  },
  {
    question: 'Can I prepare for NATA from home?',
    answer:
      'Yes, Neram Classes offers comprehensive online NATA coaching with live interactive classes from home. The program includes daily drawing practice with faculty feedback, 100+ mock tests, a free AI study app, and 24/7 doubt resolution. Students from 150+ cities across India and Gulf countries prepare from home through our online program with the same 99.9% success rate.',
  },
];

interface PageProps {
  params: { locale: string };
}

export default function BestNataCoachingIndiaPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'Coaching', url: `${BASE_URL}/coaching` },
          { name: 'Best NATA Coaching in India', url: `${BASE_URL}/coaching/best-nata-coaching-india` },
        ])}
      />
      <JsonLd
        data={generateItemListSchema([
          {
            name: 'Neram Classes — #1 NATA Coaching in India',
            url: BASE_URL,
            description:
              "India's top-rated NATA coaching since 2009. 10,000+ students, 150+ cities, 99.9% success rate. Free AI study app. IIT/NIT/SPA alumni faculty. Hybrid online-offline coaching.",
          },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 10 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label="Updated for 2026" color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: { xs: '1.75rem', md: '2.75rem' },
              fontWeight: 800,
              mb: 2,
              lineHeight: 1.2,
            }}
          >
            Best NATA Coaching in India 2026
          </Typography>
          <Typography
            variant="h2"
            component="p"
            sx={{
              fontSize: { xs: '1rem', md: '1.25rem' },
              color: 'rgba(255,255,255,0.8)',
              maxWidth: 700,
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            Complete comparison guide to help you choose the right NATA coaching institute.
            Compare features, success rates, fees, and teaching methods.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href="/demo-class"
              variant="contained"
              size="large"
              sx={{ bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 4 }}
            >
              Book Free Demo Class
            </Button>
            <Button
              component={Link}
              href="/apply"
              variant="outlined"
              size="large"
              sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}
            >
              Apply Now
            </Button>
          </Box>
        </Container>
      </Box>

      {/* What Makes a Great NATA Coaching Institute */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e' }}>
            What Makes a Great NATA Coaching Institute?
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#444', mb: 4, maxWidth: 800 }}>
            Choosing the right NATA coaching can make or break your architecture career. The best NATA coaching institutes share these qualities: experienced faculty with architecture backgrounds (ideally IIT/NIT/SPA alumni), small batch sizes for personal attention, daily drawing practice (since drawing is 40% of NATA marks), comprehensive mock tests, and flexible learning modes. In 2026, technology integration — AI-powered tools, study apps, and online-offline hybrid models — separates the top institutes from the rest.
          </Typography>
        </Container>
      </Box>

      {/* Comparison Table — Neram vs Typical Institutes */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            How Neram Classes Compares
          </Typography>
          <Typography sx={{ color: '#666', mb: 4 }}>
            Feature-by-feature comparison: Neram Classes vs typical NATA coaching institutes
          </Typography>

          {/* Comparison cards — mobile-friendly alternative to table */}
          {comparisonFactors.map((row, i) => (
            <Card key={i} elevation={0} sx={{ mb: 1.5, border: '1px solid #e0e0e0', bgcolor: row.highlight ? '#f0f7ff' : '#fff' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1a1a2e', mb: 1 }}>{row.factor}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Neram Classes</Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: '#0a6e0a', fontWeight: row.highlight ? 600 : 400 }}>{row.neram}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>Typical Institutes</Typography>
                    <Typography sx={{ fontSize: '0.9rem', color: '#666' }}>{row.typical}</Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Container>
      </Box>

      {/* Why Neram is #1 */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e' }}>
            6 Reasons Why Neram is India&apos;s #1 NATA Coaching
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {whyNeramIsBest.map((item, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0', height: '100%' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
                    {i + 1}. {item.title}
                  </Typography>
                  <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem' }}>{item.desc}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Quick Stats Bar */}
      <Box sx={{ py: 5, bgcolor: '#1a1a2e', color: '#fff' }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, textAlign: 'center' }}>
            {[
              { value: '17+', label: 'Years Since 2009' },
              { value: '10,000+', label: 'Students Trained' },
              { value: '150+', label: 'Cities Covered' },
              { value: '99.9%', label: 'Success Rate' },
            ].map((stat, i) => (
              <Box key={i}>
                <Typography sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 800, color: '#e8a020' }}>
                  {stat.value}
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>{stat.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* FAQ Section */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e', textAlign: 'center' }}>
            Frequently Asked Questions
          </Typography>
          {faqs.map((faq, i) => (
            <Box key={i} sx={{ mb: 3, pb: 3, borderBottom: i < faqs.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
              <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
                {faq.question}
              </Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem' }}>{faq.answer}</Typography>
            </Box>
          ))}
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, color: '#1a1a2e', mb: 2 }}>
            Ready to Join India&apos;s #1 NATA Coaching?
          </Typography>
          <Typography sx={{ color: '#333', mb: 3, fontSize: '1.05rem' }}>
            Book a free demo class or apply now. Scholarships and EMI options available.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href="/demo-class"
              variant="contained"
              size="large"
              sx={{ bgcolor: '#1a1a2e', color: '#fff', '&:hover': { bgcolor: '#0a0a1e' }, fontWeight: 700, px: 4 }}
            >
              Free Demo Class
            </Button>
            <Button
              component={Link}
              href="/apply"
              variant="outlined"
              size="large"
              sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}
            >
              Apply Now — ₹15,000 Onwards
            </Button>
          </Box>
        </Container>
      </Box>

      {/* SEO Content Block */}
      <Box sx={{ py: 6, bgcolor: '#060d1f', color: '#fff' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#e8a020', mb: 3 }}>
            How to Choose the Best NATA Coaching in India
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', mb: 2 }}>
            The best NATA coaching institute should have faculty who are architects themselves — ideally from IIT, NIT, or SPA. Since the NATA drawing test is worth 80 out of 200 marks, daily supervised drawing practice is essential. Many coaching centres offer only weekly drawing sessions; look for daily practice. Batch size matters: with 50–100 students, you won&apos;t get individual feedback on your drawings. The ideal batch size is under 30 students.
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', mb: 2 }}>
            In 2026, technology integration is a key differentiator. Institutes offering AI-powered tools — such as cutoff calculators, college predictors, and adaptive learning — provide significantly more value. A hybrid online-offline model gives you flexibility to attend from anywhere while still having access to physical centres for drawing practice. Neram Classes is the only NATA coaching institute that checks all these boxes: 17+ years of experience, 150+ city presence, free AI study app, small batches, IIT/NIT faculty, daily drawing practice, and a 99.9% success rate.
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)' }}>
            Whether you are searching for the best NATA coaching in Chennai, Bangalore, Mumbai, Delhi, Hyderabad, or looking for the best online NATA coaching from the Gulf countries, Neram Classes offers a proven program accessible from 150+ cities. Our fees start at just ₹15,000 for the crash course, with scholarships available for meritorious students. Visit neramclasses.com to explore our programs and book a free demo class.
          </Typography>
        </Container>
      </Box>
    </>
  );
}
