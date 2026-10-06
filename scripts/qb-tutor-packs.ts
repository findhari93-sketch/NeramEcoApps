/**
 * AI Tutor packs: one teaching pack per maths question (steps with checks, a
 * 4-level hint ladder, the mistake each wrong answer reveals, the final
 * answer), written offline by Claude Code subagents on the Max plan and
 * checked against the stored answer key before a student can be taught from it.
 *
 * Same export, results, apply pipeline as qb-classify-study.ts. Run
 * qb-concepts.ts first: packs name concepts by slug.
 *
 * Usage (from scripts/):
 *   npx tsx qb-tutor-packs.ts --env-file ../.env.production --export <dir> [--only-missing] [--ids a,b] [--limit N] [--batch-size 20]
 *     writes <dir>/system.md (the prompt and the reply format), <dir>/batch-NN.json
 *     and <dir>/batch-gold.json (the gold questions in scripts/fixtures/qb-tutor-gold.json).
 *   ...a subagent per batch writes <dir>/results-NN.json (and results-gold.json)...
 *   npx tsx qb-tutor-packs.ts --env-file ../.env.production --results <dir> --gold
 *   npx tsx qb-tutor-packs.ts --env-file ../.env.production --results <dir> --dry-run --out report.csv
 *   npx tsx qb-tutor-packs.ts --env-file ../.env.production --results <dir> --apply
 *
 * Every pack goes through verifyPack (apps/nexus/src/lib/assistant/tutor/pack.ts)
 * with the question bank's maths reader. --apply inserts a new version per
 * question: a 'verified' pack first retires the live one; anything else is
 * stored as 'draft' and never served. Verified packs then write their concepts
 * to nexus_qb_question_concepts (source 'pack'; 'staff' rows are never touched).
 * A pack a teacher reviewed for the question as it stands is never replaced.
 *
 * Before --apply the gold set runs and the run stops below 90%. With an empty
 * gold set, --apply needs --skip-gold.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or --env-file.
 * The target database is printed before anything runs.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACK_REPORT_HEADER,
  buildPackExportItem,
  buildTutorSystemPrompt,
  checkPackResult,
  collectPackResults,
  packReportRow,
  planPackWrite,
  scoreTutorGold,
  tutorOutputInstructions,
  type ConceptOption,
  type ExistingPackRow,
  type PackOutcome,
  type PackSourceQuestion,
  type TutorGoldItem,
} from './lib/qb-tutor-pack';
import { csvRow, currentChapters } from './lib/qb-study-classify';
import type { TutorPack } from '../apps/nexus/src/lib/assistant/tutor/pack';

const here = path.dirname(fileURLToPath(import.meta.url));

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const USAGE = `Usage (from scripts/):
  npx tsx qb-tutor-packs.ts --env-file <file> --export <dir> [--only-missing] [--ids a,b] [--limit N] [--batch-size 20]
  npx tsx qb-tutor-packs.ts --env-file <file> --results <dir> --gold
  npx tsx qb-tutor-packs.ts --env-file <file> --results <dir> --dry-run --out report.csv
  npx tsx qb-tutor-packs.ts --env-file <file> --results <dir> --apply [--skip-gold]`;

const apply = flag('apply');
const goldOnly = flag('gold');
const skipGold = flag('skip-gold');
const onlyMissing = flag('only-missing');
const ids = opt('ids')?.split(',').map((s) => s.trim()).filter(Boolean);
const limit = opt('limit') ? Number(opt('limit')) : undefined;
const exportDir = opt('export');
const resultsDir = opt('results');
const batchSize = opt('batch-size') ? Number(opt('batch-size')) : 20;
const envFile = opt('env-file');
const fileModel = opt('model') || 'claude-opus-5-5 (Claude Code)';
const GENERATOR = 'claude-code-subagent';
const outPath = opt('out') || `qb-tutor-packs-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;
const GOLD_FILE = path.join(here, 'fixtures/qb-tutor-gold.json');
const GOLD_MIN_SCORE = 0.9;

const MATH_ROOTS = ['algebra', 'coordinate_geometry', 'calculus', 'trigonometry', 'vectors_and_3d_geometry', 'probability_and_statistics'];
const MATH_SECTIONS = ['math_mcq', 'math_numerical'];
const TAUGHT_FORMATS = new Set(['MCQ', 'NUMERICAL']);

// ── Clients ──────────────────────────────────────────────────────────────────
function loadEnvFile(file: string) {
  for (const line of readFileSync(path.resolve(file), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

function client(): SupabaseClient {
  if (envFile) loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.neramclasses.com';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  console.log(`Database: ${url}${envFile ? ` (from ${envFile})` : ''}`);
  return createClient(url, key);
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

const chunks = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** The gold list, or null when the file is missing or has no items. */
function loadGold(): TutorGoldItem[] | null {
  if (!existsSync(GOLD_FILE)) return null;
  const items = JSON.parse(readFileSync(GOLD_FILE, 'utf8'))?.items;
  return Array.isArray(items) && items.length ? (items as TutorGoldItem[]) : null;
}

// ── Loads ────────────────────────────────────────────────────────────────────
type Question = PackSourceQuestion & { section: string | null; categories: string[]; is_active: boolean; status: string };
const Q_COLS =
  'id, question_format, section, question_text, question_image_url, options, correct_answer, answer_tolerance, difficulty, explanation_brief, explanation_detailed, categories, is_active, status';

const isTaught = (q: Question) => q.is_active && q.status === 'active' && MATH_SECTIONS.includes(q.section ?? '') && TAUGHT_FORMATS.has(q.question_format);

async function loadQuestions(db: SupabaseClient, onlyIds?: string[]): Promise<Question[]> {
  if (onlyIds) {
    const out: Question[] = [];
    for (const part of chunks(onlyIds, 100)) {
      const { data, error } = await db.from('nexus_qb_questions').select(Q_COLS).in('id', part);
      if (error) throw error;
      out.push(...((data || []) as Question[]));
    }
    return out.filter(isTaught);
  }
  const rows = await readAll<Question>((from, to) =>
    db
      .from('nexus_qb_questions')
      .select(Q_COLS)
      .eq('is_active', true)
      .eq('status', 'active')
      .in('section', MATH_SECTIONS)
      .order('id')
      .range(from, to) as any,
  );
  return rows.filter(isTaught);
}

async function loadConceptGraph(db: SupabaseClient) {
  const { data: tags, error: tErr } = await db.from('nexus_qb_tags').select('id, slug, parent_id').eq('group_type', 'subject');
  if (tErr) throw tErr;
  const tagById = new Map(tags!.map((t) => [t.id, t]));
  const mathChapters = new Set(
    tags!.filter((t) => t.parent_id && MATH_ROOTS.includes(tagById.get(t.parent_id)?.slug)).map((t) => t.slug as string),
  );
  const { data: rows, error } = await db.from('nexus_concepts').select('id, slug, label, summary, chapter_tag_id, sort_order, is_active').order('sort_order');
  if (error) throw new Error(`nexus_concepts missing? Apply migration 20261108090000 first. ${error.message}`);
  const active = (rows || []).filter((r) => r.is_active !== false);
  const concepts: ConceptOption[] = active.map((r) => ({ slug: r.slug, label: r.label, summary: r.summary, chapter: tagById.get(r.chapter_tag_id)?.slug ?? '' }));
  const slugById = new Map((rows || []).map((r) => [r.id, r.slug as string]));
  const idBySlug = new Map((rows || []).map((r) => [r.slug as string, r.id as string]));
  const edges = await readAll<{ concept_id: string; requires_id: string }>((from, to) =>
    db.from('nexus_concept_prereqs').select('concept_id, requires_id').order('concept_id').range(from, to) as any,
  );
  const prereqs = edges
    .map((e) => [slugById.get(e.concept_id), slugById.get(e.requires_id)] as [string, string])
    .filter(([a, b]) => a && b);
  return { concepts, prereqs, known: new Set(concepts.map((c) => c.slug)), idBySlug, mathChapters };
}

async function loadStudy(db: SupabaseClient, qids: string[]) {
  const out = new Map<string, { primary_slug: string | null; also_uses: string[] }>();
  for (const part of chunks(qids, 100)) {
    const { data, error } = await db.from('nexus_qb_question_study').select('question_id, primary_slug, also_uses').in('question_id', part);
    if (error) throw error;
    for (const r of data || []) out.set(r.question_id, { primary_slug: r.primary_slug, also_uses: r.also_uses || [] });
  }
  return out;
}

async function loadPackRows(db: SupabaseClient, qids: string[]): Promise<Map<string, ExistingPackRow[]>> {
  const out = new Map<string, ExistingPackRow[]>();
  for (const part of chunks(qids, 100)) {
    const { data, error } = await db.from('nexus_qb_tutor_packs').select('id, question_id, version, status, source_checksum').in('question_id', part);
    if (error) throw new Error(`nexus_qb_tutor_packs missing? Apply migration 20261108090100 first. ${error.message}`);
    for (const r of data || []) out.set(r.question_id, [...(out.get(r.question_id) || []), r as ExistingPackRow]);
  }
  return out;
}

function loadJsonFiles(dir: string, re: RegExp): unknown[] {
  return readdirSync(dir)
    .filter((n) => re.test(n))
    .sort()
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (flag('help') || (!exportDir && !resultsDir)) {
    console.log(USAGE);
    return;
  }
  if (apply && (flag('dry-run') || goldOnly)) throw new Error('--apply cannot be combined with --dry-run or --gold');
  const db = client();
  const runId = randomUUID();
  console.log(`Tutor packs · ${exportDir ? `export to ${exportDir}` : `results from ${resultsDir}`} · ${apply ? 'APPLY' : goldOnly ? 'gold check' : 'dry run'} · run ${runId}`);

  const graph = await loadConceptGraph(db);
  console.log(`Concepts: ${graph.known.size} · prerequisite edges: ${graph.prereqs.length}`);

  if (exportDir) return runExport(db, graph);
  return runResults(db, graph, runId);
}

async function runExport(db: SupabaseClient, graph: Awaited<ReturnType<typeof loadConceptGraph>>) {
  if (graph.known.size === 0) {
    console.error('nexus_concepts is empty. Run qb-concepts.ts (export, results, --apply) first: packs name concepts by slug.');
    process.exit(1);
  }
  const gold = loadGold() ?? [];
  const goldIds = new Set(gold.map((g) => g.question_id));
  let questions = await loadQuestions(db, ids);
  if (onlyMissing) {
    const packs = await loadPackRows(db, questions.map((q) => q.id));
    const before = questions.length;
    questions = questions.filter((q) => !(packs.get(q.id) || []).some((p) => p.status === 'verified' || p.status === 'reviewed'));
    console.log(`--only-missing: ${before - questions.length} questions already have a live pack`);
  }
  if (limit) questions = questions.slice(0, limit);
  const goldQs = gold.length ? await loadQuestions(db, [...goldIds]) : [];
  const all = [...questions, ...goldQs];
  const study = await loadStudy(db, all.map((q) => q.id));

  const toItem = (q: Question) => {
    const s = study.get(q.id);
    const primary = s?.primary_slug ?? currentChapters(q.categories).find((c) => graph.mathChapters.has(c)) ?? null;
    return buildPackExportItem(q, primary, s?.also_uses ?? [], graph.concepts, graph.prereqs);
  };

  mkdirSync(exportDir!, { recursive: true });
  writeFileSync(path.join(exportDir!, 'system.md'), `${buildTutorSystemPrompt()}\n\n${tutorOutputInstructions()}`, 'utf8');
  if (goldQs.length) writeFileSync(path.join(exportDir!, 'batch-gold.json'), JSON.stringify(goldQs.map(toItem), null, 1), 'utf8');
  // Questions with no classified chapter get no concept menu; they go in their own
  // batch, with the whole concept list in concepts-all.json to choose from.
  const allRegular = questions.filter((q) => !goldIds.has(q.id));
  const unclassified = allRegular.filter((q) => toItem(q).concepts.length === 0);
  const regular = allRegular.filter((q) => toItem(q).concepts.length > 0);
  let n = 0;
  for (let i = 0; i < regular.length; i += batchSize) {
    n += 1;
    writeFileSync(path.join(exportDir!, `batch-${String(n).padStart(2, '0')}.json`), JSON.stringify(regular.slice(i, i + batchSize).map(toItem), null, 1), 'utf8');
  }
  let u = 0;
  for (let i = 0; i < unclassified.length; i += batchSize) {
    u += 1;
    writeFileSync(path.join(exportDir!, `batch-unclassified-${String(u).padStart(2, '0')}.json`), JSON.stringify(unclassified.slice(i, i + batchSize).map(toItem), null, 1), 'utf8');
  }
  if (unclassified.length) {
    const catalogue = graph.concepts.map((c) => ({ slug: c.slug, label: c.label }));
    writeFileSync(path.join(exportDir!, 'concepts-all.json'), JSON.stringify(catalogue, null, 1), 'utf8');
  }
  console.log(`Exported ${regular.length} questions in ${n} batches${goldQs.length ? ` + ${goldQs.length} gold` : ''} to ${path.resolve(exportDir!)}`);
  if (unclassified.length) console.log(`  ${unclassified.length} questions with no classified chapter in ${u} batch-unclassified-NN.json files: choose their concepts from concepts-all.json`);
}

async function runResults(db: SupabaseClient, graph: Awaited<ReturnType<typeof loadConceptGraph>>, runId: string) {
  if (graph.known.size === 0) {
    if (apply) {
      console.error('nexus_concepts is empty. Run qb-concepts.ts --apply first. Nothing written.');
      process.exit(1);
    }
    console.log('  warning: nexus_concepts is empty, so concept slugs are NOT checked in this run. Run qb-concepts.ts first.');
  }

  const fromFile = collectPackResults(loadJsonFiles(resultsDir!, /^results-.*\.json$/));
  console.log(`Loaded ${fromFile.size} packs from ${resultsDir}`);
  const doubts = loadJsonFiles(resultsDir!, /^doubts-.*\.json$/).flatMap((f) => (Array.isArray(f) ? f : []));
  for (const d of doubts as Array<{ question_id?: string; reason?: string }>) console.log(`  key doubt ${d.question_id}: ${d.reason}`);

  const questions = await loadQuestions(db, [...fromFile.keys()]);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const unknown = [...fromFile.keys()].filter((id) => !byId.has(id));
  if (unknown.length) console.log(`  ${unknown.length} results are not active maths questions and are ignored: ${unknown.slice(0, 5).join(', ')}`);

  const outcomes = new Map<string, PackOutcome>();
  for (const [id, raw] of fromFile) {
    const q = byId.get(id);
    if (q) outcomes.set(id, checkPackResult(id, raw, q, graph.known));
  }

  // Gold first: on its own with --gold, and before any --apply.
  if (goldOnly || apply) {
    const gold = loadGold();
    if (!gold && skipGold && !goldOnly) {
      console.log('Gold check skipped (--skip-gold, and the gold set has no items).');
    } else if (!gold) {
      console.error(`The gold set (${GOLD_FILE}) is missing or has no items. Add about 20 hand-checked questions to "items",`);
      console.error('or pass --skip-gold to apply without the gold check.');
      process.exit(1);
    } else if (!skipGold || goldOnly) {
      const s = scoreTutorGold(gold, outcomes);
      console.log(`Gold: ${s.correct}/${s.total} (${Math.round(s.score * 100)}%)`);
      for (const m of s.misses) console.log(`  miss ${m.id}: ${m.why}`);
      if (goldOnly) return;
      if (s.score < GOLD_MIN_SCORE) {
        console.error(`Below ${GOLD_MIN_SCORE * 100}%. Nothing written. Fix the prompt, the packs or the gold set first.`);
        process.exit(1);
      }
    }
  }

  let selected = [...outcomes.values()];
  if (ids) selected = selected.filter((o) => ids.includes(o.questionId));
  if (limit) selected = selected.slice(0, limit);

  // Report
  const lines = [csvRow(PACK_REPORT_HEADER)];
  for (const o of selected) {
    const q = byId.get(o.questionId)!;
    lines.push(csvRow(packReportRow(o, q.question_format, q.question_text)));
  }
  writeFileSync(outPath, lines.join('\n'), 'utf8');
  const verified = selected.filter((o) => o.status === 'verified').length;
  console.log(`Report: ${path.resolve(outPath)}`);
  console.log(`Packs: ${selected.length} · verified ${verified} (${selected.length ? Math.round((verified / selected.length) * 100) : 0}%) · draft ${selected.length - verified}`);
  const firstErrors = new Map<string, number>();
  for (const o of selected) {
    const e = o.verify_report.errors[0];
    if (e) {
      const k = e.replace(/^step \S+:/, 'step:').replace(/\[\d+\]/g, '[]').replace(/ \S+ (disagrees)/, ' X $1');
      firstErrors.set(k, (firstErrors.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of [...firstErrors].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n} × ${k}`);

  if (!apply) {
    console.log('Dry run: nothing written. Re-run with --apply to write.');
    return;
  }

  // Write
  const now = new Date().toISOString();
  const existing = await loadPackRows(db, selected.map((o) => o.questionId));
  const links = await readAll<{ question_id: string; concept_id: string; source: string }>((from, to) =>
    db.from('nexus_qb_question_concepts').select('question_id, concept_id, source').order('question_id').order('concept_id').range(from, to) as any,
  );
  const linksByQ = new Map<string, Array<{ concept_id: string; source: string }>>();
  for (const l of links) linksByQ.set(l.question_id, [...(linksByQ.get(l.question_id) || []), l]);

  const written = { verified: 0, draft: 0 };
  let skipped = 0;
  let failed = 0;
  for (const o of selected) {
    const rows = existing.get(o.questionId) || [];
    const plan = planPackWrite(o.status, o.source_checksum, rows);
    if (plan.action === 'skip') {
      skipped += 1;
      console.log(`  skip ${o.questionId}: ${plan.reason}`);
      continue;
    }
    // Retire the live pack, then insert; put it back if the insert fails.
    const retired = rows.filter((r) => plan.retire.includes(r.id));
    if (retired.length) {
      const { error } = await db.from('nexus_qb_tutor_packs').update({ status: 'retired', updated_at: now }).in('id', plan.retire);
      if (error) {
        failed += 1;
        console.error(`  retire ${o.questionId}: ${error.message}`);
        continue;
      }
    }
    const { error: insErr } = await db.from('nexus_qb_tutor_packs').insert({
      question_id: o.questionId,
      version: plan.version,
      schema_version: 1,
      status: o.status,
      pack: o.pack ?? {},
      verify_report: o.verify_report,
      source_checksum: o.source_checksum,
      generator: GENERATOR,
      model: fileModel,
      run_id: runId,
    });
    if (insErr) {
      failed += 1;
      console.error(`  insert ${o.questionId}: ${insErr.message}`);
      for (const r of retired) {
        const { error } = await db.from('nexus_qb_tutor_packs').update({ status: r.status, updated_at: now }).eq('id', r.id);
        if (error) console.error(`  RESTORE FAILED for pack ${r.id} (was ${r.status}): ${error.message}`);
      }
      continue;
    }
    written[o.status] += 1;
    if (o.status !== 'verified') continue;

    // The verified pack's concepts win over the alias mapping; staff rows are never touched.
    const current = linksByQ.get(o.questionId) || [];
    const staff = new Set(current.filter((l) => l.source === 'staff').map((l) => l.concept_id));
    const want = ((o.pack as TutorPack).concepts || [])
      .map((c) => ({ question_id: o.questionId, concept_id: graph.idBySlug.get(c.slug), role: c.role, source: 'pack' }))
      .filter((r): r is { question_id: string; concept_id: string; role: 'core' | 'uses'; source: string } => !!r.concept_id && !staff.has(r.concept_id));
    if (want.length) {
      const { error } = await db.from('nexus_qb_question_concepts').upsert(want, { onConflict: 'question_id,concept_id' });
      if (error) console.error(`  concepts ${o.questionId}: ${error.message}`);
    }
    const keep = new Set(want.map((w) => w.concept_id));
    const stale = current.filter((l) => l.source === 'pack' && !keep.has(l.concept_id)).map((l) => l.concept_id);
    if (stale.length) {
      const { error } = await db.from('nexus_qb_question_concepts').delete().eq('question_id', o.questionId).eq('source', 'pack').in('concept_id', stale);
      if (error) console.error(`  stale concepts ${o.questionId}: ${error.message}`);
    }
  }
  console.log(`Done. Written: ${written.verified} verified (now live), ${written.draft} draft · skipped ${skipped} · failed ${failed}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
