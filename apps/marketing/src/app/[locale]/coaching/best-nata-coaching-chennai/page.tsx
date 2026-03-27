import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { BASE_URL, ORG_NAME, ORG_PHONE, ORG_EMAIL, SOCIAL_PROFILES, ORG_LOGO } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';

export const revalidate = 86400;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Best NATA Coaching in Chennai 2026 — #1 Rated | Neram Classes',
    description:
      "Chennai's #1 NATA coaching institute since 2009. IIT/NIT/SPA alumni faculty, 99.9% success rate, free AI study app with college predictor. Online + offline classes. Small batches (max 25). Book free demo class today.",
    keywords:
      'best NATA coaching in Chennai, NATA coaching Chennai, top NATA coaching Chennai 2026, NATA classes Chennai, architecture coaching Chennai, NATA preparation Chennai, NATA coaching Ashok Nagar, best NATA institute Chennai, online NATA coaching Chennai, NATA drawing classes Chennai',
    alternates: buildAlternates(locale, '/coaching/best-nata-coaching-chennai'),
    openGraph: {
      title: "Best NATA Coaching in Chennai 2026 — #1 Rated Institute",
      description:
        "Chennai's top NATA coaching since 2009. 99.9% success rate, free AI study app, IIT/NIT alumni faculty, small batches.",
      type: 'article',
    },
  };
}

const chennaiSchema = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  '@id': `${BASE_URL}/coaching/best-nata-coaching-chennai`,
  name: `${ORG_NAME} Chennai — Best NATA Coaching in Chennai`,
  alternateName: ['Neram NATA Coaching Chennai', 'Neram Classes Ashok Nagar'],
  url: `${BASE_URL}/coaching/best-nata-coaching-chennai`,
  logo: ORG_LOGO,
  image: ORG_LOGO,
  description:
    "Chennai's #1 NATA coaching institute since 2009. Expert IIT/NIT/SPA alumni faculty, 99.9% success rate, free AI-powered study app, online + offline hybrid coaching. Small batches of max 25 students.",
  foundingDate: '2009',
  telephone: ORG_PHONE,
  email: ORG_EMAIL,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'PT Rajan Road, Sector 13, Ashok Nagar',
    addressLocality: 'Chennai',
    addressRegion: 'Tamil Nadu',
    postalCode: '600083',
    addressCountry: 'IN',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 13.0382,
    longitude: 80.2120,
  },
  sameAs: [...SOCIAL_PROFILES, 'https://share.google/CUC4sm7hWYHZEajn7'],
  areaServed: [
    { '@type': 'City', name: 'Chennai' },
    { '@type': 'City', name: 'Kanchipuram' },
    { '@type': 'City', name: 'Chengalpattu' },
    { '@type': 'City', name: 'Tiruvallur' },
    { '@type': 'City', name: 'Vellore' },
    { '@type': 'City', name: 'Pondicherry' },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    reviewCount: '50',
    bestRating: '5',
    worstRating: '1',
  },
  priceRange: '₹₹',
  knowsAbout: [
    'NATA Exam Preparation',
    'JEE Paper 2 B.Arch Coaching',
    'Architecture Drawing Classes',
    'NATA Mathematics Coaching',
    'Architecture College Admission Counselling',
  ],
  additionalProperty: [
    {
      '@type': 'PropertyValue',
      name: 'Best Known For',
      value: 'AI-powered NATA coaching with free study app, hybrid online-offline classes, and highest success rate in Chennai (99.9%)',
    },
    {
      '@type': 'PropertyValue',
      name: 'Unique Feature',
      value: 'Only NATA coaching in Chennai with free AI-powered study app featuring cutoff calculator and college predictor for 5000+ colleges',
    },
  ],
  parentOrganization: {
    '@id': `${BASE_URL}/#organization`,
  },
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'NATA Coaching Programs in Chennai',
    itemListElement: [
      {
        '@type': 'Course',
        name: 'NATA 1-Year Program in Chennai',
        description: 'Comprehensive 12-month NATA coaching in Chennai with daily drawing practice, 100+ mock tests, and IIT/NIT faculty.',
        provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
        offers: { '@type': 'Offer', price: '25000', priceCurrency: 'INR' },
      },
      {
        '@type': 'Course',
        name: 'NATA Crash Course Chennai (3 Months)',
        description: 'Intensive 3-month NATA preparation in Chennai. Starting ₹15,000.',
        provider: { '@type': 'EducationalOrganization', name: ORG_NAME },
        offers: { '@type': 'Offer', price: '15000', priceCurrency: 'INR' },
      },
    ],
  },
};

const whyNeramChennai = [
  {
    title: 'Only Chennai Institute with Free AI Study App',
    desc: 'No other NATA coaching in Chennai offers a free AI-powered study app. Our app includes a NATA cutoff calculator, college predictor for 5,000+ architecture colleges across India, and exam center locator — all free, no login needed. This gives Neram students a significant preparation advantage.',
  },
  {
    title: 'Hybrid Online + Offline Classes',
    desc: 'Attend in-person at our Chennai centre or join live online classes from home — switch anytime. Other Chennai institutes offer either online or offline, not both. Our hybrid model means Chennai students traveling or studying from home never miss a class.',
  },
  {
    title: '150+ City Network (Not Just Chennai)',
    desc: 'While other coaching institutes are limited to Chennai, Neram operates across 150+ cities in India and 6 Gulf countries. This means a wider community of peers, more diverse mock test benchmarks, and national-level competition exposure — not just local.',
  },
  {
    title: '17+ Years in Chennai (Since 2009)',
    desc: 'Neram Classes started in Chennai in 2009, making us one of the longest-running NATA coaching centres in the city. Over 17 years, we have trained thousands of Chennai students with a 99.9% success rate. Our Chennai alumni are in SPA Delhi, NIT Trichy, CEPT Ahmedabad, Anna University, and 50+ top colleges.',
  },
  {
    title: 'Smallest Batches in Chennai: Max 25',
    desc: 'Most Chennai coaching centres have 40–60+ students per batch. Neram limits each batch to 25, ensuring every student gets individual drawing feedback, personal mentoring, and faculty attention. This is why our success rate is 99.9%.',
  },
  {
    title: 'IIT/NIT/SPA Faculty — Not Just Freelancers',
    desc: 'Every Neram faculty in Chennai is an IIT, NIT, or SPA alumnus — practising architects with years of real-world experience. We do not use freelance tutors or unqualified instructors. Our students learn from the architects who evaluate NATA-level drawings.',
  },
];

const faqs = [
  {
    question: 'What is the best NATA coaching in Chennai?',
    answer:
      "Neram Classes is Chennai's #1 rated NATA coaching institute since 2009. With a 99.9% success rate, IIT/NIT/SPA alumni faculty, small batches (max 25), daily drawing practice, and the only free AI-powered study app among Chennai coaching centres, Neram provides the most comprehensive NATA preparation in the city.",
  },
  {
    question: 'How is Neram different from other NATA coaching in Chennai?',
    answer:
      'Neram stands apart from other Chennai NATA coaching centres in 6 key ways: (1) Only institute with a free AI study app with college predictor for 5000+ colleges, (2) Hybrid online + offline model (switch anytime), (3) 150+ city network vs single-city presence, (4) Max 25 students per batch vs 40-60+ elsewhere, (5) 17+ years of experience since 2009, (6) IIT/NIT/SPA alumni faculty only.',
  },
  {
    question: 'What is the fee for NATA coaching in Chennai?',
    answer:
      'NATA coaching fees at Neram Classes Chennai: Crash Course (3 months) ₹15,000, 1-Year Program ₹25,000, 2-Year Program ₹30,000. These fees include all study materials, mock tests, app access, and drawing supplies. Merit-based scholarships (up to 100%) and EMI options are available.',
  },
  {
    question: 'Does Neram Chennai offer online NATA coaching?',
    answer:
      'Yes, Neram Chennai offers a fully hybrid model. Students can attend in-person at the Chennai centre or join live interactive online classes — and switch between modes at any time. Online students get the same curriculum, faculty, mock tests, and app access as offline students.',
  },
  {
    question: 'What results has Neram Chennai achieved in NATA?',
    answer:
      "Neram Chennai maintains a 99.9% NATA success rate. Our Chennai students have been admitted to SPA Delhi, SPA Bhopal, CEPT Ahmedabad, NIT Trichy, NIT Calicut, Anna University, BMS College, RV College, and 50+ top architecture colleges. Multiple students score 130+ and 150+ in NATA every year.",
  },
  {
    question: 'Where is Neram Classes located in Chennai?',
    answer:
      'Neram Classes flagship Chennai center is at PT Rajan Road, Sector 13, Ashok Nagar, Chennai 600083 — a 5-minute walk from Ashok Nagar Metro Station (Blue Line). We also have a sub-center at Tambaram (Thiruneermalai, Jain Alpine Meadows). We serve students from Anna Nagar (7 km), T. Nagar (3 km), Adyar (8 km), Velachery (12 km), Tambaram (22 km), and all Chennai neighborhoods through our hybrid online-offline model. Students from Kanchipuram, Chengalpattu, Tiruvallur, Vellore, and Pondicherry also attend.',
  },
];

interface PageProps {
  params: { locale: string };
}

export default function BestNataCoachingChennaiPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd data={chennaiSchema} />
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'Coaching', url: `${BASE_URL}/coaching` },
          { name: 'Best NATA Coaching in Chennai', url: `${BASE_URL}/coaching/best-nata-coaching-chennai` },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />

      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 10 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label="Chennai • Since 2009" color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
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
            Best NATA Coaching in Chennai 2026
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
            Chennai&apos;s #1 rated NATA coaching since 2009. 99.9% success rate, IIT/NIT/SPA
            alumni faculty, free AI study app, online + offline hybrid classes. Max 25 students per batch.
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
              Apply Now — ₹15,000 Onwards
            </Button>
          </Box>

          {/* Quick stats */}
          <Box sx={{ display: 'flex', gap: { xs: 2, md: 4 }, mt: 5, flexWrap: 'wrap' }}>
            {[
              { value: '17+ yrs', label: 'Since 2009' },
              { value: '99.9%', label: 'Success Rate' },
              { value: 'Max 25', label: 'Per Batch' },
              { value: '4.9/5', label: 'Student Rating' },
            ].map((s, i) => (
              <Box key={i} sx={{ textAlign: 'center', minWidth: 80 }}>
                <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: '#e8a020' }}>{s.value}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Why Neram is #1 in Chennai */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            Why Neram is Chennai&apos;s #1 NATA Coaching
          </Typography>
          <Typography sx={{ color: '#666', mb: 4 }}>
            6 reasons Chennai students choose Neram over other coaching institutes
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {whyNeramChennai.map((item, i) => (
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

      {/* Chennai Results */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e' }}>
            Chennai Student Results
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, textAlign: 'center' }}>
            {[
              { value: '99.9%', label: 'Students Clear NATA' },
              { value: '70%+', label: 'Score Above 120' },
              { value: '50+', label: 'Top Colleges Placed' },
              { value: '50+', label: 'Chennai Reviews (4.9/5)' },
            ].map((stat, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0', py: 3 }}>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 800, color: '#e8a020' }}>{stat.value}</Typography>
                <Typography sx={{ fontSize: '0.85rem', color: '#666' }}>{stat.label}</Typography>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Courses in Chennai */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e' }}>
            NATA Coaching Programs in Chennai
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
            {[
              { name: 'NATA Crash Course', duration: '3 Months', fee: '₹15,000', features: ['Quick revision of all topics', '30+ mock tests', 'Drawing practice', 'Doubt sessions'] },
              { name: 'NATA 1-Year Program', duration: '12 Months', fee: '₹25,000', features: ['Complete syllabus coverage', '100+ mock tests', 'Daily drawing (2+ hrs)', 'Personal mentoring', 'Free AI study app'] },
              { name: 'NATA 2-Year Program', duration: '24 Months', fee: '₹30,000', features: ['Foundation + Advanced', '1-on-1 mentoring', 'NATA + JEE Paper 2', 'Scholarship eligible'] },
            ].map((course, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 0.5, color: '#1a1a2e' }}>{course.name}</Typography>
                  <Typography sx={{ color: '#666', fontSize: '0.85rem', mb: 1 }}>{course.duration}</Typography>
                  <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#e8a020', mb: 2 }}>Starting {course.fee}</Typography>
                  {course.features.map((f, j) => (
                    <Typography key={j} sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>• {f}</Typography>
                  ))}
                  <Button
                    component={Link}
                    href="/apply"
                    variant="contained"
                    fullWidth
                    sx={{ mt: 2, bgcolor: '#1a1a2e', '&:hover': { bgcolor: '#0a0a1e' } }}
                  >
                    Apply Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Serving All Chennai Neighborhoods */}
      <Box sx={{ py: { xs: 5, md: 7 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            Serving All Chennai Neighborhoods
          </Typography>
          <Typography sx={{ color: '#666', mb: 3 }}>
            Our Ashok Nagar center + live online classes cover every part of Chennai
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              { name: 'Anna Nagar', dist: '7 km', slug: 'anna-nagar' },
              { name: 'Adyar', dist: '8 km', slug: 'adyar' },
              { name: 'Tambaram', dist: '22 km (sub-center)', slug: 'tambaram' },
              { name: 'Ashok Nagar', dist: 'Center here', slug: 'ashok-nagar' },
              { name: 'Velachery', dist: '12 km', slug: 'velachery' },
              { name: 'T. Nagar', dist: '3 km', slug: 't-nagar' },
            ].map((area) => (
              <Card key={area.slug} elevation={0} sx={{ border: '1px solid #e0e0e0', '&:hover': { borderColor: '#e8a020' }, transition: 'border-color 0.2s' }}>
                <CardContent component={Link} href={`/coaching/nata-coaching-chennai/${area.slug}`} sx={{ p: 2, display: 'block', textDecoration: 'none', color: 'inherit' }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#1a1a2e' }}>
                    {area.name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#e8a020', fontWeight: 600 }}>
                    {area.dist}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
          <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {['OMR', 'Porur', 'Guindy', 'Chromepet', 'Saidapet', 'K.K. Nagar', 'West Mambalam', 'Sholinganallur', 'Mylapore', 'Nungambakkam'].map((area) => (
              <Chip key={area} label={area} variant="outlined" size="small" />
            ))}
            <Chip label="+ more neighborhoods" variant="outlined" size="small" color="warning" />
          </Box>
          <Button component={Link} href="/coaching/nata-coaching-chennai" variant="text" sx={{ mt: 2, color: '#e8a020', fontWeight: 600 }}>
            View all Chennai neighborhoods →
          </Button>
        </Container>
      </Box>

      {/* Center Location & Landmarks */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            Our Chennai Center
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            <Card elevation={0} sx={{ border: '2px solid #e8a020' }}>
              <CardContent sx={{ p: 3 }}>
                <Chip label="Flagship Center" color="warning" size="small" sx={{ mb: 1.5 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1, color: '#1a1a2e' }}>
                  Neram Classes — Ashok Nagar, Chennai
                </Typography>
                <Typography sx={{ color: '#555', fontSize: '0.95rem', mb: 1 }}>
                  PT Rajan Road, Sector 13, Ashok Nagar, Chennai 600083
                </Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>
                  5 min walk from Ashok Nagar Metro Station (Blue Line)
                </Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>
                  Mon-Fri: 9 AM — 6 PM | Sat: 9 AM — 2 PM
                </Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 1.5 }}>
                  Phone: +91-9176137043
                </Typography>
                <Button component={Link} href="/demo-class" variant="contained" sx={{ bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 600 }}>
                  Book Visit / Demo Class
                </Button>
              </CardContent>
            </Card>
            <Card elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
              <CardContent sx={{ p: 3 }}>
                <Chip label="Sub-Center" size="small" sx={{ mb: 1.5 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1, color: '#1a1a2e' }}>
                  Neram Classes — Tambaram
                </Typography>
                <Typography sx={{ color: '#555', fontSize: '0.95rem', mb: 1 }}>
                  Thiruneermalai, Jain Alpine Meadows, Tambaram, Chennai
                </Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>
                  Serving: Tambaram, Chengalpattu, Kanchipuram, ECR
                </Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>
                  Near Tambaram Railway Station
                </Typography>
              </CardContent>
            </Card>
          </Box>

          <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mt: 4, mb: 2, color: '#1a1a2e' }}>
            Architecture Colleges in Chennai (Accepting NATA Scores)
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {[
              'School of Architecture & Planning, Anna University (Govt)',
              'MEASI Academy of Architecture',
              'SRM School of Architecture',
              'Hindustan Institute of Technology',
              'B.S. Abdur Rahman Crescent University',
            ].map((college, i) => (
              <Chip key={i} label={college} variant="outlined" size="small" />
            ))}
          </Box>
        </Container>
      </Box>

      {/* FAQ Section */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e', textAlign: 'center' }}>
            NATA Coaching Chennai — FAQ
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
            Join Chennai&apos;s #1 NATA Coaching
          </Typography>
          <Typography sx={{ color: '#333', mb: 3, fontSize: '1.05rem' }}>
            Book a free demo class today. Scholarships and EMI options available.
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
              Apply Now
            </Button>
          </Box>
        </Container>
      </Box>

      {/* SEO Content Block */}
      <Box sx={{ py: 6, bgcolor: '#060d1f', color: '#fff' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: '1.5rem', fontWeight: 700, color: '#e8a020', mb: 3 }}>
            About NATA Coaching in Chennai
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', mb: 2 }}>
            Chennai is one of India&apos;s top cities for architecture education, home to Anna University&apos;s School of Architecture, SRM, VIT, and several other reputed B.Arch colleges. For students in Chennai preparing for NATA 2026, choosing the right coaching is critical. The best NATA coaching in Chennai should offer: experienced architect faculty (IIT/NIT/SPA alumni), daily drawing practice (drawing is 80/200 marks), small batch sizes for individual attention, both online and offline options, and access to modern preparation tools.
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)', mb: 2 }}>
            Neram Classes has been the top choice for Chennai NATA aspirants since 2009. Our Chennai centre provides in-person coaching with max 25 students per batch — significantly smaller than the 40–60+ batch sizes common at other Chennai coaching centres. We are the only NATA coaching in Chennai offering a free AI-powered study app with a cutoff calculator, college predictor for 5,000+ colleges, and exam center locator. Our hybrid model means Chennai students can attend offline at our centre or join live online classes — and switch anytime.
          </Typography>
          <Typography sx={{ lineHeight: 1.8, color: 'rgba(255,255,255,0.85)' }}>
            Our Chennai students have consistently achieved excellent NATA results: 99.9% clear the qualifying cutoff, 70%+ score above 120, and multiple students score 150+ every year. Chennai alumni from Neram are now studying at SPA Delhi, CEPT Ahmedabad, NIT Trichy, Anna University, BMS College, and 50+ other top architecture colleges. With fees starting at ₹15,000, scholarships up to 100%, and EMI options, Neram Classes is the most accessible and effective NATA coaching available in Chennai. Students from Kanchipuram, Chengalpattu, Tiruvallur, Vellore, and Pondicherry also attend our Chennai centre or join our online program.
          </Typography>
        </Container>
      </Box>
    </>
  );
}
