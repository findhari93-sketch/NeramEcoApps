import type { DemoCutoffCollege, DemoSystem } from '@/features/tools/college-predictor/CollegePredictorDemo';
import type { CutoffCollege } from './facts';

const LABEL: Record<CutoffCollege['system'], string> = {
  TNEA_BARCH: 'TNEA (Tamil Nadu)',
  KEAM_BARCH: 'KEAM (Kerala)',
};

/** Per-system closing values for the demo: open category only, nothing per student. */
export function demoSystems(colleges: CutoffCollege[], onlyState?: string): DemoSystem[] {
  const out: DemoSystem[] = [];
  for (const code of ['TNEA_BARCH', 'KEAM_BARCH'] as const) {
    const rows = colleges.filter((c) => c.system === code && (!onlyState || c.stateSlug === onlyState));
    const list = rows
      .map((c): DemoCutoffCollege => ({
        name: c.name,
        place: c.city ?? c.district,
        ...(code === 'TNEA_BARCH' ? { mark: c.closingMarks?.OC } : { rank: c.closingRank }),
      }))
      .filter((c) => (code === 'TNEA_BARCH' ? c.mark != null : c.rank != null));
    if (list.length > 0) out.push({ code, label: LABEL[code], year: rows[0].year, colleges: list });
  }
  return out;
}

export function systemLabel(code: CutoffCollege['system']): string {
  return LABEL[code];
}
