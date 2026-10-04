/**
 * Browser-only: log a first-party `whatsapp_clicked` event (user_funnel_events).
 * Kept out of whatsapp.ts so the link builder stays usable on the server.
 */
import { trackFunnelEvent } from '@/lib/funnel-tracker';
import { currentChannel } from '@/lib/attribution';

export function trackWhatsAppClick(pageCode: string, extra: { location_slug?: string | null; language?: string; placement?: string } = {}) {
  trackFunnelEvent({
    funnel: 'marketing',
    event: 'whatsapp_clicked',
    status: 'completed',
    metadata: { page_code: pageCode, location_slug: extra.location_slug ?? null, language: extra.language ?? 'en', placement: extra.placement ?? null, channel: currentChannel() },
    page_url: typeof window !== 'undefined' ? window.location.pathname : undefined,
  });
}
