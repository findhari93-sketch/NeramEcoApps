/**
 * llms.txt for AI answer engines: what each tool answers, in one line, plus
 * the indexed state and city pages. Built from the same registry and gate as
 * the pages and sitemaps, so it never lists a page Google is told to skip.
 */
import { GEONAMES_ATTRIBUTION } from '@neram/geo';
import { APP_URL, MARKETING_URL } from './constants';
import type { ToolSeo } from '@/lib/tools/tool-seo';
import type { GeoPageSummary, GeoTool } from '@/lib/tools/geo-pages';

const GEO_TITLES: Record<GeoTool, (label: string) => string> = {
  examCentres: (l) => `NATA exam centres near ${l}`,
  costCalculator: (l) => `NATA exam cost from ${l}`,
  collegePredictor: (l) => `B.Arch college predictor, ${l}`,
  coaChecker: (l) => `COA approved architecture colleges in ${l}`,
};

export function buildLlmsTxt(tools: ToolSeo[], geo: GeoPageSummary[], full = false): string {
  const lines: string[] = [
    '# aiArchitek by Neram Classes',
    '',
    '> Free tools for NATA and JEE Paper 2 (B.Arch) aspirants in India: cutoff calculator, college predictor, exam centre finder, COA approved college checker, rank predictor and more. Every tool can be tried without an account; a free account opens the full tool.',
    '',
    `Coaching, courses and college guides: ${MARKETING_URL}`,
    '',
    '## Tools',
    '',
    ...tools.map((t) => `- [${t.name}](${APP_URL}${t.path}): ${t.answer}`),
  ];

  const indexed = geo.filter((g) => g.index);
  const states = indexed.filter((g) => g.kind === 'state');
  lines.push('', '## By state', '', ...states.map((g) => `- [${GEO_TITLES[g.tool](g.label)}](${APP_URL}${g.path})`));

  if (full) {
    const cities = indexed.filter((g) => g.kind === 'city');
    lines.push('', '## By city', '', ...cities.map((g) => `- [${GEO_TITLES[g.tool](g.label)}](${APP_URL}${g.path})`));
    lines.push('', '## Frequently asked questions', '');
    for (const t of tools) for (const f of t.faqs) lines.push(`### ${f.q}`, '', f.a, '');
  } else {
    lines.push('', `City pages and every FAQ: ${APP_URL}/llms-full.txt`);
  }

  lines.push('', GEONAMES_ATTRIBUTION, '');
  return lines.join('\n');
}
