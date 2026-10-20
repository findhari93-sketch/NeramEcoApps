/**
 * Safe, target and reach: how a student's mark or rank compares with last
 * year's closing figure. Pure, so the bands are unit-tested and the same for
 * every answer.
 *
 * TNEA (marks out of 400). A community student can take a General (OC) seat or
 * a seat in their own community, so a college's bar is the lower of the two.
 *   safe    at least 5 marks above the bar
 *   target  0 to 5 above
 *   reach   up to 10 below
 *
 * KEAM and JoSAA (ranks, lower is better):
 *   safe    closing rank at least 15% after the student's rank
 *   target  closing rank at or after the student's rank
 *   reach   closing rank up to 15% before it
 */
import type { CollegeRow, Tier } from './cards';
import type { CutoffCollege, JosaaClosing } from '@/lib/tools/data/facts';

export const TNEA_COMMUNITIES = ['OC', 'BC', 'BCM', 'MBC', 'SC', 'SCA', 'ST'] as const;
export type TneaCommunity = (typeof TNEA_COMMUNITIES)[number];

export const TNEA_MARGIN = { safe: 5, reach: -10 } as const;
export const RANK_MARGIN = 0.15;

export function tierForMark(mark: number, bar: number): Tier | null {
  const margin = mark - bar;
  if (margin >= TNEA_MARGIN.safe) return 'safe';
  if (margin >= 0) return 'target';
  if (margin >= TNEA_MARGIN.reach) return 'reach';
  return null;
}

export function tierForRank(rank: number, closingRank: number): Tier | null {
  if (closingRank >= rank * (1 + RANK_MARGIN)) return 'safe';
  if (closingRank >= rank) return 'target';
  if (closingRank >= rank * (1 - RANK_MARGIN)) return 'reach';
  return null;
}

export type Grouped = Record<Tier, CollegeRow[]>;

const empty = (): Grouped => ({ safe: [], target: [], reach: [] });

/** TNEA colleges grouped by tier. Within a tier, the most sought-after first. */
export function groupTnea(colleges: CutoffCollege[], mark: number, community: string): Grouped {
  const out = empty();
  for (const c of colleges) {
    if (c.system !== 'TNEA_BARCH' || !c.closingMarks) continue;
    const options: Array<[string, number]> = [];
    if (c.closingMarks.OC != null) options.push(['OC', c.closingMarks.OC]);
    if (community !== 'OC' && c.closingMarks[community] != null) options.push([community, c.closingMarks[community] as number]);
    if (options.length === 0) continue;
    const [category, bar] = options.reduce((best, o) => (o[1] < best[1] ? o : best));
    const tier = tierForMark(mark, bar);
    if (tier) out[tier].push({ name: c.name, city: c.city, closing: bar, category });
  }
  for (const t of Object.keys(out) as Tier[]) out[t].sort((a, b) => b.closing - a.closing);
  return out;
}

/** KEAM colleges (State Merit closing ranks) grouped by tier, best college first. */
export function groupKeam(colleges: CutoffCollege[], rank: number): Grouped {
  const out = empty();
  for (const c of colleges) {
    if (c.system !== 'KEAM_BARCH' || c.closingRank == null) continue;
    const tier = tierForRank(rank, c.closingRank);
    if (tier) out[tier].push({ name: c.name, city: c.city, closing: c.closingRank, category: 'SM' });
  }
  for (const t of Object.keys(out) as Tier[]) out[t].sort((a, b) => a.closing - b.closing);
  return out;
}

/** JoSAA B.Arch closing ranks (open, gender-neutral, final round), best first. */
export function groupJosaa(rows: JosaaClosing[], rank: number, quota: 'AI' | 'OS' = 'OS'): Grouped {
  const out = empty();
  const pick = rows.filter((r) => (quota === 'OS' ? r.quota === 'OS' || r.quota === 'AI' : r.quota === quota));
  // One row per institute: the most generous closing rank among its quotas.
  const best = new Map<string, JosaaClosing>();
  for (const r of pick) {
    const prev = best.get(r.institute);
    if (!prev || r.closingRank > prev.closingRank) best.set(r.institute, r);
  }
  for (const r of best.values()) {
    const tier = tierForRank(rank, r.closingRank);
    if (tier) out[tier].push({ name: r.institute, city: r.city, closing: r.closingRank, category: r.quota, institutionType: r.type });
  }
  for (const t of Object.keys(out) as Tier[]) out[t].sort((a, b) => a.closing - b.closing);
  return out;
}

/**
 * What a guest sees: the top college in each tier, and how many are held back
 * until they sign in. A signed-in student sees up to `perTier` in each.
 */
export function limitGroups(groups: Grouped, guest: boolean, perTier = 8): { groups: Grouped; counts: Record<Tier, number>; hidden: number } {
  const cap = guest ? 1 : perTier;
  const counts = { safe: groups.safe.length, target: groups.target.length, reach: groups.reach.length };
  const shown: Grouped = { safe: groups.safe.slice(0, cap), target: groups.target.slice(0, cap), reach: groups.reach.slice(0, cap) };
  const total = counts.safe + counts.target + counts.reach;
  const visible = shown.safe.length + shown.target.length + shown.reach.length;
  return { groups: shown, counts, hidden: guest ? total - visible : 0 };
}
