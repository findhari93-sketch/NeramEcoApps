'use client';

import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@neram/ui';
import Link from 'next/link';

const premiumFeatures = [
  {
    category: 'Learning Experience',
    features: [
      'Unlimited access to all courses',
      'HD quality video lectures',
      'Downloadable study materials',
      'Interactive live classes',
      'Recording of all live sessions',
    ],
  },
  {
    category: 'Personal Support',
    features: [
      'Dedicated mentor assignment',
      '24/7 doubt resolution',
      'Weekly 1-on-1 sessions',
      'Personalized study plan',
      'Progress tracking dashboard',
    ],
  },
  {
    category: 'Practice & Assessment',
    features: [
      'Unlimited mock tests',
      'Previous year papers with solutions',
      'Topic-wise practice tests',
      'All India test series',
      'Detailed performance analytics',
    ],
  },
  {
    category: 'Exclusive Benefits',
    features: [
      'Priority support response',
      'Early access to new features',
      'Certificate upon completion',
      'Job placement assistance',
      'Alumni network access',
    ],
  },
];

const plans = [
  {
    name: 'Basic',
    price: '₹15,000',
    duration: '6 Months',
    features: [
      'Access to selected courses',
      'Standard video quality',
      'Email support',
      'Basic study materials',
      'Monthly mock tests',
    ],
    popular: false,
  },
  {
    name: 'Premium',
    price: '₹35,000',
    duration: '12 Months',
    features: [
      'All Premium features listed above',
      'HD video quality',
      'Dedicated mentor',
      '1-on-1 doubt sessions',
      'Weekly mock tests',
      'Performance analytics',
      'Certificate included',
    ],
    popular: true,
  },
  {
    name: 'Elite',
    price: '₹75,000',
    duration: '24 Months',
    features: [
      'Everything in Premium',
      'Personal academic counselor',
      'Daily 1-on-1 sessions',
      'Guaranteed seat in batch',
      'Interview preparation',
      'Placement support',
      'Lifetime access to recordings',
    ],
    popular: false,
  },
];

export default function PremiumPage() {
  return (
    <Box>
      {/* Hero Section */}
      <Box
        sx={{
          py: { xs: 8, md: 12 },
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          color: 'black',
        }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="overline" sx={{ fontWeight: 600, letterSpacing: 2 }}>
                NERAM CLASSES PREMIUM
              </Typography>
              <Typography variant="h1" component="h1" gutterBottom sx={{ fontWeight: 700, fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
                Unlock Your Full Potential
              </Typography>
              <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>
                Get unlimited access to all courses, personal mentoring, and exclusive features
                designed to fast-track your success.
              </Typography>
              <Button
                variant="contained"
                size="large"
                component={Link}
                href="/apply"
                sx={{ bgcolor: 'black', color: 'white', '&:hover': { bgcolor: 'grey.900' } }}
              >
                Get Premium Access
              </Button>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Grid Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Premium Features
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Everything you need to excel in your exams
          </Typography>

          <Grid container spacing={4}>
            {premiumFeatures.map((section, index) => (
              <Grid item xs={12} sm={6} md={3} key={index}>
                <Card sx={{ height: '100%', p: 3 }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'primary.main' }}>
                    {section.category}
                  </Typography>
                  <List dense>
                    {section.features.map((feature, idx) => (
                      <ListItem key={idx} sx={{ px: 0 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          <Typography color="success.main">✓</Typography>
                        </ListItemIcon>
                        <ListItemText
                          primary={feature}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Pricing Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'grey.50' }}>
        <Container maxWidth="lg">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 2, fontWeight: 700 }}>
            Choose Your Plan
          </Typography>
          <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 6 }}>
            Flexible plans to suit your learning needs
          </Typography>

          <Grid container spacing={4} justifyContent="center">
            {plans.map((plan, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    border: plan.popular ? '2px solid' : '1px solid',
                    borderColor: plan.popular ? 'primary.main' : 'divider',
                    transform: plan.popular ? 'scale(1.05)' : 'none',
                    position: 'relative',
                    zIndex: plan.popular ? 1 : 0,
                  }}
                >
                  {plan.popular && (
                    <Box
                      sx={{
                        bgcolor: 'primary.main',
                        color: 'white',
                        py: 1,
                        textAlign: 'center',
                        fontWeight: 600,
                      }}
                    >
                      MOST POPULAR
                    </Box>
                  )}
                  <CardContent sx={{ flexGrow: 1, p: 4, textAlign: 'center' }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                      {plan.name}
                    </Typography>
                    <Typography variant="h3" component="div" sx={{ fontWeight: 700, my: 2 }}>
                      {plan.price}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      {plan.duration}
                    </Typography>
                    <Divider sx={{ my: 3 }} />
                    <List dense>
                      {plan.features.map((feature, idx) => (
                        <ListItem key={idx} sx={{ px: 0, justifyContent: 'center' }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            <Typography color="success.main">✓</Typography>
                          </ListItemIcon>
                          <ListItemText
                            primary={feature}
                            primaryTypographyProps={{ variant: 'body2' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                    <Button
                      variant={plan.popular ? 'contained' : 'outlined'}
                      fullWidth
                      size="large"
                      component={Link}
                      href="/apply"
                      sx={{ mt: 3 }}
                    >
                      Get Started
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Testimonial Section */}
      <Box sx={{ py: { xs: 6, md: 10 }, bgcolor: 'background.default' }}>
        <Container maxWidth="md">
          <Typography variant="h2" component="h2" align="center" gutterBottom sx={{ mb: 6, fontWeight: 700 }}>
            What Premium Students Say
          </Typography>
          <Card sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h5" sx={{ fontStyle: 'italic', mb: 3 }}>
              "The premium membership was the best investment I made for my NATA preparation.
              The personal mentoring and unlimited mock tests helped me score AIR 45.
              Highly recommended for serious aspirants!"
            </Typography>
            <Typography variant="h6" color="primary">
              - Ananya Sharma, NATA 2024 AIR 45
            </Typography>
          </Card>
        </Container>
      </Box>

      {/* CTA Section */}
      <Box
        sx={{
          py: { xs: 6, md: 10 },
          background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h3" component="h2" gutterBottom sx={{ fontWeight: 700 }}>
            Start Your Premium Journey Today
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, opacity: 0.9 }}>
            Join thousands of successful students who chose Premium
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={Link}
            href="/apply"
            sx={{ bgcolor: 'black', color: 'white', '&:hover': { bgcolor: 'grey.900' } }}
          >
            Get Premium Now
          </Button>
        </Container>
      </Box>
    </Box>
  );
}
