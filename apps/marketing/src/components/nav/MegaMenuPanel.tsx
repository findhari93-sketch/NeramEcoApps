'use client';

import type { ComponentType, ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckIcon from '@mui/icons-material/Check';
import { Link } from '@/i18n/routing';

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

export type NavTone = 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'error';

export interface NavCard {
  label: string;
  hint: string;
  href: string;
  Icon: ComponentType<SvgIconProps>;
  tone: NavTone;
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

const headingSx = {
  m: 0,
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'text.secondary',
} as const;

const focusRing = { outline: '2px solid', outlineColor: 'primary.main' } as const;

/** Small "NEW" / "TOP" pill. Dark text on amber keeps it well above 4.5:1. */
export function NavBadge({ label }: { label: string }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 18,
        px: 0.75,
        borderRadius: 999,
        bgcolor: 'secondary.light',
        color: 'text.primary',
        fontSize: '0.68rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {label}
    </Box>
  );
}

function CardLink({ card, onNavigate }: { card: NavCard; onNavigate: () => void }) {
  const { href, label, hint, Icon, tone, badge } = card;
  return (
    <Box
      component={Link}
      href={href as any}
      onClick={onNavigate}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 52,
        px: 1.5,
        py: 0.75,
        borderRadius: 2,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
        textDecoration: 'none',
        transition: 'border-color 150ms ease-out',
        '&:hover': { borderColor: 'primary.main' },
        '&:focus-visible': { ...focusRing, outlineOffset: 2 },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 32,
          height: 32,
          flex: '0 0 32px',
          borderRadius: 1,
          bgcolor: (t) => alpha(t.palette[tone].main, 0.12),
          color: `${tone}.dark`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon sx={{ fontSize: 18 }} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.92rem', fontWeight: 700 }}>
          {label}
          {badge && <NavBadge label={badge} />}
        </Box>
        <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{hint}</Box>
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

/** Desktop header menu. One design for every group, taken from the Colleges menu. */
export default function MegaMenuPanel({ label, top, columns = [], aside, footer, variant = 'columns', pathname, onNavigate }: Props) {
  if (variant === 'cards') {
    return (
      <Box component="section" aria-label={`${label} menu`} sx={{ width: 'min(380px, 94vw)' }}>
        {aside && (
          <Box component="nav" aria-label={aside.title} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 2.5, bgcolor: 'action.hover' }}>
            <Typography component="h2" sx={{ ...headingSx, mb: 1 }}>{aside.title}</Typography>
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
    <Box component="section" aria-label={`${label} menu`} sx={{ width: wide ? 'min(1320px, 94vw)' : 'min(1100px, 94vw)' }}>
      {top}

      <Box sx={{ display: 'grid', gridTemplateColumns: grid }}>
        {columns.map((col, i) => {
          const last = i === n - 1;
          // Width only: a responsive `border-right` shorthand would reset the colour.
          const borderRightWidth = !last ? 1 : aside ? (wide ? { xs: 0, lg: 1 } : 1) : 0;
          return (
            <Box component="nav" key={col.title} aria-label={col.title} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, px: 2, py: 2.5, borderRightStyle: 'solid', borderRightWidth, borderColor: 'divider', minWidth: 0 }}>
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
                      borderRadius: 1.5,
                      bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.1) : 'transparent'),
                      color: on ? 'primary.dark' : 'text.primary',
                      fontSize: '0.94rem',
                      fontWeight: on ? 700 : 500,
                      textDecoration: 'none',
                      transition: 'background-color 150ms ease-out',
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:focus-visible': { ...focusRing, outlineOffset: -2 },
                    }}
                  >
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                      {l.label}
                      {l.badge && <NavBadge label={l.badge} />}
                    </Box>
                    {on && <CheckIcon aria-hidden sx={{ fontSize: 16 }} />}
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
                    gap: 0.75,
                    minHeight: 44,
                    mt: 0.75,
                    px: 1.5,
                    borderRadius: 1.5,
                    color: 'primary.dark',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    '&:hover': { bgcolor: 'action.hover' },
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
              gap: 0.75,
              px: 2.5,
              py: 2.5,
              bgcolor: 'action.hover',
              ...(wide && { gridColumn: { xs: '1 / -1', lg: 'auto' }, borderTopStyle: 'solid', borderTopWidth: { xs: 1, lg: 0 }, borderColor: 'divider' }),
            }}
          >
            <Typography component="h2" sx={{ ...headingSx, mb: 1 }}>{aside.title}</Typography>
            <Box
              sx={{
                display: 'grid',
                gap: 0.75,
                gridTemplateColumns: wide ? { xs: 'repeat(auto-fill, minmax(230px, 1fr))', lg: '1fr' } : '1fr',
              }}
            >
              {aside.cards.map((card) => <CardLink key={card.href} card={card} onNavigate={onNavigate} />)}
            </Box>
          </Box>
        )}
      </Box>

      {footer && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 20px', px: 3.5, py: 1.75, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Typography sx={{ m: 0, fontSize: '0.9rem', color: 'text.secondary' }}>
            <Box component="b" sx={{ color: 'text.primary' }}>{footer.lead}</Box>, {footer.text}
          </Typography>
          <Box
            component={Link}
            href={footer.cta.href as any}
            onClick={onNavigate}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              minHeight: 44,
              px: 1,
              borderRadius: 1.5,
              fontSize: '0.92rem',
              fontWeight: 700,
              color: 'primary.dark',
              textDecoration: 'none',
              '&:hover': { bgcolor: 'action.hover' },
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
