/**
 * QB Coordinate-Geometry Sub-Topic Proposal Script
 *
 * Splits the single `conic_sections` bucket into parabola / ellipse / hyperbola
 * and finds the `locus` and `areas_of_triangles` questions hiding inside
 * straight_lines and circles.
 *
 * This script NEVER writes nexus_qb_questions. It writes rows to
 * nexus_qb_category_proposals, which a teacher reviews and approves at
 * /teacher/question-bank/reclassify. Applying is done by the
 * nexus_qb_apply_category_proposals RPC, which updates categories[] and
 * nexus_qb_question_tags together (nothing else keeps those two in sync).
 *
 * A deterministic keyword + equation-shape pass runs first. Measured against
 * the live bank it resolves every one of the 20 active conic_sections
 * questions, so the AI pass is a fallback for whatever it cannot name, not the
 * main engine. Use --no-ai to skip the API entirely.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx qb-propose-subtopics.ts --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx qb-propose-subtopics.ts --dry-run --no-ai
 *   SUPABASE_SERVICE_ROLE_KEY=... ANTHROPIC_API_KEY=sk-... npx tsx qb-propose-subtopics.ts --apply
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { classifyCoordinateGeometry } from '../apps/nexus/src/lib/qb-subtopic-rules';

// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.neramclasses.com';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const BATCH_SIZE = 10;
const BATCH_PAUSE_MS = 300;

/**
 * Scope. Deliberately NOT bare `mathematics`: that would pull in
 * complex-numbers, determinants and 3D-geometry questions which legitimately
 * say "locus" or "area of a triangle" without being coordinate geometry. The
 * bare-`mathematics` questions with no sub-topic are all inactive anyway.
 */
const SCOPE_CATEGORIES = ['conic_sections', 'straight_lines', 'circles'];

const VALID_SLUGS = ['parabola', 'ellipse', 'hyperbola', 'locus', 'areas_of_triangles'];

const AI_SYSTEM_PROMPT = `You classify JEE Paper 2 coordinate geometry questions into sub-topics.

Reply with ONLY a comma-separated list drawn from this vocabulary, or the single word NONE:
parabola, ellipse, hyperbola, locus, areas_of_triangles

Rules:
- A question can have more than one, e.g. "the locus of the midpoints of chords of the parabola" is "locus, parabola".
- x^2 + y^2 = r^2 with equal coefficients is a CIRCLE. Do not call it an ellipse.
- Use areas_of_triangles only when the question asks for the area of a triangle in the coordinate plane.
- Reply NONE if none apply. No explanation, no punctuation beyond the commas.`;

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--apply');
const noAi = args.includes('--no-ai');
/**
 * Include draft / inactive questions.
 *
 * Needed before `conic_sections` can be retired: a draft still carrying it
 * would disappear from the Category filter the moment it is published, because
 * the counts RPC only walks active tags.
 */
const includeDrafts = args.includes('--include-drafts');

interface QuestionRow {
  id: string;
  question_text: string | null;
  categories: string[];
}

interface Proposal {
  question_id: string;
  current_categories: string[];
  proposed_add: string[];
  proposed_remove: string[];
  source: 'keyword' | 'ai' | 'manual';
  confidence: number | null;
  rationale: string | null;
}

function getClients() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
  return { supabase, anthropic };
}

/** Page through the in-scope active questions. */
async function fetchScopedQuestions(supabase: ReturnType<typeof createClient>): Promise<QuestionRow[]> {
  const PAGE = 1000;
  const all: QuestionRow[] = [];
  let offset = 0;
  while (true) {
    let q = supabase
      .from('nexus_qb_questions')
      .select('id, question_text, categories')
      .overlaps('categories', SCOPE_CATEGORIES)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (!includeDrafts) q = q.eq('is_active', true).eq('status', 'active');
    const { data, error } = await q;
    if (error) throw error;
    all.push(...((data || []) as unknown as QuestionRow[]));
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function classifyWithAI(anthropic: Anthropic, questionText: string): Promise<string[] | null> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      system: AI_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Classify this coordinate geometry question:\n\n${questionText.slice(0, 800)}`,
        },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;

    const raw = block.text.trim();
    if (/^none$/i.test(raw)) return [];

    // Validate against the vocabulary; the model occasionally invents a slug.
    const slugs = raw
      .split(',')
      .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter((s) => VALID_SLUGS.includes(s));
    return [...new Set(slugs)];
  } catch (err) {
    console.warn(`  AI classification failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function buildProposal(q: QuestionRow, add: string[], source: Proposal['source'], rationale: string): Proposal | null {
  const current = new Set(q.categories || []);
  const genuinelyNew = add.filter((s) => !current.has(s));

  // Only remove conic_sections if a specific conic is being added or is already
  // present alongside one.
  const conicResolved = [...genuinelyNew, ...add].some((s) =>
    ['parabola', 'ellipse', 'hyperbola'].includes(s),
  );
  const remove = conicResolved && current.has('conic_sections') ? ['conic_sections'] : [];

  if (genuinelyNew.length === 0 && remove.length === 0) return null;

  return {
    question_id: q.id,
    current_categories: q.categories || [],
    proposed_add: genuinelyNew,
    proposed_remove: remove,
    source,
    confidence: source === 'keyword' ? 0.95 : 0.7,
    rationale,
  };
}

async function main() {
  console.log('QB Coordinate-Geometry Sub-Topic Proposals');
  console.log('='.repeat(50));
  console.log(`Mode: ${dryRun ? 'DRY RUN (nothing written)' : 'APPLY (writing proposals)'}`);
  console.log(`AI fallback: ${noAi ? 'disabled (--no-ai)' : ANTHROPIC_API_KEY ? 'enabled' : 'unavailable (no ANTHROPIC_API_KEY)'}\n`);

  const { supabase, anthropic } = getClients();

  const questions = await fetchScopedQuestions(supabase);
  console.log(
    `Scanned ${questions.length} ${includeDrafts ? 'questions (drafts included)' : 'active questions'} in ${SCOPE_CATEGORIES.join(' / ')}\n`,
  );

  const proposals: Proposal[] = [];
  const residual: QuestionRow[] = [];

  // ── Pass 1: deterministic ────────────────────────────────────────────────
  for (const q of questions) {
    const match = classifyCoordinateGeometry(q.question_text);
    if (match.add.length === 0) {
      // Only conic_sections questions are worth an AI second opinion. A
      // straight_lines question with no locus/area signal is correctly tagged.
      if ((q.categories || []).includes('conic_sections')) residual.push(q);
      continue;
    }
    const p = buildProposal(q, match.add, 'keyword', match.hits.join(', '));
    if (p) proposals.push(p);
  }

  console.log(`Keyword pass: ${proposals.length} proposals, ${residual.length} unresolved conics`);

  // ── Pass 2: AI, for whatever the rules could not name ────────────────────
  if (residual.length > 0 && !noAi && anthropic) {
    console.log(`\nAI pass over ${residual.length} questions...`);
    for (let i = 0; i < residual.length; i += BATCH_SIZE) {
      const batch = residual.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (q) => ({
          q,
          slugs: q.question_text ? await classifyWithAI(anthropic, q.question_text) : null,
        })),
      );
      for (const { q, slugs } of results) {
        if (!slugs || slugs.length === 0) continue;
        const p = buildProposal(q, slugs, 'ai', 'claude-haiku classification');
        if (p) proposals.push(p);
      }
      console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(residual.length / BATCH_SIZE)} done`);
      if (i + BATCH_SIZE < residual.length) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  } else if (residual.length > 0) {
    console.log(`\nSkipping AI pass. ${residual.length} conic questions left unproposed.`);
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const tally: Record<string, number> = {};
  for (const p of proposals) for (const s of p.proposed_add) tally[s] = (tally[s] || 0) + 1;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total proposals: ${proposals.length}`);
  for (const [slug, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${slug.padEnd(20)} ${n}`);
  }
  const removing = proposals.filter((p) => p.proposed_remove.length > 0).length;
  console.log(`  ${'(drops conic_sections)'.padEnd(20)} ${removing}`);

  if (dryRun) {
    console.log('\nDry run: nothing written. Re-run with --apply to stage these for review.');
    console.log('\nSample:');
    for (const p of proposals.slice(0, 5)) {
      console.log(`  + ${p.proposed_add.join(', ')}${p.proposed_remove.length ? `  - ${p.proposed_remove.join(', ')}` : ''}   [${p.rationale}]`);
    }
    return;
  }

  if (proposals.length === 0) {
    console.log('\nNothing to write.');
    return;
  }

  const runId = randomUUID();
  const rows = proposals.map((p) => ({ ...p, run_id: runId }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase
      .from('nexus_qb_category_proposals')
      .upsert(rows.slice(i, i + 200), { onConflict: 'run_id,question_id' });
    if (error) throw error;
  }

  console.log(`\nStaged ${rows.length} proposals under run ${runId}.`);
  console.log('Review and approve at /teacher/question-bank/reclassify. Nothing is live until you do.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
