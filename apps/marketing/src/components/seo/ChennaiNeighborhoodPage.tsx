'use client';

import { Box, Container, Typography, Card, CardContent, Chip, Button } from '@neram/ui';
import Link from 'next/link';
import type { ChennaiNeighborhood } from '@/lib/seo/chennai-neighborhoods';
import { chennaiNeighborhoods } from '@/lib/seo/chennai-neighborhoods';

interface Props {
  neighborhood: ChennaiNeighborhood;
}

export default function ChennaiNeighborhoodPage({ neighborhood }: Props) {
  const otherNeighborhoods = chennaiNeighborhoods.filter((n) => n.slug !== neighborhood.slug);

  return (
    <>
      {/* Hero */}
      <Box sx={{ background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)', py: { xs: 6, md: 10 }, color: '#fff' }}>
        <Container maxWidth="lg">
          <Chip label={`${neighborhood.name}, Chennai`} color="warning" size="small" sx={{ mb: 2, fontWeight: 600 }} />
          <Typography
            variant="h1"
            component="h1"
            sx={{ fontSize: { xs: '1.75rem', md: '2.5rem' }, fontWeight: 800, mb: 2, lineHeight: 1.2 }}
          >
            Best NATA Coaching in {neighborhood.name}, Chennai
          </Typography>
          <Typography
            component="p"
            sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, color: 'rgba(255,255,255,0.8)', maxWidth: 650, lineHeight: 1.6, mb: 3 }}
          >
            {neighborhood.distanceFromCenter}. IIT/NIT/SPA alumni faculty, 99.9% success rate,
            free AI study app. Online + offline hybrid classes. Max 25 students per batch.
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
              href="/coaching/best-nata-coaching-chennai"
              variant="outlined"
              size="large"
              sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}
            >
              Chennai Center Details
            </Button>
          </Box>
        </Container>
      </Box>

      {/* About This Neighborhood */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            NATA Coaching for {neighborhood.name} Students
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#444', mb: 3, maxWidth: 800 }}>
            {neighborhood.description}
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.8, color: '#444', maxWidth: 800 }}>
            {neighborhood.whyStudentsChoose}
          </Typography>
        </Container>
      </Box>

      {/* How to Reach */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            How to Reach Neram from {neighborhood.name}
          </Typography>
          <Card elevation={0} sx={{ border: '1px solid #e0e0e0', mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, mb: 1, color: '#1a1a2e' }}>Distance & Transport</Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, mb: 2 }}>{neighborhood.transportInfo}</Typography>
              <Typography sx={{ fontWeight: 700, mb: 1, color: '#1a1a2e' }}>Center Address</Typography>
              <Typography sx={{ color: '#555' }}>PT Rajan Road, Sector 13, Ashok Nagar, Chennai 600083</Typography>
            </CardContent>
          </Card>

          <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2, color: '#1a1a2e' }}>
            Landmarks in {neighborhood.name}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
            {neighborhood.landmarks.map((l, i) => (
              <Chip key={i} label={l} variant="outlined" size="small" />
            ))}
          </Box>

          <Typography variant="h3" sx={{ fontSize: '1.1rem', fontWeight: 700, mb: 2, color: '#1a1a2e' }}>
            Schools Near {neighborhood.name}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {neighborhood.nearbySchools.map((s, i) => (
              <Chip key={i} label={s} variant="outlined" size="small" />
            ))}
          </Box>
        </Container>
      </Box>

      {/* Why Neram */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            Why {neighborhood.name} Students Choose Neram Classes
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {[
              { title: 'Free AI Study App', desc: 'Only institute with free NATA cutoff calculator, college predictor (5000+ colleges), and exam center locator.' },
              { title: 'Hybrid: Online + Offline', desc: `Study online from ${neighborhood.name} or attend at our Ashok Nagar center. Switch anytime.` },
              { title: 'Max 25 Per Batch', desc: 'Individual drawing feedback and personal mentoring. Not 50-100+ students like other institutes.' },
              { title: '99.9% Success Rate', desc: 'Highest success rate. Students scoring 130+ and admitted to SPA Delhi, NIT Trichy, CEPT Ahmedabad.' },
              { title: 'IIT/NIT/SPA Faculty', desc: 'Every instructor is an IIT, NIT, or SPA alumnus: practising architects, not freelancers.' },
              { title: 'Daily Drawing (2+ hrs)', desc: 'Drawing is 80/200 marks in NATA. We provide 2+ hours of supervised drawing practice daily.' },
            ].map((item, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '1rem', mb: 0.5, color: '#1a1a2e' }}>{item.title}</Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.6 }}>{item.desc}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Quick Stats */}
      <Box sx={{ py: 5, bgcolor: '#1a1a2e', color: '#fff' }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, textAlign: 'center' }}>
            {[
              { value: '17+', label: 'Years (Since 2009)' },
              { value: '99.9%', label: 'Success Rate' },
              { value: 'Max 25', label: 'Per Batch' },
              { value: '4.9/5', label: 'Student Rating' },
            ].map((stat, i) => (
              <Box key={i}>
                <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 800, color: '#e8a020' }}>{stat.value}</Typography>
                <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>{stat.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Courses */}
      <Box sx={{ py: { xs: 5, md: 7 } }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            NATA Coaching Programs Available from {neighborhood.name}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2.5 }}>
            {[
              { name: 'NATA Crash Course', duration: '3 Months', fee: '₹15,000', features: ['Quick revision', '30+ mock tests', 'Drawing practice', 'Online + offline'] },
              { name: 'NATA 1-Year Program', duration: '12 Months', fee: '₹25,000', features: ['Complete syllabus', '100+ mock tests', 'Daily drawing (2+ hrs)', 'Personal mentoring', 'Free AI study app'] },
              { name: 'NATA 2-Year Program', duration: '24 Months', fee: '₹30,000', features: ['Foundation + Advanced', '1-on-1 mentoring', 'NATA + JEE Paper 2', 'Scholarship eligible'] },
            ].map((course, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a1a2e' }}>{course.name}</Typography>
                  <Typography sx={{ color: '#666', fontSize: '0.85rem', mb: 1 }}>{course.duration}</Typography>
                  <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: '#e8a020', mb: 1.5 }}>Starting {course.fee}</Typography>
                  {course.features.map((f, j) => (
                    <Typography key={j} sx={{ color: '#555', fontSize: '0.9rem', mb: 0.3 }}>• {f}</Typography>
                  ))}
                  <Button component={Link} href="/apply" variant="contained" fullWidth sx={{ mt: 2, bgcolor: '#1a1a2e', '&:hover': { bgcolor: '#0a0a1e' } }}>
                    Apply Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Other Chennai Neighborhoods */}
      <Box sx={{ py: { xs: 5, md: 6 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, mb: 3, color: '#1a1a2e' }}>
            NATA Coaching Across Chennai
          </Typography>
          <Typography sx={{ color: '#555', mb: 3 }}>
            Neram Classes serves students from all Chennai neighborhoods through our Ashok Nagar center and online classes.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {otherNeighborhoods.map((n) => (
              <Chip
                key={n.slug}
                component={Link}
                href={`/coaching/nata-coaching-chennai/${n.slug}`}
                label={`NATA Coaching ${n.name}`}
                clickable
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
            ))}
            <Chip
              component={Link}
              href="/coaching/best-nata-coaching-chennai"
              label="Chennai Overview"
              clickable
              color="warning"
              sx={{ fontWeight: 600 }}
            />
          </Box>
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', md: '1.75rem' }, fontWeight: 700, color: '#1a1a2e', mb: 2 }}>
            Ready to Start NATA Preparation?
          </Typography>
          <Typography sx={{ color: '#333', mb: 3 }}>
            Book a free demo class, attend online from {neighborhood.name} or visit our Ashok Nagar center.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button component={Link} href="/demo-class" variant="contained" size="large" sx={{ bgcolor: '#1a1a2e', color: '#fff', '&:hover': { bgcolor: '#0a0a1e' }, fontWeight: 700, px: 4 }}>
              Free Demo Class
            </Button>
            <Button component={Link} href="/apply" variant="outlined" size="large" sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}>
              Apply Now, ₹15,000 Onwards
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
