'use client';

import { Box, Typography, Stack } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import Image from 'next/image';
import Link from 'next/link';

const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';

const FOOTER_LINKS = [
  { label: 'About', href: `${MARKETING_URL}/en/about` },
  { label: 'Courses', href: `${MARKETING_URL}/en/courses` },
  { label: 'Contact', href: `${MARKETING_URL}/en/contact` },
  { label: 'Privacy Policy', href: `${MARKETING_URL}/en/legal/privacy-policy` },
  { label: 'Terms', href: `${MARKETING_URL}/en/legal/terms-of-service` },
];

const SOCIAL_LINKS = [
  { label: 'YouTube', href: 'https://www.youtube.com/@neramclasses' },
  { label: 'Instagram', href: 'https://www.instagram.com/neramclasses' },
  { label: 'Facebook', href: 'https://www.facebook.com/neramclasses' },
];

export default function LandingFooter() {
  return (
    <Box
      component="footer"
      sx={{
        bgcolor: neramTokens.navy[950],
        borderTop: `1px solid ${neramTokens.navy[600]}30`,
        py: { xs: 5, md: 6 },
        px: { xs: 2, md: 4 },
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'center', md: 'flex-start' },
            gap: 4,
            mb: 4,
          }}
        >
          {/* Logo + tagline */}
          <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'center', md: 'flex-start' }, mb: 0.5 }}>
              <Image
                src="/aiArchitect_logo.svg"
                alt="aiArchitek logo"
                width={36}
                height={36}
                style={{ borderRadius: '50%' }}
              />
              <Typography
                sx={{
                  fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif',
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: neramTokens.cream[100],
                }}
              >
                ai
                <Box component="span" sx={{ color: neramTokens.gold[500] }}>
                  Architek
                </Box>
              </Typography>
            </Box>
            <Typography
              sx={{
                fontSize: '0.8rem',
                color: neramTokens.cream[300],
              }}
            >
              by Neram Classes
            </Typography>
          </Box>

          {/* Navigation links */}
          <Stack
            direction="row"
            spacing={{ xs: 2, md: 3 }}
            flexWrap="wrap"
            justifyContent="center"
          >
            {FOOTER_LINKS.map((link) => (
              <Typography
                key={link.label}
                component="a"
                href={link.href}
                target={link.href.startsWith('http') ? '_blank' : undefined}
                rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                sx={{
                  fontSize: '0.8rem',
                  color: neramTokens.cream[300],
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                  '&:hover': { color: neramTokens.gold[500] },
                }}
              >
                {link.label}
              </Typography>
            ))}
          </Stack>

          {/* Social links */}
          <Stack direction="row" spacing={2}>
            {SOCIAL_LINKS.map((link) => (
              <Typography
                key={link.label}
                component="a"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  fontSize: '0.8rem',
                  color: neramTokens.cream[300],
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                  '&:hover': { color: neramTokens.gold[500] },
                }}
              >
                {link.label}
              </Typography>
            ))}
          </Stack>
        </Box>

        {/* Bottom bar */}
        <Box
          sx={{
            borderTop: `1px solid ${neramTokens.navy[600]}30`,
            pt: 3,
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              fontSize: '0.75rem',
              color: `${neramTokens.cream[300]}80`,
            }}
          >
            &copy; {new Date().getFullYear()} Neram Classes. All rights reserved. Built by IIT/NIT Alumni.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
