import type { CollegeTier } from '@/lib/college-hub/types';

/** What the college did with an enquiry. The older values stay readable. */
export const LEAD_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'visited', label: 'Visited campus' },
  { value: 'admitted', label: 'Took admission' },
  { value: 'not_interested', label: 'Not interested' },
] as const;

const LEGACY: Record<string, string> = { qualified: 'Contacted', converted: 'Took admission', dropped: 'Not interested' };

export function leadStatusLabel(value: string): string {
  return LEAD_STATUSES.find((s) => s.value === value)?.label ?? LEGACY[value] ?? value;
}

/** Full phone numbers from Gold up; lower tiers see a masked number. */
export function showsFullPhone(tier: CollegeTier): boolean {
  return tier === 'gold' || tier === 'platinum';
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return phone.slice(0, 2) + 'X'.repeat(phone.length - 4) + phone.slice(-2);
}
