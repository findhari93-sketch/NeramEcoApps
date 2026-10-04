/**
 * "Leads by channel": where demo, callback, assistance and visit leads came
 * from (google_organic, ai_chatgpt, whatsapp ...) and which location page they
 * landed on. The marketing site stores channel, landing_page and page_code on
 * every lead (migration 20261029090000). Pure, so it is unit tested.
 */

export const LEAD_TABLES = {
  demo_class_registrations: 'Demo class',
  callback_requests: 'Callback',
  nata_assistance_requests: 'Study plan (city pages)',
  center_visit_bookings: 'Centre visit',
} as const;

export type LeadTable = keyof typeof LEAD_TABLES;

export const CHANNEL_LABELS: Record<string, string> = {
  google_business: 'Google Maps (business profile)',
  google_organic: 'Google search',
  bing_organic: 'Bing search',
  ai_chatgpt: 'ChatGPT',
  ai_perplexity: 'Perplexity',
  ai_claude: 'Claude',
  ai_gemini: 'Gemini',
  ai_copilot: 'Copilot',
  youtube: 'YouTube',
  google_ads: 'Google Ads',
  meta_ads: 'Meta ads',
  whatsapp: 'WhatsApp',
  direct: 'Direct',
  referral: 'Other websites',
  other: 'Other campaigns',
  unknown: 'Not recorded',
};

export interface LeadRow {
  table: LeadTable;
  channel: string | null;
  landing_page: string | null;
  page_code: string | null;
}

export interface ChannelReport {
  total: number;
  byChannel: Array<{ channel: string; label: string; total: number; byTable: Record<LeadTable, number> }>;
  byPage: Array<{ page: string; total: number; topChannel: string }>;
  aiShare: number;
}

const CITY_PAGE = /\/coaching\/(?:nata-coaching\/nata-coaching-centers-in-|jee-paper-2-coaching\/jee-paper-2-coaching-in-)([a-z0-9-]+)/;
const STATE_PAGE = /\/coaching\/(?:nata|jee-paper-2)-coaching-in-([a-z0-9-]+)/;

/** "/coaching/nata-coaching/nata-coaching-centers-in-madurai" -> "City: madurai". */
export function pageLabel(landing: string | null): string {
  if (!landing) return 'Not recorded';
  const city = landing.match(CITY_PAGE);
  if (city) return `City: ${city[1]}`;
  const state = landing.match(STATE_PAGE);
  if (state) return `State: ${state[1]}`;
  return landing.split(/[?#]/)[0] || '/';
}

const emptyByTable = (): Record<LeadTable, number> =>
  Object.fromEntries(Object.keys(LEAD_TABLES).map((t) => [t, 0])) as Record<LeadTable, number>;

export function buildChannelReport(rows: LeadRow[]): ChannelReport {
  const channels = new Map<string, Record<LeadTable, number>>();
  const pages = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const ch = r.channel || 'unknown';
    const byTable = channels.get(ch) ?? emptyByTable();
    byTable[r.table] += 1;
    channels.set(ch, byTable);
    const page = pageLabel(r.landing_page);
    const pc = pages.get(page) ?? new Map<string, number>();
    pc.set(ch, (pc.get(ch) ?? 0) + 1);
    pages.set(page, pc);
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const byChannel = [...channels.entries()]
    .map(([channel, byTable]) => ({ channel, label: CHANNEL_LABELS[channel] ?? channel, total: sum(byTable), byTable }))
    .sort((a, b) => b.total - a.total);
  const byPage = [...pages.entries()]
    .map(([page, chs]) => {
      const total = [...chs.values()].reduce((a, b) => a + b, 0);
      const top = [...chs.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return { page, total, topChannel: CHANNEL_LABELS[top] ?? top };
    })
    .sort((a, b) => b.total - a.total);
  const ai = byChannel.filter((c) => c.channel.startsWith('ai_')).reduce((a, c) => a + c.total, 0);
  return { total: rows.length, byChannel, byPage, aiShare: rows.length ? Math.round((ai / rows.length) * 1000) / 10 : 0 };
}
