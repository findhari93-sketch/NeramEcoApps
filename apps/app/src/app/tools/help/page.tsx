'use client';

import { Box, Typography, Grid, Card, CardContent, CardActions, Button } from '@neram/ui';
import Link from 'next/link';
import TawkToChat from '@/components/TawkToChat';

const faqTopics = [
  {
    title: 'Cutoff Calculator',
    description:
      'Learn how to calculate your expected NATA cutoff score using section-wise marks and category-based analysis.',
    href: '/tools/cutoff-calculator',
    icon: '🔢',
  },
  {
    title: 'College Predictor',
    description:
      'Find out how to predict colleges based on your NATA score, category, and preferred state.',
    href: '/tools/college-predictor',
    icon: '🏫',
  },
  {
    title: 'Exam Centers',
    description:
      'Locate NATA exam centers near you with distance information and directions.',
    href: '/tools/exam-centers',
    icon: '📍',
  },
  {
    title: 'Course Enrollment',
    description:
      'Get help with applying to Neram Classes, payment options, scholarships, and course details.',
    href: 'https://neramclasses.com/apply',
    icon: '📝',
  },
];

export default function HelpPage() {
  return (
    <Box>
      {/* Tawk.to Live Chat Widget */}
      <TawkToChat />

      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', mb: { xs: 4, md: 6 } }}>
        <Typography
          variant="h3"
          component="h1"
          gutterBottom
          sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', md: '2.5rem' } }}
        >
          Help & Support
        </Typography>
        <Typography
          variant="h6"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: 'auto', fontSize: { xs: '1rem', md: '1.25rem' } }}
        >
          Need assistance? Chat with us live or browse the topics below for quick answers.
        </Typography>
      </Box>

      {/* FAQ Topics Grid */}
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        Quick Help Topics
      </Typography>
      <Grid container spacing={3}>
        {faqTopics.map((topic) => (
          <Grid item xs={12} sm={6} md={3} key={topic.href}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ fontSize: '2rem', mb: 1.5 }}>{topic.icon}</Box>
                <Typography variant="h6" gutterBottom fontWeight={600}>
                  {topic.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {topic.description}
                </Typography>
              </CardContent>
              <CardActions sx={{ p: 2, pt: 0 }}>
                <Button
                  component={Link}
                  href={topic.href}
                  variant="outlined"
                  fullWidth
                  size="small"
                >
                  Learn More
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Contact Info Fallback */}
      <Box
        sx={{
          mt: { xs: 4, md: 6 },
          p: { xs: 3, md: 4 },
          bgcolor: 'grey.50',
          borderRadius: 2,
          textAlign: 'center',
        }}
      >
        <Typography variant="h5" gutterBottom fontWeight={600}>
          Other Ways to Reach Us
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Prefer email or phone? We&apos;re happy to help through any channel.
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'center',
            gap: { xs: 2, sm: 4 },
            mt: 2,
          }}
        >
          <Box>
            <Typography variant="subtitle2" color="primary" fontWeight={600}>
              Email
            </Typography>
            <Typography variant="body2">info@neramclasses.com</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="primary" fontWeight={600}>
              Phone
            </Typography>
            <Typography variant="body2">+91-9176137043</Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="primary" fontWeight={600}>
              Hours
            </Typography>
            <Typography variant="body2">Mon-Sat, 9 AM - 6 PM</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
