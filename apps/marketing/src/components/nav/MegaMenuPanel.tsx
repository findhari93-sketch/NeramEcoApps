'use client';

import type { ComponentType, ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import { Link } from '@/i18n/routing';
import { tokens as t, indicLabelSx } from '@/design-system';

// ─── Shape of a header menu ─────────────────────────────────────────────────

export interface NavLink {
  label: string;
  href: string;
  badge?: string;
}

export interface NavColumn {
  title: string;
  links: NavLink[];
  /** "All ..." link shown last, with an arrow. */
  more?: NavLink;
  /** Shown beside the column heading (and on its `more` link in the phone drawer). */
  badge?: string;
}

/** Kept for the data in NAV_GROUPS; every card now renders as a navy tile with a gold glyph. */
export type NavTone = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error';

export interface NavCard {
  label: string;
  hint: string;
  href: string;
  Icon: ComponentType<SvgIconProps>;
  tone?: NavTone;
  badge?: string;
}

export interface NavAside {
  title: string;
  cards: NavCard[];
}

export interface NavFooter {
  lead: string;
  text: string;
  cta: NavLink;
}

/** True when `href` is the page being viewed. Anchors and filtered links never count. */
export function isCurrent(pathname: string, href: string) {
  if (/[?#]/.test(href)) return false;
  return pathname === href || pathname.replace(/^\/[a-z]{2}(?=\/)/, '') === href;
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

/** Mono eyebrow over each column: gold800 on white (5.9:1). */
const headingSx = {
  m: 0,
  fontFamily: t.fontMono,
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.15em',
  lineHeight: 1.4,
  textTransform: 'uppercase',
  color: t.gold800,
  ...indicLabelSx,
} as const;

const focusRing = { outline: t.focusOutline } as const;

/** Small "NEW" / "TOP" pill: navy text on gold500 (8.6:1). */
export function NavBadge({ label }: { label: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        px: 0.75,
        borderRadius: `${t.radiusPill}px`,
        bgcolor: t.gold500,
        color: t.navy900,
        fontFamily: t.fontMono,
        fontSize: '0.66rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {label}
    </Box>
  );
}

function CardLink({ card, onNavigate }: { card: NavCard; onNavigate: () => void }) {
  const { href, label, hint, Icon, badge } = card;
  return (
    <Box
      component={Link}
      href={href as any}
      onClick={onNavigate}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        minHeight: 56,
        p: 1.25,
        boxSizing: 'border-box',
        borderRadius: `${t.radius}px`,
        border: '1px solid transparent',
        color: t.ink,
        textDecoration: 'none',
        transition: 'background-color 150ms ease-out, border-color 150ms ease-out',
        '&:hover': { bgcolor: t.surface, borderColor: t.line },
        '&:focus-visible': { ...focusRing, outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 36,
          height: 36,
          flex: '0 0 36px',
          borderRadius: `${t.radius}px`,
          bgcolor: t.navy900,
          color: t.gold500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon sx={{ fontSize: 20 }} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', fontWeight: 700 }}>
          {label}
          {badge && <NavBadge label={badge} />}
        </Box>
        <Box component="span" sx={{ fontSize: '0.8125rem', color: t.inkMuted }}>{hint}</Box>
      </Box>
    </Box>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

interface Props {
  /** Group name; the panel is announced as "{label} menu". */
  label: string;
  /** Optional row above the columns (the Colleges search). */
  top?: ReactNode;
  columns?: NavColumn[];
  aside?: NavAside;
  footer?: NavFooter;
  /** 'cards': a single column of icon cards (About). */
  variant?: 'columns' | 'cards';
  pathname: string;
  onNavigate: () => void;
}

/**
 * Desktop header menu (design handoff, "Mega menu"): white, link columns with
 * gold800 mono eyebrows, a #FAFBFC aside of navy-tile tool cards and a footer
 * row. The outer Paper (border, radius, shadow) is drawn by the header.
 */
export default function MegaMenuPanel({ label, top, columns = [], aside, footer, variant = 'columns', pathname, onNavigate }: Props) {
  if (variant === 'cards') {
    return (
      <Box component="section" aria-label={`${label} menu`} sx={{ width: 'min(380px, 94vw)' }}>
        {aside && (
          <Box component="nav" aria-label={aside.title} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 2.5, bgcolor: t.ground }}>
            <Typography component="h2" sx={{ ...headingSx, color: t.inkMuted, mb: 1 }}>{aside.title}</Typography>
            {aside.cards.map((card) => <CardLink key={card.href} card={card} onNavigate={onNavigate} />)}
          </Box>
        )}
      </Box>
    );
  }

  const n = columns.length;
  // Four link columns plus the side panel only fit side by side from lg; below
  // that the side panel becomes a full-width row under the columns.
  const wide = n >= 4;
  const grid = aside
    ? wide
      ? { xs: `repeat(${n}, minmax(0, 1fr))`, lg: `repeat(${n}, minmax(0, 1fr)) 280px` }
      : `repeat(${n}, minmax(0, 1fr)) 264px`
    : `repeat(${n}, minmax(0, 1fr))`;

  return (
    <Box component="section" aria-label={`${label} menu`} sx={{ width: wide ? 'min(1320px, 94vw)' : 'min(1100px, 94vw)', bgcolor: t.surface, color: t.ink }}>
      {top}

      <Box sx={{ display: 'grid', gridTemplateColumns: grid }}>
        {columns.map((col, i) => {
          const last = i === n - 1;
          // Width only: a responsive `border-right` shorthand would reset the colour.
          const borderRightWidth = !last ? 1 : aside ? (wide ? { xs: 0, lg: 1 } : 1) : 0;
          return (
            <Box component="nav" key={col.title} aria-label={col.title} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, px: 2, py: 2.5, borderRightStyle: 'solid', borderRightWidth, borderColor: t.line, minWidth: 0 }}>
              <Typography component="h2" sx={{ ...headingSx, mb: 1, mx: 1.5, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {col.title}
                {col.badge && <NavBadge label={col.badge} />}
              </Typography>
              {col.links.map((l) => {
                const on = isCurrent(pathname, l.href);
                return (
                  <Box
                    key={l.href + l.label}
                    component={Link}
                    href={l.href as any}
                    onClick={onNavigate}
                    aria-current={on ? 'page' : undefined}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      minHeight: 44,
                      px: 1.5,
                      borderRadius: `${t.radius}px`,
                      bgcolor: on ? t.surfaceHover : 'transparent',
                      color: t.ink,
                      fontSize: '0.9375rem',
                      fontWeight: on ? 700 : 500,
                      textDecoration: 'none',
                      transition: 'background-color 150ms ease-out',
                      '&:hover': { bgcolor: t.surfaceHover },
                      '&:focus-visible': { ...focusRing, outlineOffset: -2 },
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                    }}
                  >
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      {l.label}
                      {l.badge && <NavBadge label={l.badge} />}
                    </Box>
                    {on && <CheckIcon aria-hidden sx={{ fontSize: 16, color: t.gold800 }} />}
                  </Box>
                );
              })}
              {col.more && (
                <Box
                  component={Link}
                  href={col.more.href as any}
                  onClick={onNavigate}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    minHeight: 44,
                    mt: 0.5,
                    px: 1.5,
                    borderRadius: `${t.radius}px`,
                    color: t.ink,
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    '&:hover': { bgcolor: t.surfaceHover },
                    '&:focus-visible': { ...focusRing, outlineOffset: -2 },
                  }}
                >
                  {col.more.label}
                  <ArrowForwardIcon aria-hidden sx={{ fontSize: 16 }} />
                </Box>
              )}
            </Box>
          );
        })}

        {aside && (
          <Box
            component="nav"
            aria-label={aside.title}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              px: 2.5,
              py: 2.5,
              bgcolor: t.ground,
              ...(wide && { gridColumn: { xs: '1 / -1', lg: 'auto' }, borderTopStyle: 'solid', borderTopWidth: { xs: 1, lg: 0 }, borderColor: t.line }),
            }}
          >
            <Typography component="h2" sx={{ ...headingSx, color: t.inkMuted, mb: 1 }}>{aside.title}</Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 0.5,
                gridTemplateColumns: wide ? { xs: 'repeat(auto-fill, minmax(230px, 1fr))', lg: '1fr' } : '1fr',
              }}
            >
              {aside.cards.map((card) => <CardLink key={card.href} card={card} onNavigate={onNavigate} />)}
            </Box>
          </Box>
        )}
      </Box>

      {footer && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 20px', px: 3, py: 1.25, borderTop: `1px solid ${t.line}` }}>
          <Typography sx={{ m: 0, fontSize: '0.875rem', color: t.inkMuted }}>
            <Box component="b" sx={{ color: t.ink }}>{footer.lead}</Box> {footer.text}
          </Typography>
          <Box
            component={Link}
            href={footer.cta.href as any}
            onClick={onNavigate}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              minHeight: 44,
              px: 1,
              borderRadius: `${t.radius}px`,
              fontSize: '0.875rem',
              fontWeight: 700,
              color: t.ink,
              textDecoration: 'none',
              '&:hover': { bgcolor: t.surfaceHover },
              '&:focus-visible': { ...focusRing, outlineOffset: 2 },
            }}
          >
            {footer.cta.label}
            <ArrowForwardIcon aria-hidden sx={{ fontSize: 16 }} />
          </Box>
        </Box>
      )}
    </Box>
  );
}
