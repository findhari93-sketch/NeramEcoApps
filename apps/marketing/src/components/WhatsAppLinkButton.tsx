'use client';

/**
 * A WhatsApp button that opens a chat with the city and page code pre-filled
 * and logs a first-party `whatsapp_clicked` event (user_funnel_events).
 */
import type { SxProps, Theme } from '@mui/material/styles';
import { Button } from '@neram/ui';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { buildWhatsAppLink, type WhatsAppLinkInput } from '@/lib/whatsapp';
import { trackWhatsAppClick } from '@/lib/whatsapp-track';

export interface WhatsAppLinkButtonProps extends WhatsAppLinkInput {
  label?: string;
  variant?: 'contained' | 'outlined' | 'text';
  sx?: SxProps<Theme>;
}

export function WhatsAppLinkButton({ label = 'WhatsApp us', variant = 'contained', sx, ...link }: WhatsAppLinkButtonProps) {
  const { href, pageCode } = buildWhatsAppLink(link);
  return (
    <Button
      component="a"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
      startIcon={<WhatsAppIcon aria-hidden />}
      onClick={() => trackWhatsAppClick(pageCode, { location_slug: link.citySlug ?? null, language: link.lang ?? 'en', placement: 'button' })}
      sx={{ minHeight: 48, fontWeight: 600, ...(sx as object) }}
    >
      {label}
    </Button>
  );
}
