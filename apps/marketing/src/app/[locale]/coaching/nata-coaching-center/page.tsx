import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateOrganizationSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateCourseSchema,
} from '@/lib/seo/schemas';
import { BASE_URL } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best NATA Coaching Centers in India 2026: Compare & Choose | Neram Classes',
    description:
      'Find the best NATA coaching center near you. Compare fees, faculty, batch sizes, and success rates across 150+ cities. Neram Classes, India\'s #1 NATA coaching center since 2009. Online & offline hybrid classes.',
    keywords:
      'NATA coaching center, best NATA coaching center, NATA coaching centre near me, NATA coaching center in India, NATA coaching center fees, online NATA coaching center, NATA coaching center Chennai, NATA coaching center Bangalore, NATA coaching center Coimbatore, NATA coaching center Madurai, NATA coaching center Trichy, NATA online class, NATA coaching centre',
    alternates: buildAlternates(locale, '/coaching/nata-coaching-center'),
    openGraph: {
      title: 'Best NATA Coaching Centers in India 2026: Find One Near You',
      description:
        'Compare NATA coaching centers across 150+ cities. Find the best coaching center for your needs: online, offline, or hybrid.',
      type: 'article',
    },
  };
}

const selectionCriteria = [
  {
    title: 'Faculty Credentials',
    desc: 'Look for IIT/NIT/SPA alumni who are practising architects. They bring real-world experience to architecture entrance preparation.',
    neramValue: 'IIT/NIT/SPA alumni faculty',
  },
  {
    title: 'Batch Size',
    desc: 'Smaller batches mean more personal attention. This is critical for drawing feedback, since you need 1-on-1 guidance on your sketches.',
    neramValue: 'Max 25 students per batch',
  },
  {
    title: 'Drawing Practice',
    desc: 'Drawing is 80/200 marks in NATA. Daily supervised practice with expert feedback is essential. Weekly sessions are not enough.',
    neramValue: '2+ hours daily supervised practice',
  },
  {
    title: 'Teaching Mode',
    desc: 'A hybrid online-offline model gives you the flexibility to attend from anywhere while having access to physical centers.',
    neramValue: 'Hybrid: switch between online & offline anytime',
  },
  {
    title: 'Mock Tests',
    desc: 'Regular full-length mock tests with NATA-pattern questions help you build speed and accuracy under exam conditions.',
    neramValue: '100+ full-length mock tests',
  },
  {
    title: 'Technology & Tools',
    desc: 'AI-powered study apps, cutoff calculators, and college predictors give you a significant edge in preparation and college selection.',
    neramValue: 'Free AI app with cutoff calculator & college predictor (5000+ colleges)',
  },
];

const topCities = [
  { city: 'Chennai', slug: 'chennai', state: 'Tamil Nadu', mode: 'Online & Offline' },
  { city: 'Bangalore', slug: 'bangalore', state: 'Karnataka', mode: 'Online & Offline' },
  { city: 'Coimbatore', slug: 'coimbatore', state: 'Tamil Nadu', mode: 'Online & Offline' },
  { city: 'Madurai', slug: 'madurai', state: 'Tamil Nadu', mode: 'Online & Offline' },
  { city: 'Trichy', slug: 'trichy', state: 'Tamil Nadu', mode: 'Online & Offline' },
  { city: 'Hyderabad', slug: 'hyderabad', state: 'Telangana', mode: 'Online & Offline' },
  { city: 'Mumbai', slug: 'mumbai', state: 'Maharashtra', mode: 'Online' },
  { city: 'Delhi', slug: 'delhi', state: 'Delhi NCR', mode: 'Online' },
  { city: 'Kochi', slug: 'kochi', state: 'Kerala', mode: 'Online' },
  { city: 'Pune', slug: 'pune', state: 'Maharashtra', mode: 'Online' },
  { city: 'Salem', slug: 'salem', state: 'Tamil Nadu', mode: 'Online & Offline' },
  { city: 'Tirunelveli', slug: 'tirunelveli', state: 'Tamil Nadu', mode: 'Online & Offline' },
];

const faqs = [
  {
    question: 'Which is the best NATA coaching center in India?',
    answer:
      'Neram Classes is rated the best NATA coaching center in India with a 99.9% success rate since 2009. With 150+ coaching centers across India and 6 Gulf countries, IIT/NIT/SPA alumni faculty, max 25 students per batch, and a free AI-powered study app, Neram consistently outperforms other NATA coaching centers on every metric.',
  },
  {
    question: 'How do I choose the right NATA coaching center?',
    answer:
      'When choosing a NATA coaching center, evaluate: (1) Faculty credentials, IIT/NIT/SPA alumni are ideal, (2) Batch size, under 30 for personal attention, (3) Daily drawing practice, since drawing is 80/200 marks, (4) Online-offline flexibility, (5) Mock test frequency, 100+ is good, (6) Technology tools like AI study apps, (7) Verifiable success rate and track record, (8) Fee transparency and scholarship options.',
  },
  {
    question: 'Is online NATA coaching as effective as attending a coaching center?',
    answer:
      'Yes, when done right. Neram Classes\' online coaching delivers the same curriculum as our offline centers, including live interactive classes, real-time drawing feedback via screen sharing, 24/7 doubt support, and small batches of max 25 students. Students can switch between online and offline modes anytime. Our online students achieve the same 99.9% success rate as offline students.',
  },
  {
    question: 'What is the fee for NATA coaching centers?',
    answer:
      'NATA coaching center fees in India range from ₹10,000 to ₹50,000+ depending on the institute, city, and program duration. At Neram Classes: Crash Course (3 months) starts at ₹15,000, 1-Year Program at ₹25,000, and 2-Year Foundation Program at ₹30,000. Scholarships (up to 100% fee waiver) and EMI payment options are available.',
  },
  {
    question: 'Does Neram Classes have NATA coaching centers near me?',
    answer:
      'Neram Classes has presence in 150+ cities across India including Chennai, Bangalore, Coimbatore, Madurai, Trichy, Hyderabad, Mumbai, Delhi, Kochi, Pune, and many more. We also serve students in 6 Gulf countries (UAE, Qatar, Oman, Saudi Arabia, Kuwait, Bahrain). Even if there\'s no physical center near you, our online coaching program provides the same quality with live classes, drawing feedback, and small batches.',
  },
  {
    question: 'What is the best NATA coaching center in Chennai, Bangalore, and Coimbatore?',
    answer:
      'Neram Classes is the top-rated NATA coaching center in Chennai (flagship center at Ashok Nagar, serving Anna Nagar, Adyar, Tambaram, T. Nagar, Velachery), Bangalore, and Coimbatore. Our Chennai center has been operating since 2009, making it the most experienced NATA coaching center in the city. All centers offer hybrid online-offline coaching with the same IIT/NIT faculty, small batches, and daily drawing practice.',
  },
];

interface PageProps {
  params: { locale: string };
}

export default function NataCoachingCenterPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  const localePath = locale === 'en' ? '' : `/${locale}`;

  return (
    <>
      <JsonLd data={generateOrganizationSchema()} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'Coaching', url: `${BASE_URL}/coaching` },
          { name: 'NATA Coaching Centers', url: `${BASE_URL}/coaching/nata-coaching-center` },
        ])}
      />
      <JsonLd
        data={generateCourseSchema({
          name: 'NATA Coaching Program',
          description:
            'Comprehensive NATA coaching program with IIT/NIT/SPA alumni faculty, daily drawing practice, 100+ mock tests, and free AI study app. Available online and at 150+ coaching centers.',
          url: `${BASE_URL}/coaching/nata-coaching-center`,
          subjects: ['Mathematics', 'General Aptitude', 'Drawing Test', 'Architecture Awareness'],
          duration: 'P12M',
          modes: ['online', 'onsite'],
          price: 15000,
        })}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 10 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label="150+ Centers Across India" color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
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
            Best NATA Coaching Centers in India 2026
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
            How to choose the right NATA coaching center for your needs. Compare fees, faculty,
            batch sizes, and success rates, then find a center near you.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href={`${localePath}/demo-class`}
              variant="contained"
              size="large"
              sx={{ bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 4, minHeight: 48 }}
            >
              Book Free Demo Class
            </Button>
            <Button
              component={Link}
              href={`${localePath}/apply`}
              variant="outlined"
              size="large"
              sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600, minHeight: 48 }}
            >
              View All Centers
            </Button>
          </Box>
        </Container>
      </Box>

      {/* What to Look For */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            What Makes a Great NATA Coaching Center?
          </Typography>
          <Typography sx={{ color: '#666', mb: 4, maxWidth: 700 }}>
            Not all coaching centers are created equal. Here are the 6 critical factors to evaluate before enrolling.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {selectionCriteria.map((item, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0', height: '100%' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
                    {i + 1}. {item.title}
                  </Typography>
                  <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem', mb: 1.5 }}>
                    {item.desc}
                  </Typography>
                  <Chip
                    label={`Neram: ${item.neramValue}`}
                    size="small"
                    sx={{ bgcolor: '#e8f5e9', color: '#2e7d32', fontWeight: 600 }}
                  />
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Why Neram */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            Why Neram Classes is India&apos;s #1 NATA Coaching Center
          </Typography>
          <Typography sx={{ color: '#666', mb: 4, maxWidth: 700 }}>
            17+ years, 10,000+ students, 150+ cities. Here&apos;s what sets Neram apart from every other coaching center.
          </Typography>

          {/* Stats Bar */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 4 }}>
            {[
              { value: '17+', label: 'Years Since 2009' },
              { value: '10,000+', label: 'Students Trained' },
              { value: '150+', label: 'Cities Covered' },
              { value: '99.9%', label: 'Success Rate' },
            ].map((stat, i) => (
              <Box key={i} sx={{ textAlign: 'center', p: 2, bgcolor: '#f0f7ff', borderRadius: 2 }}>
                <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 800, color: '#1565c0' }}>
                  {stat.value}
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: '#666' }}>{stat.label}</Typography>
              </Box>
            ))}
          </Box>

          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#444', maxWidth: 800, mb: 2 }}>
            Neram Classes is the only NATA coaching center in India offering a <strong>free AI-powered study app</strong> with
            a cutoff calculator, college predictor for 5,000+ architecture colleges, and exam center locator. Our
            <strong> hybrid online-offline model</strong> lets you attend from any of our 150+ centers or from home, and switch
            modes anytime. With <strong>IIT/NIT/SPA alumni faculty</strong>, batches capped at 25 students, and 2+ hours of
            daily supervised drawing practice, Neram consistently produces the best results in NATA preparation.
          </Typography>
        </Container>
      </Box>

      {/* Browse by City */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            Find a NATA Coaching Center Near You
          </Typography>
          <Typography sx={{ color: '#666', mb: 4 }}>
            Neram Classes has coaching centers across 150+ cities. Browse our top locations below.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {topCities.map((c) => (
              <Card
                key={c.slug}
                component={Link}
                href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-${c.slug}`}
                elevation={0}
                sx={{
                  border: '1px solid #e0e0e0',
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                  '&:hover': { borderColor: '#1565c0', boxShadow: 2 },
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#1a1a2e', mb: 0.5 }}>
                    NATA Coaching Center in {c.city}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: '#888', mb: 1 }}>{c.state}</Typography>
                  <Chip
                    label={c.mode}
                    size="small"
                    sx={{
                      bgcolor: c.mode === 'Online & Offline' ? '#e3f2fd' : '#f3e5f5',
                      color: c.mode === 'Online & Offline' ? '#1565c0' : '#7b1fa2',
                      fontWeight: 500,
                      fontSize: '0.75rem',
                    }}
                  />
                </CardContent>
              </Card>
            ))}
          </Box>

          <Box sx={{ mt: 4, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href={`${localePath}/coaching/nata-coaching`}
              variant="outlined"
              sx={{ fontWeight: 600, minHeight: 48 }}
            >
              Browse All 150+ Cities
            </Button>
            <Button
              component={Link}
              href={`${localePath}/coaching/nata-coaching-center-in-tamil-nadu`}
              variant="outlined"
              sx={{ fontWeight: 600, minHeight: 48 }}
            >
              Tamil Nadu: 38 Districts
            </Button>
            <Button
              component={Link}
              href={`${localePath}/coaching/best-nata-coaching-chennai`}
              variant="outlined"
              sx={{ fontWeight: 600, minHeight: 48 }}
            >
              Chennai Flagship Center
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Online vs Offline */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e' }}>
            Online vs Offline NATA Coaching Centers
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            <Card elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2, color: '#1a1a2e' }}>
                  Offline Coaching Centers
                </Typography>
                <Box component="ul" sx={{ pl: 2, '& li': { mb: 1, color: '#555', lineHeight: 1.6 } }}>
                  <li>Face-to-face drawing practice with hands-on feedback</li>
                  <li>Peer interaction and collaborative learning</li>
                  <li>Structured environment with fewer distractions</li>
                  <li>Access to physical resources and library</li>
                  <li>Limited to cities where centers are located</li>
                </Box>
              </CardContent>
            </Card>
            <Card elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2, color: '#1a1a2e' }}>
                  Online Coaching (Neram&apos;s Hybrid Model)
                </Typography>
                <Box component="ul" sx={{ pl: 2, '& li': { mb: 1, color: '#555', lineHeight: 1.6 } }}>
                  <li>Live interactive classes, not recordings</li>
                  <li>Real-time drawing feedback via screen sharing</li>
                  <li>Same curriculum and faculty as offline centers</li>
                  <li>24/7 doubt support via WhatsApp + AI assistant</li>
                  <li>Free AI study app with cutoff calculator & college predictor</li>
                  <li>Switch between online and offline modes anytime</li>
                  <li>Available from 150+ cities and 6 Gulf countries</li>
                </Box>
              </CardContent>
            </Card>
          </Box>
          <Typography sx={{ mt: 3, color: '#555', lineHeight: 1.7, maxWidth: 700 }}>
            Neram Classes offers the best of both worlds. Start online, switch to offline when convenient.
            or combine both. Our hybrid model ensures you get the same quality regardless of mode,
            with the same 99.9% success rate across online and offline students.
          </Typography>
        </Container>
      </Box>

      {/* FAQ Section */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e', textAlign: 'center' }}>
            Frequently Asked Questions About NATA Coaching Centers
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
            Find a NATA Coaching Center Near You
          </Typography>
          <Typography sx={{ color: '#333', mb: 3, fontSize: '1.05rem' }}>
            Join 10,000+ students across 150+ cities. Book a free demo class or apply now.
            Scholarships and EMI options available.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href={`${localePath}/demo-class`}
              variant="contained"
              size="large"
              sx={{ bgcolor: '#1a1a2e', color: '#fff', '&:hover': { bgcolor: '#0a0a1e' }, fontWeight: 700, px: 4, minHeight: 48 }}
            >
              Book Free Demo Class
            </Button>
            <Button
              component={Link}
              href={`${localePath}/apply`}
              variant="outlined"
              size="large"
              sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600, minHeight: 48 }}
            >
              Apply Now: ₹15,000 Onwards
            </Button>
          </Box>
        </Container>
      </Box>

      {/* SEO Content Block */}
      <Box sx={{ py: 6, bgcolor: '#060d1f', color: '#fff' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#e8a020', mb: 3 }}>
            How to Find the Best NATA Coaching Center in Your City
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', mb: 2 }}>
            Finding the right NATA coaching center is one of the most important decisions for aspiring architects. The best NATA coaching centers in India combine experienced faculty, small batch sizes, and daily drawing practice. Since the NATA drawing test accounts for 80 out of 200 marks, supervised drawing practice is non-negotiable. Look for centers that offer at least 2 hours of daily drawing with individual feedback.
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', mb: 2 }}>
            <Link href={`${localePath}/coaching/best-nata-coaching-chennai`} style={{ color: '#e8a020' }}>
              NATA coaching centers in Chennai
            </Link>{' '}
            are among the most established, with Neram Classes operating its flagship center in Ashok Nagar since 2009.
            For students in South India,{' '}
            <Link href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-coimbatore`} style={{ color: '#e8a020' }}>
              NATA coaching centers in Coimbatore
            </Link>,{' '}
            <Link href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-madurai`} style={{ color: '#e8a020' }}>
              Madurai
            </Link>, and{' '}
            <Link href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-trichy`} style={{ color: '#e8a020' }}>
              Trichy
            </Link>{' '}
            offer the same quality of coaching with local center access.
            Students in{' '}
            <Link href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-bangalore`} style={{ color: '#e8a020' }}>
              Bangalore
            </Link>,{' '}
            <Link href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-hyderabad`} style={{ color: '#e8a020' }}>
              Hyderabad
            </Link>,{' '}
            <Link href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-mumbai`} style={{ color: '#e8a020' }}>
              Mumbai
            </Link>, and{' '}
            <Link href={`${localePath}/coaching/nata-coaching/nata-coaching-centers-in-delhi`} style={{ color: '#e8a020' }}>
              Delhi
            </Link>{' '}
            can access Neram&apos;s coaching through our hybrid online-offline program.
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)' }}>
            Whether you&apos;re searching for &quot;NATA coaching center near me&quot;, &quot;best NATA coaching center in Chennai&quot;, or &quot;NATA online class&quot;, Neram Classes offers a proven program accessible from 150+ cities. Our{' '}
            <Link href={`${localePath}/coaching/nata-coaching`} style={{ color: '#e8a020' }}>
              online NATA coaching
            </Link>{' '}
            delivers the same quality as our offline centers. Explore our{' '}
            <Link href={`${localePath}/coaching/best-nata-coaching-india`} style={{ color: '#e8a020' }}>
              complete comparison guide
            </Link>{' '}
            or{' '}
            <Link href={`${localePath}/nata-2026`} style={{ color: '#e8a020' }}>
              NATA 2026 exam guide
            </Link>{' '}
            to start your preparation journey.
          </Typography>
        </Container>
      </Box>
    </>
  );
}
