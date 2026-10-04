/**
 * Live location readiness report. Skipped unless READINESS=1, because it reads
 * the database configured in apps/marketing/.env.local:
 *
 *   READINESS=1 npx vitest run apps/marketing/src/lib/seo/location-readiness.report.test.ts
 *
 * Writes agents/seo-aeo/LOCATION_READINESS.md: per page its gate score and
 * reasons, its closest page and similarity, and whether it is indexed, plus
 * the index count under the old rules (unreviewed content strong, every JEE
 * city eligible) so the effect of a gate change is visible before deploy.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { dropSharedProfiles, toClassroomCentre, type ClassroomCentre } from './facts';
import type { CollegeRow, ExamCentreRow, GeoDatasets } from './location-facts';
import { allCityGates, allStateGates } from './location-pages';
import { evaluateCityGate } from './location-gate';
import { MAX_SIMILARITY, cityPageText, closestPages } from './location-similarity';

const RUN = process.env.READINESS === '1';
const ROOT = path.resolve(__dirname, '../../../../..');

function loadEnv(): Record<string, string> {
  const file = path.join(ROOT, 'apps/marketing/.env.local');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, '')];
      }),
  );
}

async function loadDatasets(): Promise<{ ds: GeoDatasets; source: string }> {
  // .env.local wins: the vitest setup points Supabase env at a local stub.
  const env = { ...process.env, ...loadEnv() } as Record<string, string>;
  const url = env.SUPABASE_SERVER_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in apps/marketing/.env.local');
  const db = createClient(url, key, { auth: { persistSession: false } });
  const [ec, col, cen] = await Promise.all([
    db.from('nata_exam_centers').select('city_brochure, state, latitude, longitude, confidence, tcs_ion_confirmed, year, updated_at'),
    db
      .from('colleges')
      .select('slug, name, short_name, city, city_slug, district, state_slug, type, accepted_exams, counseling_systems, nirf_rank_architecture, updated_at')
      .or('is_active.is.null,is_active.eq.true'),
    db
      .from('offline_centers')
      .select('*') // ~10 rows; '*' because optional columns (nearby_cities) are missing on staging
      .eq('is_active', true),
  ]);
  for (const r of [ec, col, cen]) if (r.error) throw r.error;
  const centres = dropSharedProfiles(
    (cen.data ?? []).map((r) => toClassroomCentre(r as never)).filter((c): c is ClassroomCentre => c !== null),
  );
  return {
    ds: { examCentres: (ec.data ?? []) as ExamCentreRow[], colleges: (col.data ?? []) as unknown as CollegeRow[], centres },
    source: new URL(url).host,
  };
}

describe.skipIf(!RUN)('location readiness report', () => {
  it('writes agents/seo-aeo/LOCATION_READINESS.md', async () => {
    const { ds, source } = await loadDatasets();
    const lines: string[] = [
      '# Location readiness',
      '',
      `Generated ${new Date().toISOString().slice(0, 10)} from ${source} by \`location-readiness.report.test.ts\`. Do not edit by hand.`,
      '',
      `A city page is indexed when the gate passes (lib/seo/location-gate.ts) and no other indexed page shares more than ${MAX_SIMILARITY * 100}% of its text.`,
      '',
    ];
    const summary: string[] = ['| Exam | Pages | Indexed now | Indexed under old rules | Indexed pages over the similarity limit |', '|---|---|---|---|---|'];
    const tables: string[] = [];
    for (const exam of ['nata', 'jee-paper-2'] as const) {
      const gates = allCityGates(exam, ds);
      const oldRule = gates.filter(
        (g) =>
          evaluateCityGate({ ...g.facts, exam: 'nata', content: g.facts.content ? { ...g.facts.content, reviewed: true } : null }).index,
      ).length;
      const indexed = gates.filter((g) => g.gate.index);
      const sims = new Map(closestPages(indexed.map((g) => ({ slug: g.place.slug, text: cityPageText(g.facts) }))).map((r) => [r.slug, r]));
      const over = [...sims.values()].filter((r) => r.similarity > MAX_SIMILARITY).length;
      summary.push(`| ${exam} | ${gates.length} | ${indexed.length} | ${oldRule} | ${over} |`);
      tables.push(`## ${exam} city pages`, '', '| City | State | Score | Reasons | Closest page | Similarity | Indexed |', '|---|---|---|---|---|---|---|');
      for (const g of [...gates].sort((a, b) => Number(b.gate.index) - Number(a.gate.index) || b.gate.score - a.gate.score)) {
        if (!g.gate.index && g.gate.score < 2) continue;
        const s = sims.get(g.place.slug);
        tables.push(
          `| ${g.place.name} | ${g.facts.regionName} | ${g.gate.score} | ${g.gate.reasons.join(', ')} | ${s?.closest ?? ''} | ${s ? s.similarity : ''} | ${g.gate.index ? 'yes' : 'no'} |`,
        );
      }
      tables.push('', `Pages with score below 2 and not indexed are left out (${gates.filter((g) => !g.gate.index && g.gate.score < 2).length}).`, '');
    }
    const states = allStateGates('nata', ds);
    summary.push('', `State hubs indexed: ${states.filter((s) => s.gate.index).length} of ${states.length}.`);
    lines.push(...summary, '', ...tables);
    const out = path.join(ROOT, 'agents/seo-aeo/LOCATION_READINESS.md');
    fs.writeFileSync(out, lines.join('\n'));
    expect(fs.existsSync(out)).toBe(true);
  }, 120_000);
});
