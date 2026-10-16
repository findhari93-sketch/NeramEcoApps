'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import { Box, type SxProps, type Theme } from '@neram/ui';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import { Link } from '@/i18n/routing';
import { tokens as t, v } from './tokens';

export type CtaVariant = 'primary' | 'outline' | 'link' | 'navy' | 'success';

export interface CtaButtonProps {
  /**
   * primary: gold fill, the one main action per view.
   * outline: 1px border; fills navy on hover (light) or turns gold (dark).
   * navy: solid navy fill (secondary action on light, like "Try Our Free App").
   * link: text with a 1px bottom border.
   * success: green fill, only for enrolment status ("Go to App").
   */
  variant?: CtaVariant;
  href?: string;
  /** Opens in a new tab with a north_east arrow (other subdomains, PDFs). */
  external?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Leading icon. */
  startIcon?: ReactNode;
  /** Trailing icon; defaults to arrow_forward (north_east when external). Pass null to hide. */
  endIcon?: ReactNode | null;
  /** Full width with the label flush left and the arrow pushed to the edge. */
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  'aria-label'?: string;
  sx?: SxProps<Theme>;
  children: ReactNode;
}

const variantSx: Record<CtaVariant, object> = {
  primary: {
    bgcolor: t.gold500,
    color: t.navy900,
    border: '1px solid transparent',
    '&:hover': { bgcolor: t.gold300, color: t.navy900 },
  },
  navy: {
    bgcolor: t.navy900,
    color: t.paper,
    border: '1px solid transparent',
    '&:hover': { bgcolor: t.navy700, color: t.paper },
  },
  success: {
    bgcolor: t.success,
    color: t.surface,
    border: '1px solid transparent',
    '&:hover': { bgcolor: t.success, color: t.surface, filter: 'brightness(0.88)' },
  },
  outline: {
    bgcolor: 'transparent',
    color: v.fg,
    border: `1px solid ${v.outline}`,
    '&:hover': { bgcolor: v.outlineHoverBg, color: v.outlineHoverFg, borderColor: v.outlineHoverBorder },
  },
  link: {
    bgcolor: 'transparent',
    color: v.fg,
    border: 0,
    borderBottom: `1px solid ${v.linkLine}`,
    borderRadius: 0,
    px: 0.5,
    '&:hover': { color: v.outlineHoverFg, borderBottomColor: t.gold500 },
  },
};

/**
 * The site's call-to-action. Gold fill is for the primary action only.
 * Renders a locale-aware Link for internal hrefs, an <a> for external ones,
 * and a <button> without an href.
 */
export default function CtaButton({
  variant = 'primary',
  href,
  external = false,
  onClick,
  type = 'button',
  disabled,
  startIcon,
  endIcon,
  fullWidth = false,
  size = 'lg',
  sx,
  children,
  ...rest
}: CtaButtonProps) {
  const trailing =
    endIcon === null ? null : endIcon ?? (external ? <NorthEastIcon aria-hidden /> : variant === 'link' ? null : <ArrowForwardIcon aria-hidden />);

  // In-page anchors, phone and mail links are plain <a>; other paths go through the locale-aware Link.
  const plainAnchor = href ? /^(#|tel:|mailto:)/.test(href) : false;
  const linkProps = href
    ? external
      ? { component: 'a' as const, href, target: '_blank', rel: 'noopener noreferrer' }
      : plainAnchor
        ? { component: 'a' as const, href }
        : { component: Link, href }
    : { component: 'button' as const, type, disabled };

  return (
    <Box
      {...linkProps}
      onClick={onClick}
      aria-label={rest['aria-label']}
      sx={[
        {
          display: fullWidth ? 'flex' : 'inline-flex',
          width: fullWidth ? '100%' : 'auto',
          alignItems: 'center',
          // Full width: label flush left, arrow pushed to the edge (or icon + label left when there is no arrow).
          justifyContent: fullWidth ? (trailing ? 'space-between' : 'flex-start') : 'center',
          gap: 1.25,
          minHeight: size === 'lg' ? 48 : 44,
          px: size === 'lg' ? 2.75 : 2,
          py: size === 'lg' ? 1.75 : 1.25,
          boxSizing: 'border-box',
          borderRadius: `${t.radius}px`,
          font: 'inherit',
          fontSize: size === 'lg' ? '1rem' : '0.9375rem',
          fontWeight: variant === 'link' || variant === 'outline' ? 600 : 700,
          lineHeight: 1.25,
          textAlign: 'left',
          textDecoration: 'none',
          cursor: 'pointer',
          transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
          '& svg': { fontSize: 20, flexShrink: 0 },
          '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
          '&[disabled]': { opacity: 0.5, cursor: 'not-allowed' },
          ...variantSx[variant],
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {startIcon}
      <span>{children}</span>
      {trailing}
    </Box>
  );
}
