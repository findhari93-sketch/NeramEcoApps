import type { DemoInsight } from '@/features/tools/insights/InsightsDemo';
import type { CutoffCollege, SystemRanks } from './facts';
import { SYSTEM_PAGES, systemSlugFor } from './rank-props';

/** Headline numbers per counselling, all aggregate. */
export function demoInsights(colleges: CutoffCollege[], ranks: SystemRanks[]): DemoInsight[] {
  const out: DemoInsight[] = [];
  for (const code of ['TNEA_BARCH', 'KEAM_BARCH'] as const) {
    const list = colleges.filter((c) => c.system === code);
    if (list.length === 0) continue;
    const slug = systemSlugFor(code);
    const byMark = code === 'TNEA_BARCH';
    const first = [...list]
      .filter((c) => (byMark ? c.closingMarks?.OC != null : c.closingRank != null))
      .sort((a, b) => (byMark ? (b.closingMarks!.OC as number) - (a.closingMarks!.OC as number) : (a.closingRank as number) - (b.closingRank as number)))
      .slice(0, 5)
      .map((c): [string, string] => [c.name, byMark ? `closed at ${c.closingMarks!.OC} marks` : `closed at rank ${c.closingRank!.toLocaleString('en-IN')}`]);
    const rank = ranks.find((r) => r.code === code);
    out.push({
      code,
      label: slug ? SYSTEM_PAGES[slug].label : code,
      year: list[0].year,
      rankList: rank && rank.year === list[0].year ? rank.total : null,
      allotted: byMark ? list.reduce((n, c) => n + (c.seats ?? 0), 0) : null,
      colleges: list.length,
      first,
    });
  }
  return out;
}
