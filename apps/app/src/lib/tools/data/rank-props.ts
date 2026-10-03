import type { DemoRankSystem } from '@/features/tools/rank-predictor/RankDemo';
import type { SystemRanks } from './facts';

export const SYSTEM_PAGES = {
  tnea: { code: 'TNEA_BARCH', label: 'TNEA (Tamil Nadu)', short: 'TNEA', stateSlug: 'tamil-nadu', stateName: 'Tamil Nadu' },
  keam: { code: 'KEAM_BARCH', label: 'KEAM (Kerala)', short: 'KEAM', stateSlug: 'kerala', stateName: 'Kerala' },
} as const;

export type SystemSlug = keyof typeof SYSTEM_PAGES;

export function systemSlugFor(code: string): SystemSlug | null {
  return (Object.keys(SYSTEM_PAGES) as SystemSlug[]).find((k) => SYSTEM_PAGES[k].code === code) ?? null;
}

export function demoRankSystems(systems: SystemRanks[]): DemoRankSystem[] {
  return systems.map((s) => {
    const slug = systemSlugFor(s.code);
    return {
      code: s.code,
      label: slug ? SYSTEM_PAGES[slug].label : s.code,
      year: s.year,
      total: s.total,
      bands: s.bands.map((b) => [b.from, b.to, b.bestRank, b.worstRank]),
    };
  });
}
