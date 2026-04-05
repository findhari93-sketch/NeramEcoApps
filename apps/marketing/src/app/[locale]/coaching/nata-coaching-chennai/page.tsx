import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { BASE_URL, ORG_NAME } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';
import { chennaiNeighborhoods, CHENNAI_CENTER_ADDRESS } from '@/lib/seo/chennai-neighborhoods';


export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA Coaching in Chennai, All Neighborhoods | Neram Classes',
    description: 'Find NATA coaching in your Chennai neighborhood. Neram Classes serves Anna Nagar, Adyar, Tambaram, Ashok Nagar, T. Nagar, Velachery & more. Flagship center at Ashok Nagar + online classes. Since 2009.',
    keywords: 'NATA coaching Chennai, NATA coaching Anna Nagar, NATA coaching Adyar, NATA coaching Tambaram, NATA coaching Ashok Nagar, NATA coaching T Nagar, NATA coaching Velachery, NATA classes Chennai neighborhoods',
    alternates: buildAlternates(locale, '/coaching/nata-coaching-chennai'),
    openGraph: {
      title: 'NATA Coaching Across Chennai, All Neighborhoods | Neram Classes',
      description: 'Find NATA coaching near you in Chennai. Serving Anna Nagar, Adyar, Tambaram, Ashok Nagar, T. Nagar, Velachery & 10+ neighborhoods.',
      type: 'article',
    },
  };
}

const faqs = [
  {
    question: 'Which areas of Chennai does Neram Classes cover for NATA coaching?',
    answer: 'Neram Classes covers all Chennai neighborhoods through our flagship center at Ashok Nagar (PT Rajan Road) and live online classes. Major areas served: Anna Nagar (7 km), Adyar (8 km), Tambaram (22 km, with sub-center), T. Nagar (3 km), Velachery (12 km), OMR, Porur, Guindy, Chromepet, and more. Students from Kanchipuram, Chengalpattu, Tiruvallur, and Pondicherry also attend.',
  },
  {
    question: 'Does Neram have multiple centers in Chennai?',
    answer: 'Neram has two locations in Chennai: (1) Flagship center at Ashok Nagar, PT Rajan Road, Sector 13, near Ashok Nagar Metro. (2) Sub-center at Tambaram, Thiruneermalai, Jain Alpine Meadows. All students also have full access to live online classes.',
  },
  {
    question: 'Can I attend NATA coaching online from any Chennai neighborhood?',
    answer: "Yes, Neram's live online NATA classes are available from every Chennai neighborhood. Same IIT/NIT alumni faculty, same curriculum, real-time drawing feedback via screen sharing. You can switch between online and offline anytime. This is especially popular with students from Velachery, OMR, Porur, and other areas 10+ km from the center.",
  },
];

export default function NataCoachingChennaiHub({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: BASE_URL },
        { name: 'Coaching', url: `${BASE_URL}/coaching` },
        { name: 'NATA Coaching Chennai', url: `${BASE_URL}/coaching/nata-coaching-chennai` },
      ])} />
      <JsonLd data={generateFAQSchema(faqs)} />

      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 9 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label="Chennai • Since 2009" color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
          <Typography variant="h1" component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, fontWeight: 800, mb: 2, lineHeight: 1.2 }}>
            NATA Coaching Across Chennai
          </Typography>
          <Typography component="p" sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, color: 'rgba(255,255,255,0.8)', maxWidth: 650, lineHeight: 1.6, mb: 3 }}>
            Find NATA coaching in your Chennai neighborhood. Flagship center at Ashok Nagar + sub-center at Tambaram + live online classes from anywhere in Chennai.
          </Typography>
          <Button component={Link} href="/coaching/best-nata-coaching-chennai" variant="contained" size="large" sx={{ bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 4, mr: 2 }}>
            Chennai Center Details
          </Button>
          <Button component={Link} href="/demo-class" variant="outlined" size="large" sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}>
            Free Demo Class
          </Button>
        </Container>
      </Box>

      {/* Neighborhood Grid */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 700, mb: 1, color: '#1a1a2e' }}>
            NATA Coaching by Chennai Neighborhood
          </Typography>
          <Typography sx={{ color: '#666', mb: 4 }}>
            Click on your neighborhood to see how to reach our center, transport info, and local details.
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {chennaiNeighborhoods.map((n) => (
              <Card key={n.slug} elevation={0} sx={{ border: '1px solid #e0e0e0', '&:hover': { borderColor: '#e8a020', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }, transition: 'all 0.2s' }}>
                <CardContent component={Link} href={`/coaching/nata-coaching-chennai/${n.slug}`} sx={{ p: 3, display: 'block', textDecoration: 'none', color: 'inherit' }}>
                  <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 0.5, color: '#1a1a2e' }}>
                    NATA Coaching {n.name}
                  </Typography>
                  <Typography sx={{ color: '#e8a020', fontSize: '0.85rem', fontWeight: 600, mb: 1 }}>
                    {n.distanceFromCenter}
                  </Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {n.description.slice(0, 150)}...
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Center Info */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            Our Chennai Centers
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            <Card elevation={0} sx={{ border: '2px solid #e8a020' }}>
              <CardContent sx={{ p: 3 }}>
                <Chip label="Flagship Center" color="warning" size="small" sx={{ mb: 1 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1, color: '#1a1a2e' }}>Neram Classes, Ashok Nagar</Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>PT Rajan Road, Sector 13, Ashok Nagar, Chennai 600083</Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>Near Ashok Nagar Metro Station (5 min walk)</Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>Mon-Fri: 9 AM to 6 PM | Sat: 9 AM to 2 PM</Typography>
              </CardContent>
            </Card>
            <Card elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
              <CardContent sx={{ p: 3 }}>
                <Chip label="Sub-Center" size="small" sx={{ mb: 1 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1, color: '#1a1a2e' }}>Neram Classes, Tambaram</Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem', mb: 0.5 }}>Thiruneermalai, Jain Alpine Meadows, Tambaram, Chennai</Typography>
                <Typography sx={{ color: '#555', fontSize: '0.9rem' }}>Serving Tambaram, Chengalpattu, Kanchipuram, ECR students</Typography>
              </CardContent>
            </Card>
          </Box>
        </Container>
      </Box>

      {/* FAQ */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 4, color: '#1a1a2e', textAlign: 'center' }}>
            Frequently Asked Questions
          </Typography>
          {faqs.map((faq, i) => (
            <Box key={i} sx={{ mb: 3, pb: 3, borderBottom: i < faqs.length - 1 ? '1px solid #e0e0e0' : 'none' }}>
              <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}>{faq.question}</Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem' }}>{faq.answer}</Typography>
            </Box>
          ))}
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, color: '#1a1a2e', mb: 2 }}>
            Join Chennai&apos;s #1 NATA Coaching
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#1a1a2e', color: '#fff', '&:hover': { bgcolor: '#0a0a1e' }, fontWeight: 700, px: 4 }}>
              Free Demo Class
            </Button>
            <Button component={Link} href="/apply" variant="outlined" size="large" sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}>
              Apply Now
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
