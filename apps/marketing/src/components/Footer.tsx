'use client';

import { useParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Grid,
  Link as MuiLink,
  Divider,
} from '@neram/ui';
import { Link } from '@neram/ui';
import { type Locale } from '@/i18n';

const footerLinks = {
  quickLinks: [
    { label: 'Home', href: '/' },
    { label: 'About Us', href: '/about' },
    { label: 'Courses', href: '/courses' },
    { label: 'Contact', href: '/contact' },
    { label: 'Apply Now', href: '/apply' },
  ],
  courses: [
    { label: 'NEET Preparation', href: '/courses/neet-preparation' },
    { label: 'JEE Main & Advanced', href: '/courses/jee-main-advanced' },
    { label: 'Foundation Course', href: '/courses/foundation-course' },
    { label: 'Board Exams', href: '/courses/class-11-12-boards' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms & Conditions', href: '/terms' },
    { label: 'Refund Policy', href: '/refund' },
    { label: 'Disclaimer', href: '/disclaimer' },
  ],
};

export default function Footer() {
  const params = useParams();
  const locale = params.locale as Locale;

  const getLocalizedPath = (path: string) => {
    return `/${locale}${path}`;
  };

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'primary.dark',
        color: 'primary.contrastText',
        pt: { xs: 6, md: 8 },
        pb: 3,
      }}
    >
      <Container maxWidth="lg">
        <Grid container spacing={4}>
          {/* About Section */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
              Neram Classes
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
              Empowering students with quality education and personalized guidance
              since 2009.
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Excellence in Education
            </Typography>
          </Grid>

          {/* Quick Links */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
              Quick Links
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {footerLinks.quickLinks.map((link) => (
                <MuiLink
                  key={link.href}
                  component={Link}
                  href={getLocalizedPath(link.href)}
                  color="inherit"
                  underline="hover"
                  sx={{ opacity: 0.9, '&:hover': { opacity: 1 } }}
                >
                  {link.label}
                </MuiLink>
              ))}
            </Box>
          </Grid>

          {/* Courses */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
              Popular Courses
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {footerLinks.courses.map((link) => (
                <MuiLink
                  key={link.href}
                  component={Link}
                  href={getLocalizedPath(link.href)}
                  color="inherit"
                  underline="hover"
                  sx={{ opacity: 0.9, '&:hover': { opacity: 1 } }}
                >
                  {link.label}
                </MuiLink>
              ))}
            </Box>
          </Grid>

          {/* Contact Info */}
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
              Contact Us
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                123 Education Street
                <br />
                Bangalore, Karnataka
                <br />
                India - 560001
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Phone: +91 80 1234 5678
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Email: info@neramclasses.com
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Divider sx={{ my: 4, bgcolor: 'rgba(255, 255, 255, 0.2)' }} />

        {/* Bottom Section */}
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              © {new Date().getFullYear()} Neram Classes. All rights reserved.
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

        {/* Social Media Links (Optional) */}
        <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Typography variant="body2" sx={{ opacity: 0.8 }}>
            Follow us:
          </Typography>
          <MuiLink href="#" color="inherit" sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}>
            Facebook
          </MuiLink>
          <MuiLink href="#" color="inherit" sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}>
            Twitter
          </MuiLink>
          <MuiLink href="#" color="inherit" sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}>
            Instagram
          </MuiLink>
          <MuiLink href="#" color="inherit" sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}>
            LinkedIn
          </MuiLink>
        </Box>
      </Container>
    </Box>
  );
}
