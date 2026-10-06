/**
 * AI Tutor concept graph: turns the free-text concept names in
 * nexus_qb_question_study into one set of concepts per maths chapter, with
 * prerequisites, and maps every maths question to them.
 *
 * The concepts are written by Claude Code subagents (Max plan, no API calls),
 * the same export, results, apply pipeline as qb-classify-study.ts:
 *
 * Usage (from scripts/):
 *   npx tsx qb-concepts.ts --env-file ../.env.production --export <dir>
 *     writes <dir>/system.md (the prompt and the reply format) and one
 *     <dir>/batch-NN-<chapter>.json per maths chapter (names, counts, samples).
 *   ...a subagent per batch writes <dir>/results-<chapter>.json...
 *   npx tsx qb-concepts.ts --env-file ../.env.production --results <dir> --dry-run [--out concepts.csv]
 *   npx tsx qb-concepts.ts --env-file ../.env.production --results <dir> --apply
 *
 * Before anything is written, every exported name must be mapped, moved or
 * dropped exactly once, every chapter must exist, and the prerequisites must
 * form a DAG. --apply then:
 *   - upserts nexus_concepts by slug (concepts a teacher wrote or reviewed are left alone);
 *   - replaces nexus_concept_prereqs for the concepts it wrote;
 *   - upserts nexus_qb_question_concepts with source 'alias', never touching
 *     rows with source 'pack' or 'staff', and removes alias rows that no longer map.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or --env-file.
 * The target database is printed before anything runs.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildConceptBatches,
  buildConceptSystemPrompt,
  collectConceptResults,
  conceptOutputInstructions,
  conceptReportCsv,
  mapQuestionsToConcepts,
  validateConceptResults,
  type ChapterTag,
  type StudyRow,
} from './lib/qb-concepts';
import type { NcertOption } from './lib/qb-study-classify';

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const USAGE = `Usage (from scripts/):
  npx tsx qb-concepts.ts --env-file <file> --export <dir>
  npx tsx qb-concepts.ts --env-file <file> --results <dir> --dry-run [--out concepts.csv]
  npx tsx qb-concepts.ts --env-file <file> --results <dir> --apply`;

const apply = flag('apply');
const exportDir = opt('export');
const resultsDir = opt('results');
const envFile = opt('env-file');
const outPath = opt('out') || `qb-concepts-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.csv`;

const MATH_ROOTS = ['algebra', 'coordinate_geometry', 'calculus', 'trigonometry', 'vectors_and_3d_geometry', 'probability_and_statistics'];

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

// ── Loads ────────────────────────────────────────────────────────────────────
/** Maths chapter tags in syllabus order (root order, then sort_order). */
async function loadChapters(db: SupabaseClient): Promise<ChapterTag[]> {
  const { data: tags, error } = await db
    .from('nexus_qb_tags')
    .select('id, slug, label, parent_id, sort_order')
    .eq('group_type', 'subject')
    .eq('is_active', true);
  if (error) throw error;
  const byId = new Map(tags!.map((t) => [t.id, t]));
  return tags!
    .filter((t) => t.parent_id && MATH_ROOTS.includes(byId.get(t.parent_id)?.slug))
    .sort(
      (a, b) =>
        MATH_ROOTS.indexOf(byId.get(a.parent_id)!.slug) - MATH_ROOTS.indexOf(byId.get(b.parent_id)!.slug) ||
        a.sort_order - b.sort_order,
    )
    .map((t) => ({ id: t.id, slug: t.slug, label: t.label, group: byId.get(t.parent_id)!.label }));
}

async function loadNcert(db: SupabaseClient): Promise<NcertOption[]> {
  const { data, error } = await db
    .from('nexus_ncert_sections')
    .select('ref, class_level, chapter_no, chapter_title, section_no, section_title, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return (data || []).map((r) => ({
    ref: r.ref,
    label: `Class ${r.class_level} Ch ${r.chapter_no} ${r.chapter_title}${r.section_no ? `, ${r.section_no} ${r.section_title}` : ''}`,
  }));
}

async function loadStudy(db: SupabaseClient): Promise<StudyRow[]> {
  return readAll<StudyRow>((from, to) =>
    db.from('nexus_qb_question_study').select('question_id, primary_slug, also_uses, concepts').order('question_id').range(from, to) as any,
  );
}

async function loadQuestionTexts(db: SupabaseClient, ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const part of chunks(ids, 100)) {
    const { data, error } = await db.from('nexus_qb_questions').select('id, question_text').in('id', part);
    if (error) throw error;
    for (const r of data || []) out.set(r.id, r.question_text);
  }
  return out;
}

function loadResultFiles(dir: string): unknown[] {
  const files = readdirSync(dir).filter((n) => /^results-.*\.json$/.test(n)).sort();
  console.log(`Loaded ${files.length} results files from ${dir}`);
  return files.map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (flag('help') || (!exportDir && !resultsDir)) {
    console.log(USAGE);
    return;
  }
  if (apply && flag('dry-run')) throw new Error('Pick one of --dry-run and --apply');
  const db = client();
  console.log(`Concepts · ${exportDir ? `export to ${exportDir}` : `results from ${resultsDir}`} · ${apply ? 'APPLY' : 'dry run'}`);

  const chapters = await loadChapters(db);
  const mathChapters = new Set(chapters.map((c) => c.slug));
  const study = await loadStudy(db);
  const mathStudy = study.filter((s) => s.primary_slug && mathChapters.has(s.primary_slug));
  const texts = await loadQuestionTexts(db, mathStudy.map((s) => s.question_id));
  const batches = buildConceptBatches(chapters, mathStudy, texts);
  const nameCount = batches.reduce((n, b) => n + b.names.length, 0);
  console.log(`${chapters.length} maths chapters · ${mathStudy.length} classified questions · ${nameCount} chapter names in ${batches.length} batches`);

  if (exportDir) {
    const ncert = await loadNcert(db);
    mkdirSync(exportDir, { recursive: true });
    writeFileSync(path.join(exportDir, 'system.md'), `${buildConceptSystemPrompt(chapters, ncert)}\n\n${conceptOutputInstructions()}`, 'utf8');
    batches.forEach((b, i) => {
      writeFileSync(path.join(exportDir, `batch-${String(i + 1).padStart(2, '0')}-${b.chapter.slug}.json`), JSON.stringify(b, null, 1), 'utf8');
    });
    console.log(`Exported ${batches.length} chapter batches to ${path.resolve(exportDir)}`);
    return;
  }

  // Results: validate everything before any write.
  const results = collectConceptResults(loadResultFiles(resultsDir!));
  const { data: existingRows, error: exErr } = await db.from('nexus_concepts').select('id, slug, source, reviewed_at');
  // A dry run can check the results before the migration exists; an apply cannot.
  if (exErr && (apply || !/schema cache|does not exist/i.test(exErr.message))) {
    throw new Error(`nexus_concepts missing? Apply migration 20261108090000 first. ${exErr.message}`);
  }
  if (exErr) console.log('  note: nexus_concepts does not exist yet; checking as if it were empty (dry run only)');
  const ncertRefs = new Set((await loadNcert(db)).map((n) => n.ref));
  const v = validateConceptResults(batches, results, chapters, { existingSlugs: new Set((existingRows || []).map((r) => r.slug)), ncertRefs });
  const mapping = mapQuestionsToConcepts(mathStudy, v.concepts, mathChapters, v.dropped);

  writeFileSync(outPath, conceptReportCsv(v, results, mapping), 'utf8');
  console.log(`Report: ${path.resolve(outPath)}`);
  const perChapter = new Map<string, number>();
  for (const c of v.concepts) perChapter.set(c.chapter, (perChapter.get(c.chapter) || 0) + 1);
  const mappedQs = new Set(mapping.rows.map((r) => r.question_id)).size;
  console.log(`Concepts: ${v.concepts.length} in ${perChapter.size} chapters · dropped names: ${v.dropped.size}`);
  console.log(`Question links: ${mapping.rows.length} (${mapping.rows.filter((r) => r.role === 'core').length} core) over ${mappedQs}/${mathStudy.length} questions · unmapped names: ${mapping.unmapped.length}`);
  for (const w of v.warnings) console.log(`  warning: ${w}`);
  for (const e of v.errors.slice(0, 60)) console.error(`  ERROR: ${e}`);
  if (v.errors.length > 60) console.error(`  ...and ${v.errors.length - 60} more errors`);

  if (!v.ok) {
    console.error(`${v.errors.length} errors. Nothing written. Fix the results files and run again.`);
    process.exit(1);
  }
  if (!apply) {
    console.log('Dry run: nothing written. Review the CSV, then re-run with --apply to write.');
    return;
  }

  // Write: concepts (skipping teacher-owned ones), then prerequisites, then question links.
  const now = new Date().toISOString();
  const chapterId = new Map(chapters.map((c) => [c.slug, c.id]));
  const protectedSlugs = new Set(existingRows!.filter((r) => r.source === 'staff' || r.reviewed_at).map((r) => r.slug));
  const toWrite = v.concepts.filter((c) => !protectedSlugs.has(c.slug));
  if (protectedSlugs.size) console.log(`  ${v.concepts.length - toWrite.length} concepts left alone (written or reviewed by a teacher)`);
  for (const part of chunks(toWrite, 200)) {
    const { error } = await db.from('nexus_concepts').upsert(
      part.map((c) => ({
        slug: c.slug,
        label: c.label,
        chapter_tag_id: chapterId.get(c.chapter)!,
        ncert_ref: c.ncert_ref,
        summary: c.summary,
        aliases: c.aliases,
        sort_order: c.sort_order,
        is_active: true,
        source: 'ai',
        updated_at: now,
      })),
      { onConflict: 'slug' },
    );
    if (error) throw error;
  }
  console.log(`  concepts upserted: ${toWrite.length}`);

  const { data: allConcepts, error: allErr } = await db.from('nexus_concepts').select('id, slug');
  if (allErr) throw allErr;
  const idOf = new Map(allConcepts!.map((c) => [c.slug, c.id as string]));

  const writtenIds = toWrite.map((c) => idOf.get(c.slug)!);
  for (const part of chunks(writtenIds, 100)) {
    const { error } = await db.from('nexus_concept_prereqs').delete().in('concept_id', part);
    if (error) throw error;
  }
  const edges = toWrite.flatMap((c) => c.requires.map((r) => ({ concept_id: idOf.get(c.slug)!, requires_id: idOf.get(r)! })));
  for (const part of chunks(edges, 500)) {
    const { error } = await db.from('nexus_concept_prereqs').insert(part);
    if (error) throw error;
  }
  console.log(`  prerequisites replaced: ${edges.length} edges`);

  // Question links: never overwrite a 'pack' or 'staff' row.
  const existingLinks = await readAll<{ question_id: string; concept_id: string; source: string }>((from, to) =>
    db.from('nexus_qb_question_concepts').select('question_id, concept_id, source').order('question_id').order('concept_id').range(from, to) as any,
  );
  const owned = new Set(existingLinks.filter((r) => r.source !== 'alias').map((r) => `${r.question_id}|${r.concept_id}`));
  const links = mapping.rows
    .map((r) => ({ question_id: r.question_id, concept_id: idOf.get(r.slug)!, role: r.role, source: 'alias' }))
    .filter((r) => r.concept_id && !owned.has(`${r.question_id}|${r.concept_id}`));
  for (const part of chunks(links, 500)) {
    const { error } = await db.from('nexus_qb_question_concepts').upsert(part, { onConflict: 'question_id,concept_id' });
    if (error) throw error;
  }
  const keep = new Set(links.map((r) => `${r.question_id}|${r.concept_id}`));
  const stale = existingLinks.filter((r) => r.source === 'alias' && !keep.has(`${r.question_id}|${r.concept_id}`));
  for (const r of stale) {
    const { error } = await db
      .from('nexus_qb_question_concepts')
      .delete()
      .eq('question_id', r.question_id)
      .eq('concept_id', r.concept_id)
      .eq('source', 'alias');
    if (error) throw error;
  }
  console.log(`  question links upserted: ${links.length} · stale alias links removed: ${stale.length} · skipped (pack or staff): ${mapping.rows.length - links.length}`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
