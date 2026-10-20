'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@neram/ui';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import { Link } from '@/i18n/routing';
import { Surface, StatStrip, CtaButton, tokens as t } from '@/design-system';
import { APP_URL } from '@/lib/seo/constants';
import ClockCanvas from './ClockCanvas';

const STATS = [
  { value: 'AIR 1', label: 'JEE B.Arch · 2024' },
  { value: '1,000+', label: 'Students' },
  { value: '189', label: 'NATA Score' },
  { value: '10+', label: 'Years' },
];

/**
 * Tool badges around the clock. Same /tools/* scheme as the Learning Tools cards.
 * Each one drifts on its own rhythm (staggered duration and delay) so the three
 * never bob in sync.
 */
const BADGES: Array<{ label: string; href: string; icon: ReactNode; pos: object; float: object }> = [
  {
    label: 'Cut Off Calculator',
    href: '/tools/cutoff-calculator',
    icon: <CalculateOutlinedIcon />,
    pos: { top: '8%', left: 0 },
    float: { animation: 'heroBadgeFloatA 6s ease-in-out infinite' },
  },
  {
    label: 'College Predictor',
    href: '/tools/college-predictor',
    icon: <SchoolOutlinedIcon />,
    pos: { top: '44%', right: 0 },
    float: { animation: 'heroBadgeFloatB 7s ease-in-out infinite', animationDelay: '-2s' },
  },
  {
    label: 'Question Bank',
    href: '/tools/question-bank',
    icon: <QuizOutlinedIcon />,
    pos: { bottom: '6%', left: '8%' },
    float: { animation: 'heroBadgeFloatA 8s ease-in-out infinite', animationDelay: '-4s' },
  },
];

const badgeFloatKeyframes = {
  '@keyframes heroBadgeFloatA': {
    '0%, 100%': { transform: 'translateY(0)' },
    '50%': { transform: 'translateY(-10px)' },
  },
  '@keyframes heroBadgeFloatB': {
    '0%, 100%': { transform: 'translate(0, 0)' },
    '50%': { transform: 'translate(-4px, -8px)' },
  },
} as const;

const MS_SQUARES = ['#f25022', '#7fba00', '#00a4ef', '#ffb900']; // Microsoft logo colours (brand mark, not theme)

const monoSmall = {
  fontFamily: t.fontMono,
  fontSize: '0.6875rem',
  letterSpacing: '0.1em',
  color: t.paperSubtle,
} as const;

/**
 * Home hero (PageHero tone="dark", variant home). The clock canvas is
 * unchanged; everything around it uses the design-system tokens. The h1 and
 * subhead are never faded in: they are the LCP text.
 */
export default function NewHeroSection() {
  return (
    <Surface tone="dark" blueprint component="section" aria-labelledby="home-hero-title">
      <Box
        sx={{
          maxWidth: t.container.page,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          pt: { xs: 6, md: 9 },
          pb: { xs: 8, md: 12 },
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: 5,
          alignItems: 'center',
          boxSizing: 'content-box',
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <Box
            component="p"
            sx={{
              m: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              width: 'fit-content',
              maxWidth: '100%',
              bgcolor: t.goldTintBg,
              border: `1px solid ${t.goldTintBorder}`,
              borderRadius: `${t.radiusPill}px`,
              py: 0.625,
              pl: 0.75,
              pr: 1.75,
            }}
          >
            <Box
              component="span"
              sx={{
                bgcolor: t.gold500,
                color: t.navy900,
                fontFamily: t.fontMono,
                fontSize: '0.6875rem',
                fontWeight: 700,
                px: 1,
                py: 0.375,
                borderRadius: `${t.radiusPill}px`,
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}
            >
              NEW
            </Box>
            <Box component="span" sx={{ fontSize: '0.8125rem', fontWeight: 500, color: t.gold300 }}>
              India&apos;s First AI-Enabled NATA Learning Platform
            </Box>
          </Box>

          <Typography
            component="p"
            sx={{ m: 0, fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: t.paperSubtle }}
          >
            நேரம் கிளாஸஸ் · Neram = Time · Est. 2009
          </Typography>

          <Typography
            id="home-hero-title"
            variant="h1"
            component="h1"
            sx={{
              m: 0,
              color: t.paper,
              '& em': { fontStyle: 'italic', color: t.gold500 },
              '& .ai-word': { borderBottom: `3px solid ${t.gold500}` },
            }}
          >
            Your Time to Crack <em>NATA &amp; JEE Paper 2</em> with <span className="ai-word">AI</span>
          </Typography>

          <Typography
            component="p"
            sx={{
              m: 0,
              maxWidth: 480,
              fontSize: '1.0625rem',
              lineHeight: 1.55,
              color: t.paperMuted,
              textWrap: 'pretty',
              '& strong': { color: t.paper, fontWeight: 600 },
            }}
          >
            Live classes. Intelligent tools. Real results. <strong>Nexus</strong>, an AI-powered NATA prep
            companion trusted by AIR toppers across JEE Paper 2 &amp; NATA nationwide in India.
          </Typography>

          <StatStrip size="compact" items={STATS} />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mt: 0.5 }}>
            <CtaButton href={`${APP_URL}/tools`}>Explore aiArchitek Free Tool</CtaButton>
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.8125rem', color: t.paperSubtle }}>
              <Box component="span" aria-hidden sx={{ display: 'grid', gridTemplateColumns: '7px 7px', gap: '2px' }}>
                {MS_SQUARES.map((c) => (
                  <Box key={c} component="span" sx={{ width: 7, height: 7, bgcolor: c }} />
                ))}
              </Box>
              Supported by <Box component="strong" sx={{ color: t.paper, fontWeight: 500 }}>Microsoft Education</Box>
            </Box>
          </Box>
        </Box>

        <Box sx={{ position: 'relative', minWidth: 0, minHeight: { xs: 320, sm: 380 }, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ width: 'min(100%, 460px)' }}>
            <ClockCanvas />
          </Box>
          {BADGES.map((b) => (
            <Box
              key={b.href}
              component={Link}
              href={b.href}
              sx={{
                position: 'absolute',
                ...b.pos,
                ...badgeFloatKeyframes,
                ...b.float,
                willChange: 'transform',
                // Hold still while pointed at or focused, so the click target does not move.
                '&:hover, &:focus-visible': { animationPlayState: 'paused' },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                minHeight: 44,
                boxSizing: 'border-box',
                bgcolor: t.navy800,
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: `${t.radius}px`,
                px: 1.75,
                py: 1.25,
                color: t.paper,
                fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                fontWeight: 500,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'border-color 150ms ease',
                '& svg': { fontSize: 20, color: t.gold500 },
                '&:hover': { borderColor: 'rgba(232,160,32,0.5)' },
                '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
              }}
            >
              {b.icon}
              {b.label}
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          px: 3,
          py: 2,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          ...monoSmall,
        }}
      >
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box component="span" aria-hidden sx={{ width: 40, height: '1px', bgcolor: 'rgba(255,255,255,0.2)' }} />
          SCROLL TO EXPLORE
        </Box>
        <Box component="span">
          <Box component="span" sx={{ color: t.gold500 }}>
            neramclasses.com
          </Box>{' '}
          · NATA · JEE Paper 2 · B.Arch
        </Box>
      </Box>
    </Surface>
  );
}
