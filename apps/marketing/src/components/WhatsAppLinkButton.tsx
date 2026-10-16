'use client';

/**
 * A WhatsApp button that opens a chat with the city and page code pre-filled
 * and logs a first-party `whatsapp_clicked` event (user_funnel_events).
 * Styled like the design-system CtaButton; the icon is WhatsApp green on light
 * surfaces only where it sits on white (the text link variant).
 */
import type { SxProps, Theme } from '@mui/material/styles';
import { Box } from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { buildWhatsAppLink, type WhatsAppLinkInput } from '@/lib/whatsapp';
import { trackWhatsAppClick } from '@/lib/whatsapp-track';
import { tokens as t, v } from '@/design-system';

export interface WhatsAppLinkButtonProps extends WhatsAppLinkInput {
  label?: string;
  /** contained: gold primary. outlined: 1px outline (reads the dark/light surface). text: an inline link row. */
  variant?: 'contained' | 'outlined' | 'text';
  sx?: SxProps<Theme>;
}

const VARIANT_SX = {
  contained: { bgcolor: t.gold500, color: t.navy900, border: '1px solid transparent', fontWeight: 700, '&:hover': { bgcolor: t.gold300, color: t.navy900 } },
  outlined: {
    bgcolor: 'transparent',
    color: v.fg,
    border: `1px solid ${v.outline}`,
    fontWeight: 600,
    '&:hover': { bgcolor: v.outlineHoverBg, color: v.outlineHoverFg, borderColor: v.outlineHoverBorder },
  },
  text: { bgcolor: 'transparent', color: v.fg, border: 0, px: 0, fontWeight: 600, '& svg': { color: t.success }, '&:hover': { color: v.fg, textDecoration: 'underline' } },
} as const;

export function WhatsAppLinkButton({ label = 'WhatsApp us', variant = 'contained', sx, ...link }: WhatsAppLinkButtonProps) {
  const { href, pageCode } = buildWhatsAppLink(link);
  return (
    <Box
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick(pageCode, { location_slug: link.citySlug ?? null, language: link.lang ?? 'en', placement: 'button' })}
      sx={[
        {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: variant === 'text' ? 'flex-start' : 'center',
          gap: 1,
          minHeight: variant === 'text' ? 44 : 48,
          px: 2.25,
          boxSizing: 'border-box',
          borderRadius: `${t.radius}px`,
          fontSize: '0.9375rem',
          lineHeight: 1.25,
          textDecoration: 'none',
          cursor: 'pointer',
          transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
          '& svg': { fontSize: 20, flexShrink: 0 },
          '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
          ...VARIANT_SX[variant],
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <WhatsAppIcon aria-hidden />
      {label}
    </Box>
  );
}
