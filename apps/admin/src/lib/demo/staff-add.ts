/**
 * Choices for "Add demo" on the request desk (staff add a demo for someone who
 * reached us outside the website). Channel ids are the marketing site's
 * attribution channels, so Leads by channel and the desk read them the same way.
 */
import { CHANNEL_LABELS } from '@/lib/lead-channels';

/** page_code on staff-added rows: the desk shows "Added by staff". */
export const STAFF_DEMO_PAGE_CODE = 'DC-ADM';

const CHANNEL_IDS = [
  'whatsapp',
  'google_organic',
  'google_business',
  'google_ads',
  'meta_ads',
  'youtube',
  'ai_chatgpt',
  'referral',
  'direct',
  'other',
] as const;

const LABEL_OVERRIDES: Record<string, string> = {
  whatsapp: 'WhatsApp to the office',
  ai_chatgpt: 'ChatGPT or another AI',
  direct: 'Phone call or walk-in',
  referral: 'Referral or another website',
  other: 'Other',
};

export const STAFF_DEMO_CHANNELS: Array<{ id: string; label: string }> = CHANNEL_IDS.map((id) => ({
  id,
  label: LABEL_OVERRIDES[id] ?? CHANNEL_LABELS[id] ?? id,
}));

/** Who took a demo held outside the desk, unless staff pick someone else. */
export const DEFAULT_HELD_TUTOR = { upn: 'haribabu@neramclasses.com', name: 'Haribabu' } as const;

/**
 * The "Who took it" choices: the demo team from Demo settings, plus Haribabu
 * even when he is not in the team list. Haribabu is the default.
 */
export function heldTutorOptions(hosts: Array<{ upn: string; name: string }>): Array<{ upn: string; name: string }> {
  const list = hosts.map((h) => ({ upn: h.upn.toLowerCase(), name: h.name }));
  return list.some((h) => h.upn === DEFAULT_HELD_TUTOR.upn) ? list : [{ ...DEFAULT_HELD_TUTOR }, ...list];
}

export const STAFF_DEMO_PLATFORMS = [
  { id: 'google_meet', label: 'Google Meet' },
  { id: 'teams', label: 'Microsoft Teams' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'phone', label: 'Phone or WhatsApp call' },
  { id: 'in_person', label: 'In person' },
] as const;
