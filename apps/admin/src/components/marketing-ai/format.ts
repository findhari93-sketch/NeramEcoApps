/**
 * Labels and number formatting for the Marketing Intelligence screens.
 * All user-facing copy for statuses, categories and intents lives here so the
 * five pages say the same thing the same way.
 */
import type { Tone } from '@/components/ops/OpsUi';

export const inr = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: dp, minimumFractionDigits: dp })}`;

export const num = (n: number | null | undefined, dp = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toLocaleString('en-IN', { maximumFractionDigits: dp });

export const pct = (n: number | null | undefined, dp = 1) => (n === null || n === undefined ? 'n/a' : `${n.toFixed(dp)}%`);

export function when(iso: string | null | undefined) {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

export const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const CATEGORY_LABEL: Record<string, string> = {
  add_negative: 'Block search',
  pause_keyword: 'Pause keyword',
  budget_cut: 'Budget cut',
  budget_raise: 'Budget raise',
  bid_cut: 'Bid cut',
  bid_raise: 'Bid raise',
  add_keyword: 'New keyword',
  new_ad: 'New ad',
  pause_ad: 'Pause ad',
  ad_schedule: 'Ad hours',
  location: 'Areas',
  device_bid: 'Device bids',
  alert: 'Alert',
  insight: 'Insight',
};

export const EXECUTABLE = ['add_negative', 'pause_keyword', 'budget_cut', 'budget_raise', 'bid_cut', 'bid_raise', 'add_keyword', 'new_ad', 'pause_ad'];

export const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  pending_approval: { label: 'Needs approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'info' },
  executing: { label: 'Applying', tone: 'info' },
  executed: { label: 'Applied', tone: 'success' },
  failed: { label: 'Failed', tone: 'error' },
  rejected: { label: 'Rejected', tone: 'neutral' },
  measured: { label: 'Measured', tone: 'success' },
  expired: { label: 'Expired', tone: 'neutral' },
  detected: { label: 'Detected', tone: 'neutral' },
  recommended: { label: 'Recommended', tone: 'neutral' },
};

export const PRIORITY_TONE: Record<string, Tone> = { critical: 'error', high: 'warning', medium: 'info', low: 'neutral' };

export const INTENT_LABEL: Record<string, { label: string; tone: Tone }> = {
  high_intent: { label: 'Wants coaching', tone: 'success' },
  research: { label: 'Researching', tone: 'info' },
  free_seeker: { label: 'Wants free', tone: 'warning' },
  job_seeker: { label: 'Job seeker', tone: 'error' },
  other_exam: { label: 'Other exam', tone: 'error' },
  other_course: { label: 'Other course', tone: 'error' },
  competitor: { label: 'Competitor', tone: 'neutral' },
  unclear: { label: 'Unclear', tone: 'neutral' },
};

/** Describe a proposed change in one plain sentence. */
export function describeChange(change: any): string | null {
  if (!change) return null;
  switch (change.kind) {
    case 'add_negative':
      return `Add "${change.text}" as a ${change.match_type === 'EXACT' ? 'exact' : 'phrase'} match negative keyword on the campaign.`;
    case 'pause_keyword':
      return `Pause the keyword "${change.text}". It can be re-enabled with Undo.`;
    case 'budget_change':
      return `Change the daily budget from ${inr(change.from_micros / 1e6)} to ${inr(change.to_micros / 1e6)} (${change.pct > 0 ? '+' : ''}${change.pct}%).`;
    case 'keyword_bid':
      return `Change the max CPC of "${change.text}" from ${inr(change.from_micros / 1e6, 2)} to ${inr(change.to_micros / 1e6, 2)} (${change.pct > 0 ? '+' : ''}${change.pct}%). Undo sets it back.`;
    case 'device_bid':
      return `Set a ${change.suggested_modifier_pct}% bid adjustment for ${String(change.device).toLowerCase()} in Google Ads (by hand).`;
    case 'add_keyword':
      return `Add "${change.text}" as a ${change.match_type === 'EXACT' ? 'exact' : 'phrase'} match keyword in this ad group. Undo removes it.`;
    case 'new_ad':
      return 'Add the responsive search ad below to this ad group, beside the current ads. Google tests it against them. Undo pauses it.';
    case 'pause_ad':
      return `Pause the ad "${change.label}". The other ads in the group keep running. Undo turns it back on.`;
    case 'ad_schedule':
      return 'In Google Ads, open the campaign > Ad schedule and lower the bids for, or leave out, the times below (by hand).';
    case 'location':
      return `In Google Ads, open the campaign > Locations and exclude ${change.city} (by hand).`;
    default:
      return null;
  }
}

export async function api<T = any>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...(init?.body ? { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } } : init) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !(body && body.status === 'failed')) throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { status: res.status, body });
  return body as T;
}
