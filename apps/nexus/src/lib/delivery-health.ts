/**
 * Why notifications are or are not landing, in one answer.
 *
 * Since July almost every Nexus reminder reached only the Nexus bell, and the
 * cause stayed a guess because nothing looked: was an env var missing, did the
 * Graph token lack a permission, was the Teams app not in the catalog? These are
 * the checks, as pure functions where they can be, for /api/admin/delivery-health.
 */

export const REQUIRED_GRAPH_ROLES = [
  'TeamsActivity.Send',
  'TeamsAppInstallation.ReadWriteForUser.All',
] as const;

export const DELIVERY_ENV_KEYS = [
  'AZ_CLIENT_ID',
  'AZ_CLIENT_SECRET',
  'AZ_TENANT_ID',
  'TEAMS_APP_CATALOG_ID',
  'TEAMS_BOT_ENABLED',
  'RESEND_API_KEY',
] as const;

/** Which delivery env vars are present, and which carry stray whitespace (the Windows newline trap). */
export function envReport(env: Record<string, string | undefined>): Record<string, 'set' | 'missing' | 'has_whitespace'> {
  const out: Record<string, 'set' | 'missing' | 'has_whitespace'> = {};
  for (const key of DELIVERY_ENV_KEYS) {
    const v = env[key];
    out[key] = !v || !v.trim() ? 'missing' : v !== v.trim() ? 'has_whitespace' : 'set';
  }
  return out;
}

/** The `roles` claim of an app-only access token. Never verifies; only reads what Microsoft granted. */
export function decodeTokenRoles(jwt: string): string[] {
  const part = jwt.split('.')[1];
  if (!part) return [];
  try {
    const claims = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return Array.isArray(claims.roles) ? claims.roles.map(String) : [];
  } catch {
    return [];
  }
}

export function missingRoles(granted: string[]): string[] {
  return REQUIRED_GRAPH_ROLES.filter((r) => !granted.includes(r));
}

export interface ReceiptRow {
  event_type: string;
  chat: boolean;
  bot: boolean;
  teams: boolean;
  inapp: boolean;
  email: boolean;
  channel: string;
  reasons: Record<string, string> | null;
}

export interface ChannelSummary {
  eventType: string;
  sends: number;
  skipped: number;
  chat: number;
  bot: number;
  teams: number;
  inapp: number;
  email: number;
  /** Tried and reached no Teams channel and no email. */
  bellOnly: number;
  /** The most common failure reason per tier, so the fix is obvious. */
  topReasons: Record<string, string>;
}

export function summariseReceipts(rows: ReceiptRow[]): ChannelSummary[] {
  const byEvent = new Map<string, { s: ChannelSummary; reasons: Record<string, Map<string, number>> }>();
  for (const r of rows) {
    let entry = byEvent.get(r.event_type);
    if (!entry) {
      entry = {
        s: { eventType: r.event_type, sends: 0, skipped: 0, chat: 0, bot: 0, teams: 0, inapp: 0, email: 0, bellOnly: 0, topReasons: {} },
        reasons: {},
      };
      byEvent.set(r.event_type, entry);
    }
    const s = entry.s;
    if (r.channel === 'dormant') {
      s.skipped += 1;
      continue;
    }
    s.sends += 1;
    if (r.chat) s.chat += 1;
    if (r.bot) s.bot += 1;
    if (r.teams) s.teams += 1;
    if (r.inapp) s.inapp += 1;
    if (r.email) s.email += 1;
    if (r.inapp && !r.chat && !r.bot && !r.teams && !r.email) s.bellOnly += 1;
    for (const [tier, reason] of Object.entries(r.reasons || {})) {
      const counts = (entry.reasons[tier] ||= new Map());
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  }
  return [...byEvent.values()]
    .map(({ s, reasons }) => {
      for (const [tier, counts] of Object.entries(reasons)) {
        s.topReasons[tier] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
      return s;
    })
    .sort((a, b) => b.sends - a.sends);
}
