'use client';

import { Box, AppBar, Toolbar, Typography, Button, Container, useScrollDirection } from '@neram/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const toolLinks = [
  { title: 'Cutoff Calculator', href: '/tools/nata/cutoff-calculator' },
  { title: 'College Predictor', href: '/tools/nata/college-predictor' },
  { title: 'Exam Centers', href: '/tools/nata/exam-centers' },
  { title: 'Question Bank', href: '/tools/nata/question-bank' },
  { title: 'Eligibility', href: '/tools/nata/eligibility-checker' },
  { title: 'Cost Calculator', href: '/tools/nata/cost-calculator' },
  { title: 'Image Crop', href: '/tools/nata/image-crop' },
  { title: 'Help', href: '/tools/help' },
];

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { scrollDirection, isAtTop } = useScrollDirection();
  const shouldHideNavbar = scrollDirection === 'down' && !isAtTop;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* App Bar */}
      <AppBar
        position="sticky"
        color="default"
        elevation={1}
        sx={{
          transform: shouldHideNavbar ? 'translateY(-100%)' : 'translateY(0)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            component={Link}
            href="/tools"
            sx={{
              fontWeight: 700,
              color: 'primary.main',
              textDecoration: 'none',
              mr: 4,
            }}
          >
            Neram Tools
          </Typography>

          {/* Desktop Navigation */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1, flexGrow: 1 }}>
            {toolLinks.map((link) => (
              <Button
                key={link.href}
                component={Link}
                href={link.href}
                color={pathname.startsWith(link.href) ? 'primary' : 'inherit'}
                variant={pathname.startsWith(link.href) ? 'contained' : 'text'}
                size="small"
              >
                {link.title}
              </Button>
            ))}
          </Box>

          {/* CTA */}
          <Button
            component={Link}
            href="https://neramclasses.com/courses/nata"
            variant="outlined"
            color="primary"
            size="small"
            sx={{ ml: 'auto' }}
          >
            Join NATA Course
          </Button>
        </Toolbar>

        {/* Mobile Navigation */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            overflowX: 'auto',
            px: 1,
            pb: 1,
            gap: 1,
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {toolLinks.map((link) => (
            <Button
              key={link.href}
              component={Link}
              href={link.href}
              color={pathname === link.href ? 'primary' : 'inherit'}
              variant={pathname === link.href ? 'contained' : 'text'}
              size="small"
              sx={{ whiteSpace: 'nowrap', minWidth: 'auto' }}
            >
              {link.title}
            </Button>
          ))}
        </Box>
      </AppBar>

      {/* Main Content */}
      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
        {children}
      </Container>

      {/* Footer CTA */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          py: 4,
          textAlign: 'center',
        }}
      >
        <Container maxWidth="md">
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Ready to ace NATA?
          </Typography>
          <Typography variant="body1" sx={{ mb: 3, opacity: 0.9 }}>
            Join Neram Classes for comprehensive NATA coaching with expert faculty
          </Typography>
          <Button
            component={Link}
            href="https://neramclasses.com/apply"
            variant="contained"
            color="secondary"
            size="large"
          >
            Apply Now - Get 10% Off
          </Button>
        </Container>
      </Box>
    </Box>
  );
}
