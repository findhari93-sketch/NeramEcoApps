'use client';

import { useParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Grid,
  Link as MuiLink,
  Divider,
  Chip,
} from '@neram/ui';
import { Link } from '@neram/ui';
import { type Locale } from '@/i18n';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';

const footerLinks = {
  quickLinks: [
    { label: 'Home', href: '/' },
    { label: 'About Us', href: '/about' },
    { label: 'Courses', href: '/courses' },
    { label: 'Coaching', href: '/coaching' },
    { label: 'Apply Now', href: '/apply' },
    { label: 'Contact', href: '/contact' },
    { label: 'Fees', href: '/fees' },
    { label: 'Scholarships', href: '/scholarship' },
    { label: 'Careers', href: '/careers' },
  ],
  resources: [
    { label: 'NATA Syllabus 2026', href: '/nata-syllabus' },
    { label: 'NATA Preparation Guide', href: '/nata-preparation-guide' },
    { label: 'How to Score 150+ in NATA', href: '/how-to-score-150-in-nata' },
    { label: 'Important Questions', href: '/nata-important-questions' },
    { label: 'Best Books for NATA & JEE', href: '/best-books-nata-jee' },
    { label: 'Previous Year Papers', href: '/previous-year-papers' },
    { label: 'Cutoff Calculator', href: '/tools/cutoff-calculator' },
    { label: 'Free NATA App', href: '/nata-app' },
    { label: 'Online Coaching', href: '/best-nata-coaching-online' },
    { label: 'Blog', href: '/blog' },
  ],
  topCities: [
    { label: 'Chennai', href: '/contact/nata-coaching-center-in-chennai' },
    { label: 'Bangalore', href: '/contact/nata-coaching-center-in-bangalore' },
    { label: 'Coimbatore', href: '/contact/nata-coaching-center-in-coimbatore' },
    { label: 'Madurai', href: '/contact/nata-coaching-center-in-madurai' },
    { label: 'Trichy', href: '/contact/nata-coaching-center-in-trichy' },
    { label: 'Tiruppur', href: '/contact/nata-coaching-center-in-tiruppur' },
    { label: 'Pudukkottai', href: '/contact/nata-coaching-center-in-pudukkottai' },
    { label: 'Kanchipuram', href: '/contact/nata-coaching-center-in-kanchipuram' },
    { label: 'Hyderabad', href: '/coaching/nata-coaching/nata-coaching-centers-in-hyderabad' },
    { label: 'Mumbai', href: '/coaching/nata-coaching/nata-coaching-centers-in-mumbai' },
    { label: 'Delhi', href: '/coaching/nata-coaching/nata-coaching-centers-in-delhi' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms & Conditions', href: '/terms' },
    { label: 'Refund Policy', href: '/refund-policy' },
  ],
};

export default function Footer() {
  const params = useParams();
  const locale = params.locale as Locale;
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';

  const getLocalizedPath = (path: string) => {
    return locale === 'en' ? path : `/${locale}${path}`;
  };

  const linkStyle = { opacity: 0.7, color: '#f5f0e8', '&:hover': { opacity: 1, color: '#e8a020' }, fontSize: '0.85rem', transition: 'color 0.2s' };

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: '#030812',
        color: '#f5f0e8',
        pt: { xs: 6, md: 8 },
        pb: 3,
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(232,160,32,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(232,160,32,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        },
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* About Section */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: '#e8a020' }}>
              Neram Classes
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
              India&apos;s leading NATA & JEE Paper 2 coaching institute. Expert IIT/NIT alumni faculty, 99.9% success rate.
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Bangalore, Karnataka, India
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
              Phone: +91-9176137043
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
              Email: info@neramclasses.com
            </Typography>
            <Chip
              label="Supported by Microsoft"
              size="small"
              sx={{
                mt: 1.5,
                height: 22,
                fontSize: '0.7rem',
                fontWeight: 600,
                bgcolor: 'rgba(232,160,32,0.1)',
                color: '#e8a020',
                border: '1px solid rgba(232,160,32,0.3)',
                '& .MuiChip-label': { px: 1.5 },
              }}
            />
          </Grid>

          {/* Quick Links */}
          <Grid item xs={6} sm={3} md={2}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
              Quick Links
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {footerLinks.quickLinks.map((link) => {
                if (link.href === '/apply' && isEnrolled) {
                  return (
                    <MuiLink
                      key={link.href}
                      component="button"
                      onClick={goToApp}
                      color="inherit"
                      underline="hover"
                      sx={{ ...linkStyle, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', p: 0 }}
                    >
                      Go to App
                    </MuiLink>
                  );
                }
                return (
                  <MuiLink
                    key={link.href}
                    component={Link}
                    href={getLocalizedPath(link.href)}
                    color="inherit"
                    underline="hover"
                    sx={linkStyle}
                  >
                    {link.label}
                  </MuiLink>
                );
              })}
            </Box>
          </Grid>

          {/* Resources */}
          <Grid item xs={6} sm={3} md={2}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
              Resources
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {footerLinks.resources.map((link) => (
                <MuiLink
                  key={link.href}
                  component={Link}
                  href={getLocalizedPath(link.href)}
                  color="inherit"
                  underline="hover"
                  sx={linkStyle}
                >
                  {link.label}
                </MuiLink>
              ))}
            </Box>
          </Grid>

          {/* Top Cities */}
          <Grid item xs={6} sm={3} md={2}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
              Top Cities
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {footerLinks.topCities.map((link) => (
                <MuiLink
                  key={link.href}
                  component={Link}
                  href={getLocalizedPath(link.href)}
                  color="inherit"
                  underline="hover"
                  sx={linkStyle}
                >
                  {link.label}
                </MuiLink>
              ))}
            </Box>
          </Grid>

          {/* Social + Contact */}
          <Grid item xs={6} sm={3} md={3}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 700 }}>
              Follow Us
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              <MuiLink
                href="https://www.youtube.com/@neramclasses"
                target="_blank"
                rel="noopener noreferrer"
                color="inherit"
                underline="hover"
                sx={linkStyle}
              >
                YouTube
              </MuiLink>
              <MuiLink
                href="https://www.instagram.com/neramclasses"
                target="_blank"
                rel="noopener noreferrer"
                color="inherit"
                underline="hover"
                sx={linkStyle}
              >
                Instagram
              </MuiLink>
              <MuiLink
                href="https://www.facebook.com/neramclasses"
                target="_blank"
                rel="noopener noreferrer"
                color="inherit"
                underline="hover"
                sx={linkStyle}
              >
                Facebook
              </MuiLink>
            </Box>

            <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 3 }}>
              Free Demo Class
            </Typography>
            <MuiLink
              component={Link}
              href={getLocalizedPath('/demo-class')}
              color="inherit"
              underline="hover"
              sx={{ ...linkStyle, fontWeight: 600 }}
            >
              Book Now
            </MuiLink>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4, bgcolor: 'rgba(232,160,32,0.15)' }} />

        {/* Bottom Section */}
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              &copy; {new Date().getFullYear()} Neram Classes. All rights reserved.
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
                justifyContent: { xs: 'flex-start', md: 'flex-end' },
              }}
            >
              {footerLinks.legal.map((link) => (
                <MuiLink
                  key={link.href}
                  component={Link}
                  href={getLocalizedPath(link.href)}
                  color="inherit"
                  underline="hover"
                  variant="body2"
                  sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}
                >
                  {link.label}
                </MuiLink>
              ))}
            </Box>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
