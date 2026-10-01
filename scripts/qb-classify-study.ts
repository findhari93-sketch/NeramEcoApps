/**
 * QB "What to study" classifier.
 *
 * Maths (default): re-decides every active maths question's PRIMARY chapter
 * from the question and its worked solution (not from which symbols appear),
 * plus the chapters it also uses and 2 to 4 concepts, each pointing at an
 * NCERT section. The founder found Functions questions filed under
 * Trigonometry because `sin x` appeared; this is the fix.
 *
 * Aptitude (--subject aptitude): links each aptitude question to the
 * Foundation book section that teaches its answer, or to nothing.
 *
 * Writes (only with --apply):
 *   - nexus_qb_question_study, one row per question (source 'ai').
 *   - Maths only: a nexus_qb_category_proposals row when the chapter changes.
 *     Proposals at or above --threshold are applied at once through
 *     nexus_qb_apply_category_proposals (categories[] and the tag table move
 *     together); the rest wait at /teacher/question-bank/reclassify.
 *   Rows a teacher wrote or approved are never touched.
 *
 * Before --apply, the gold set (scripts/fixtures/qb-math-gold.json) runs first
 * and the run stops below 90% accuracy.
 *
 * Usage (from scripts/):
 *   npx tsx qb-classify-study.ts --gold                         # accuracy check only
 *   npx tsx qb-classify-study.ts --dry-run --out ../tmp/math.csv
 *   npx tsx qb-classify-study.ts --apply
 *   npx tsx qb-classify-study.ts --apply --only-missing         # new questions since the last run
 *   npx tsx qb-classify-study.ts --subject aptitude --dry-run
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and Anthropic
 * credentials (ANTHROPIC_API_KEY or an `ant auth login` profile).
 * `--env-file ../.env.production` reads the database from a file instead; the
 * target is printed before anything runs.
 *
 * Without the API (e.g. classifying inside Claude Code on a Max plan):
 *   npx tsx qb-classify-study.ts --env-file ../.env.production --export <dir>
 *     writes <dir>/system.md (the prompt and the reply format) and
 *     <dir>/batch-NN.json (questions), plus batch-gold.json for maths.
 *   ...classify each batch into <dir>/results-*.json...
 *   npx tsx qb-classify-study.ts --env-file ../.env.production --results <dir> --gold
 *   npx tsx qb-classify-study.ts --env-file ../.env.production --results <dir> --dry-run
 *   npx tsx qb-classify-study.ts --env-file ../.env.production --results <dir> --apply
 *   Same checks, report and writes as the API path; no model is called.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aptitudeSchema,
  buildAptitudeSystemPrompt,
  buildMathSystemPrompt,
  buildQuestionMessage,
  aptitudeOutputInstructions,
  mathOutputInstructions,
  csvRow,
  currentChapters,
  mathSchema,
  scoreGold,
  validateAptitudeResult,
  validateMathResult,
  type AptitudeResult,
  type ChapterOption,
  type ClassifyQuestion,
  type FoundationOption,
  type GoldItem,
  type MathResult,
  type NcertOption,
} from './lib/qb-study-classify';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const subject = (opt('subject') || 'math') as 'math' | 'aptitude';
const apply = flag('apply');
const goldOnly = flag('gold');
const skipGold = flag('skip-gold');
const onlyMissing = flag('only-missing');
const ids = opt('ids')?.split(',').map((s) => s.trim()).filter(Boolean);
const limit = opt('limit') ? Number(opt('limit')) : undefined;
const model = opt('model') || 'claude-opus-5-5';
const effort = opt('effort') || 'medium';
const threshold = opt('threshold') ? Number(opt('threshold')) : 0.85;
const concurrency = opt('concurrency') ? Number(opt('concurrency')) : 4;
const exportDir = opt('export');
const resultsDir = opt('results');
const batchSize = opt('batch-size') ? Number(opt('batch-size')) : 42;
const envFile = opt('env-file');
const fileModel = opt('model') || 'claude-opus-5-5 (Claude Code)';
const outPath = opt('out') || `qb-study-${subject}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;

const MATH_ROOTS = ['algebra', 'coordinate_geometry', 'calculus', 'trigonometry', 'vectors_and_3d_geometry', 'probability_and_statistics'];
// Transitional buckets a question should leave, not land in.
const NOT_A_PRIMARY = new Set(['conic_sections']);
const APTITUDE_SUBJECTS = [
  'history_of_architecture', 'famous_architects', 'building_materials', 'building_science',
  'architecture_gk', 'design_fundamentals', 'sustainability', 'building_services', 'planning', 'general_knowledge',
];
const GOLD_MIN_ACCURACY = 0.9;

// ── Clients ──────────────────────────────────────────────────────────────────
function loadEnvFile(file: string) {
  for (const line of readFileSync(path.resolve(file), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

function clients() {
  if (envFile) loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.neramclasses.com';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  console.log(`Database: ${url}${envFile ? ` (from ${envFile})` : ''}`);
  // No API client when the classifications come from files.
  const ai = exportDir || resultsDir ? (null as unknown as Anthropic) : new Anthropic();
  return { db: createClient(url, key), ai };
}

/** Every results-*.json in the directory, keyed by question_id. */
function loadResults(dir: string): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const f of readdirSync(dir).filter((n) => /^results-.*\.json$/.test(n)).sort()) {
    const rows = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    for (const r of Array.isArray(rows) ? rows : []) if (r?.question_id) out.set(r.question_id, r);
  }
  console.log(`Loaded ${out.size} classifications from ${dir}`);
  return out;
}

function writeExport(dir: string, system: string, questions: ClassifyQuestion[], gold?: ClassifyQuestion[]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'system.md'), system, 'utf8');
  const toBatch = (qs: ClassifyQuestion[]) => qs.map((q) => ({ question_id: q.id, message: buildQuestionMessage(q) }));
  if (gold?.length) writeFileSync(path.join(dir, 'batch-gold.json'), JSON.stringify(toBatch(gold), null, 1), 'utf8');
  let n = 0;
  for (let i = 0; i < questions.length; i += batchSize) {
    n += 1;
    const name = `batch-${String(n).padStart(2, '0')}.json`;
    writeFileSync(path.join(dir, name), JSON.stringify(toBatch(questions.slice(i, i + batchSize)), null, 1), 'utf8');
  }
  console.log(`Exported ${questions.length} questions in ${n} batches${gold?.length ? ` + ${gold.length} gold` : ''} to ${path.resolve(dir)}`);
}

async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// ── Vocabulary ───────────────────────────────────────────────────────────────
async function loadMathVocabulary(db: SupabaseClient) {
  const { data: tags, error } = await db
    .from('nexus_qb_tags')
    .select('id, slug, label, parent_id, sort_order')
    .eq('group_type', 'subject')
    .eq('is_active', true);
  if (error) throw error;
  const byId = new Map(tags!.map((t) => [t.id, t]));
  const chapters: ChapterOption[] = tags!
    .filter((t) => t.parent_id && MATH_ROOTS.includes(byId.get(t.parent_id)?.slug) && !NOT_A_PRIMARY.has(t.slug))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((t) => ({ slug: t.slug, label: t.label, group: byId.get(t.parent_id)!.label }));

  const { data: ncertRows, error: nErr } = await db
    .from('nexus_ncert_sections')
    .select('ref, class_level, chapter_no, chapter_title, section_no, section_title, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (nErr) throw new Error(`nexus_ncert_sections missing? Apply migration 20261025090100 first. ${nErr.message}`);
  const ncert: NcertOption[] = ncertRows!.map((r) => ({
    ref: r.ref,
    label: `Class ${r.class_level} Ch ${r.chapter_no} ${r.chapter_title}${r.section_no ? `, ${r.section_no} ${r.section_title}` : ''}`,
  }));
  return { chapters, ncert };
}

async function loadFoundationSections(db: SupabaseClient): Promise<FoundationOption[]> {
  const { data, error } = await db
    .from('nexus_foundation_sections')
    .select('id, title, description, sort_order, chapter:nexus_foundation_chapters!inner(title, chapter_number, is_published)')
    .order('sort_order');
  if (error) throw error;
  return (data || [])
    .map((s: any) => ({ ...s, chapter: Array.isArray(s.chapter) ? s.chapter[0] : s.chapter }))
    .filter((s: any) => s.chapter?.is_published)
    .sort((a: any, b: any) => a.chapter.chapter_number - b.chapter.chapter_number || a.sort_order - b.sort_order)
    .map((s: any) => ({
      id: s.id,
      chapter: `Ch ${s.chapter.chapter_number} ${s.chapter.title}`,
      title: s.title,
      description: s.description,
    }));
}

// ── Questions ────────────────────────────────────────────────────────────────
const Q_COLS = 'id, question_text, options, correct_answer, explanation_brief, explanation_detailed, categories';

async function loadQuestions(db: SupabaseClient, onlyIds?: string[]): Promise<ClassifyQuestion[]> {
  if (onlyIds?.length) {
    const { data, error } = await db.from('nexus_qb_questions').select(Q_COLS).in('id', onlyIds);
    if (error) throw error;
    return (data || []) as ClassifyQuestion[];
  }
  const rows = await readAll<ClassifyQuestion>((from, to) => {
    let q = db
      .from('nexus_qb_questions')
      .select(Q_COLS)
      .eq('is_active', true)
      .eq('status', 'active')
      .neq('question_format', 'DRAWING_PROMPT')
      .order('id')
      .range(from, to);
    q = subject === 'math' ? q.contains('categories', ['mathematics']) : q.overlaps('categories', APTITUDE_SUBJECTS);
    return q as any;
  });
  return rows;
}

/** Rows a teacher wrote or approved are off limits; --only-missing also skips AI rows. */
async function loadSkipSet(db: SupabaseClient): Promise<Set<string>> {
  const rows = await readAll<{ question_id: string; source: string; reviewed_at: string | null }>((from, to) =>
    db.from('nexus_qb_question_study').select('question_id, source, reviewed_at').range(from, to) as any,
  );
  return new Set(rows.filter((r) => onlyMissing || r.source === 'staff' || r.reviewed_at).map((r) => r.question_id));
}

// ── Model call ───────────────────────────────────────────────────────────────
async function callModel(ai: Anthropic, system: string, schema: object, user: string): Promise<unknown> {
  // output_config is newer than this SDK's types; the SDK sends it through as is.
  const params = {
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;
  const res = await ai.messages.create(params);
  const stop = res.stop_reason as string;
  if (stop === 'refusal') throw new Error('model declined');
  if (stop === 'max_tokens') throw new Error('ran out of tokens');
  const text = res.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('no text in the reply');
  return JSON.parse(text.text);
}

async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

type Outcome<R> = { q: ClassifyQuestion; result: R | null; error?: string };

async function classifyAll<R>(
  questions: ClassifyQuestion[],
  run: (q: ClassifyQuestion) => Promise<R | null>,
): Promise<Outcome<R>[]> {
  let done = 0;
  return pool(questions, concurrency, async (q) => {
    let outcome: Outcome<R>;
    try {
      // One retry for a reply that fails validation; the SDK already retries 429/5xx.
      let result = await run(q);
      if (!result) result = await run(q);
      outcome = { q, result, ...(result ? {} : { error: 'invalid reply' }) };
    } catch (err) {
      outcome = { q, result: null, error: err instanceof Error ? err.message : String(err) };
    }
    done += 1;
    if (done % 10 === 0 || done === questions.length) console.log(`  ${done}/${questions.length}`);
    return outcome;
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { db, ai } = clients();
  const runId = randomUUID();
  const how = exportDir ? `export to ${exportDir}` : resultsDir ? `results from ${resultsDir}` : `model ${model} · effort ${effort}`;
  console.log(`Subject: ${subject} · ${how} · ${apply ? 'APPLY' : 'dry run'} · run ${runId}`);

  if (subject === 'math') await runMath(db, ai, runId);
  else await runAptitude(db, ai);
}

async function runMath(db: SupabaseClient, ai: Anthropic, runId: string) {
  const { chapters, ncert } = await loadMathVocabulary(db);
  const slugs = chapters.map((c) => c.slug);
  const refs = ncert.map((n) => n.ref);
  const system = buildMathSystemPrompt(chapters, ncert);
  const schema = mathSchema(slugs, refs);
  const slugSet = new Set(slugs);
  const refSet = new Set(refs);
  const fromFile = resultsDir ? loadResults(resultsDir) : null;
  const classify = async (q: ClassifyQuestion) =>
    fromFile
      ? validateMathResult(fromFile.get(q.id), slugSet, refSet)
      : validateMathResult(await callModel(ai, system, schema, buildQuestionMessage(q)), slugSet, refSet);

  if (exportDir) {
    const goldList: GoldItem[] = JSON.parse(readFileSync(path.join(here, 'fixtures/qb-math-gold.json'), 'utf8'));
    const goldIds = new Set(goldList.map((g) => g.question_id));
    const skipped = await loadSkipSet(db);
    let all = (await loadQuestions(db, ids)).filter((q) => !skipped.has(q.id));
    if (limit) all = all.slice(0, limit);
    writeExport(
      exportDir,
      `${system}\n\n${mathOutputInstructions()}`,
      all.filter((q) => !goldIds.has(q.id)),
      await loadQuestions(db, [...goldIds]),
    );
    return;
  }

  // Gold set first: before any apply, and on its own with --gold.
  const gold: GoldItem[] = JSON.parse(readFileSync(path.join(here, 'fixtures/qb-math-gold.json'), 'utf8'));
  const goldResults = new Map<string, Outcome<MathResult>>();
  if (goldOnly || (apply && !skipGold && !ids)) {
    console.log(`Gold set: ${gold.length} questions`);
    const goldQs = await loadQuestions(db, gold.map((g) => g.question_id));
    for (const o of await classifyAll(goldQs, classify)) goldResults.set(o.q.id, o);
    const score = scoreGold(gold, new Map([...goldResults].map(([id, o]) => [id, o.result?.primary_slug ?? null])));
    console.log(`Gold accuracy: ${score.correct}/${score.total} (${Math.round(score.accuracy * 100)}%)`);
    for (const m of score.misses) console.log(`  miss ${m.id}: expected ${m.expected.join(' or ')}, got ${m.got}`);
    if (goldOnly) return;
    if (score.accuracy < GOLD_MIN_ACCURACY) {
      console.error(`Below ${GOLD_MIN_ACCURACY * 100}%. Nothing written. Fix the prompt or the gold set first.`);
      process.exit(1);
    }
  }

  const skip = await loadSkipSet(db);
  let questions = (await loadQuestions(db, ids)).filter((q) => !skip.has(q.id));
  // From files, only what was classified; a partial run is fine.
  if (fromFile) questions = questions.filter((q) => fromFile.has(q.id));
  if (limit) questions = questions.slice(0, limit);
  console.log(`Classifying ${questions.length} maths questions (${skip.size} skipped: staff-reviewed${onlyMissing ? ' or already done' : ''})`);

  const fresh = questions.filter((q) => !goldResults.has(q.id));
  const outcomes = [...questions.filter((q) => goldResults.has(q.id)).map((q) => goldResults.get(q.id)!), ...(await classifyAll(fresh, classify))];

  // Report
  const lines = [csvRow(['question_id', 'old_chapter', 'new_primary', 'changed', 'also_uses', 'confidence', 'auto_apply', 'concepts', 'rationale', 'question', 'error'])];
  let changed = 0;
  let auto = 0;
  let failed = 0;
  const moves = new Map<string, number>();
  for (const o of outcomes) {
    const old = currentChapters(o.q.categories);
    const r = o.result;
    if (!r) failed += 1;
    const isChange = !!r && !(old.length === 1 && old[0] === r.primary_slug);
    if (isChange) {
      changed += 1;
      const key = `${old.join('+') || '(none)'} -> ${r!.primary_slug}`;
      moves.set(key, (moves.get(key) || 0) + 1);
    }
    const isAuto = !!r && r.confidence >= threshold;
    if (isChange && isAuto) auto += 1;
    lines.push(
      csvRow([
        o.q.id,
        old.join(' | '),
        r?.primary_slug ?? '',
        isChange ? 'yes' : '',
        r?.also_uses.join(' | ') ?? '',
        r ? r.confidence.toFixed(2) : '',
        isAuto ? 'yes' : 'review',
        r?.concepts.map((c) => `${c.name} [${c.ncert_ref}]`).join(' | ') ?? '',
        r?.rationale ?? '',
        (o.q.question_text || '').replace(/\s+/g, ' ').slice(0, 160),
        o.error ?? '',
      ]),
    );
  }
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Report: ${path.resolve(outPath)}`);
  console.log(`Chapter changes: ${changed} (${auto} confident, ${changed - auto} for teacher review) · failed: ${failed}`);
  for (const [k, n] of [...moves].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n} × ${k}`);

  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to write.');
    return;
  }

  // Write
  const now = new Date().toISOString();
  const toApply: string[] = [];
  for (const o of outcomes) {
    const r = o.result;
    if (!r) continue;
    const { error: sErr } = await db.from('nexus_qb_question_study').upsert(
      {
        question_id: o.q.id,
        primary_slug: r.primary_slug,
        also_uses: r.also_uses,
        concepts: r.concepts.map((c) => ({
          name: c.name,
          ...(c.why ? { why: c.why } : {}),
          ...(c.ncert_ref !== 'none' ? { ncert_ref: c.ncert_ref } : {}),
        })),
        source: 'ai',
        model: resultsDir ? fileModel : model,
        confidence: r.confidence,
        rationale: r.rationale,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      },
      { onConflict: 'question_id' },
    );
    if (sErr) {
      console.error(`  study row ${o.q.id}: ${sErr.message}`);
      continue;
    }

    const current = o.q.categories;
    const remove = currentChapters(current).filter((c) => c !== r.primary_slug);
    const add = current.includes(r.primary_slug) ? [] : [r.primary_slug];
    if (add.length === 0 && remove.length === 0) continue;
    const { data: p, error: pErr } = await db
      .from('nexus_qb_category_proposals')
      .insert({
        run_id: runId,
        question_id: o.q.id,
        current_categories: current,
        proposed_add: add,
        proposed_remove: remove,
        source: 'ai',
        confidence: r.confidence,
        rationale: r.rationale,
      })
      .select('id')
      .single();
    if (pErr) {
      console.error(`  proposal ${o.q.id}: ${pErr.message}`);
      continue;
    }
    if (r.confidence >= threshold) toApply.push(p.id);
  }

  for (let i = 0; i < toApply.length; i += 100) {
    const { data, error } = await db.rpc('nexus_qb_apply_category_proposals', { p_ids: toApply.slice(i, i + 100), p_reviewer: null });
    if (error) throw error;
    console.log(`  applied batch: ${JSON.stringify(data)}`);
  }
  console.log(`Done. ${toApply.length} chapter changes applied; the rest wait at /teacher/question-bank/reclassify.`);
}

async function runAptitude(db: SupabaseClient, ai: Anthropic) {
  const sections = await loadFoundationSections(db);
  if (sections.length === 0) throw new Error('No published Foundation sections');
  const sectionIds = sections.map((s) => s.id);
  const system = buildAptitudeSystemPrompt(sections);
  const schema = aptitudeSchema(sectionIds);
  const idSet = new Set(sectionIds);
  const byId = new Map(sections.map((s) => [s.id, s]));

  const skip = await loadSkipSet(db);
  let questions = (await loadQuestions(db, ids)).filter((q) => !skip.has(q.id));
  if (exportDir) {
    if (limit) questions = questions.slice(0, limit);
    writeExport(exportDir, `${system}\n\n${aptitudeOutputInstructions()}`, questions);
    return;
  }
  const fromFile = resultsDir ? loadResults(resultsDir) : null;
  if (fromFile) questions = questions.filter((q) => fromFile.has(q.id));
  if (limit) questions = questions.slice(0, limit);
  console.log(`Matching ${questions.length} aptitude questions against ${sections.length} Foundation sections`);

  const outcomes = await classifyAll<AptitudeResult>(questions, async (q) =>
    fromFile
      ? validateAptitudeResult(fromFile.get(q.id), idSet)
      : validateAptitudeResult(await callModel(ai, system, schema, buildQuestionMessage(q)), idSet),
  );

  const lines = [csvRow(['question_id', 'chapter', 'section', 'confidence', 'shown', 'concept', 'why', 'rationale', 'question', 'error'])];
  let linked = 0;
  let shown = 0;
  for (const o of outcomes) {
    const r = o.result;
    const s = r && r.foundation_section_id !== 'none' ? byId.get(r.foundation_section_id) : null;
    if (s) linked += 1;
    if (s && r!.confidence >= threshold) shown += 1;
    lines.push(
      csvRow([
        o.q.id,
        s?.chapter ?? '',
        s?.title ?? (r ? 'none' : ''),
        r ? r.confidence.toFixed(2) : '',
        s && r!.confidence >= threshold ? 'yes' : s ? 'review' : '',
        r?.concept_name ?? '',
        r?.why ?? '',
        r?.rationale ?? '',
        (o.q.question_text || '').replace(/\s+/g, ' ').slice(0, 160),
        o.error ?? '',
      ]),
    );
  }
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`Report: ${path.resolve(outPath)}`);
  console.log(`Linked: ${linked} (${shown} confident, ${linked - shown} for review) · not covered: ${outcomes.filter((o) => o.result?.foundation_section_id === 'none').length}`);

  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to write.');
    return;
  }

  const now = new Date().toISOString();
  let written = 0;
  for (const o of outcomes) {
    const r = o.result;
    if (!r || r.foundation_section_id === 'none') continue;
    const { error } = await db.from('nexus_qb_question_study').upsert(
      {
        question_id: o.q.id,
        primary_slug: currentChapters(o.q.categories)[0] ?? null,
        also_uses: [],
        concepts: [{ name: r.concept_name, ...(r.why ? { why: r.why } : {}), foundation_section_id: r.foundation_section_id }],
        source: 'ai',
        model: resultsDir ? fileModel : model,
        confidence: r.confidence,
        rationale: r.rationale,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      },
      { onConflict: 'question_id' },
    );
    if (error) console.error(`  study row ${o.q.id}: ${error.message}`);
    else written += 1;
  }
  console.log(`Done. ${written} Foundation links written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
