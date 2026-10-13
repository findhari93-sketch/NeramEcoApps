/**
 * Loads colleges with their facts and (re)writes their FAQs.
 *
 * A college is rewritten when the hash of its facts differs from the hash its
 * current FAQs were written from (colleges.faq_facts_hash), so a new college,
 * or a fee or cutoff change, refreshes the page within a day. Locked rows
 * (staff edits are saved locked) are kept as they are, and the writer skips
 * their intents.
 */
import {
  buildFacts,
  factsHash,
  FACT_COLLEGE_COLUMNS,
  type CollegeRowForFacts,
  type CutoffRow,
  type Facts,
  type FeeRow,
  type InfraRow,
  type PlacementRow,
} from './facts';
import { writeFaqs } from './generate';

export interface ContentDb {
  from: (table: string) => any;
}

export interface CollegeWithFacts {
  row: CollegeRowForFacts & { faq_facts_hash: string | null; faqs_generated_at: string | null; status: string };
  facts: Facts;
  hash: string;
}

/** Facts for a set of colleges in five queries, whatever the count. */
export async function loadCollegesWithFacts(db: ContentDb, filter: { ids?: string[]; activeOnly?: boolean } = {}): Promise<CollegeWithFacts[]> {
  let q = db.from('colleges').select(FACT_COLLEGE_COLUMNS);
  if (filter.ids) q = q.in('id', filter.ids);
  if (filter.activeOnly !== false) q = q.eq('status', 'active');
  const { data: colleges, error } = await q.order('name').limit(1000);
  if (error) throw new Error(`colleges: ${error.message}`);
  const rows = (colleges ?? []) as CollegeWithFacts['row'][];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Up to a few hundred ids; chunk the IN lists so the URL stays short.
  const chunked = async <T>(table: string, cols: string): Promise<T[]> => {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error: e } = await db.from(table).select(cols).in('college_id', ids.slice(i, i + 150)).limit(5000);
      if (e) throw new Error(`${table}: ${e.message}`);
      out.push(...((data ?? []) as T[]));
    }
    return out;
  };
  const [fees, cutoffs, placements, infra] = await Promise.all([
    chunked<FeeRow>('college_fees', 'college_id,academic_year,year_number,fee_category,tuition,hostel,mess'),
    chunked<CutoffRow>('college_cutoffs', 'college_id,academic_year,counseling_system,category,cutoff_type,cutoff_value,round_number'),
    chunked<PlacementRow>('college_placements', 'college_id,academic_year,average_package_lpa,highest_package_lpa,placement_rate_percent'),
    chunked<InfraRow>('college_infrastructure', 'college_id,has_hostel_boys,has_hostel_girls,campus_area_acres,design_studios'),
  ]);

  const by = <T extends { college_id: string }>(list: T[], id: string) => list.filter((x) => x.college_id === id);
  return rows.map((row) => {
    const facts = buildFacts(row, by(fees, row.id), by(cutoffs, row.id), by(placements, row.id), by(infra, row.id)[0] ?? null);
    return { row, facts, hash: factsHash(facts) };
  });
}

export function needsRewrite(c: Pick<CollegeWithFacts, 'row' | 'hash'>): boolean {
  return c.row.faq_facts_hash !== c.hash;
}

export interface ContentReport {
  slug: string;
  written: number;
  ai: number;
  template: number;
  kept: number;
  rejected: { intent: string; reason: string }[];
  aiUnavailable: boolean;
}

export async function writeCollegeFaqs(
  db: ContentDb,
  c: CollegeWithFacts,
  /** deferAi: write template FAQs now and leave the college queued for AI wording later. */
  opts: { dryRun?: boolean; useAi?: boolean; deferAi?: boolean } = {},
): Promise<ContentReport> {
  const { data: existing, error } = await db
    .from('college_faqs')
    .select('id,intent,generated_by,locked,position')
    .eq('college_id', c.row.id);
  if (error) throw new Error(`college_faqs: ${error.message}`);
  // Staff rows are saved locked by default; unlocking one hands it back to the writer.
  const kept = ((existing ?? []) as { id: string; intent: string | null; generated_by: string; locked: boolean }[]).filter(
    (r) => r.locked,
  );
  const keptIntents = new Set(kept.map((r) => r.intent).filter(Boolean));

  const result = opts.deferAi
    ? { ...(await writeFaqs(c.facts, { useAi: false })), aiUnavailable: true }
    : await writeFaqs(c.facts, { useAi: opts.useAi });
  const fresh = result.faqs.filter((f) => !keptIntents.has(f.intent));
  const report: ContentReport = {
    slug: c.row.slug,
    written: fresh.length,
    ai: result.ai,
    template: result.template,
    kept: kept.length,
    rejected: result.rejected,
    aiUnavailable: result.aiUnavailable,
  };
  if (opts.dryRun) return report;

  const keptIds = kept.map((r) => r.id);
  let del = db.from('college_faqs').delete().eq('college_id', c.row.id);
  if (keptIds.length) del = del.not('id', 'in', `(${keptIds.join(',')})`);
  const { error: delErr } = await del;
  if (delErr) throw new Error(`clearing FAQs: ${delErr.message}`);

  if (fresh.length) {
    const { error: insErr } = await db.from('college_faqs').insert(
      fresh.map((f, i) => ({
        college_id: c.row.id,
        position: (i + 1) * 10,
        question: f.question,
        answer: f.answer,
        intent: f.intent,
        fact_keys: f.fact_keys,
        generated_by: f.source === 'ai' ? 'ai' : 'template',
      })),
    );
    if (insErr) throw new Error(`saving FAQs: ${insErr.message}`);
  }

  // If the AI was wanted but blocked (budget, cap, outage), the template FAQs
  // above are live, but the hash is left alone so the next run rewords them.
  const mark: Record<string, unknown> = { faqs_generated_at: new Date().toISOString() };
  if (!opts.deferAi && (!result.aiUnavailable || opts.useAi === false)) mark.faq_facts_hash = c.hash;
  const { error: upErr } = await db.from('colleges').update(mark).eq('id', c.row.id);
  if (upErr) throw new Error(`marking FAQs written: ${upErr.message}`);
  return report;
}
