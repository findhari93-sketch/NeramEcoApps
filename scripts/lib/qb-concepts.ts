/**
 * Pure parts of scripts/qb-concepts.ts: the per-chapter export batches, the
 * subagent prompt, validation of the concept results, the prerequisite DAG
 * check and the question to concept mapping. No I/O here, so it is unit
 * tested on its own (qb-concepts.test.ts).
 *
 * nexus_qb_question_study.concepts holds free-text names written per
 * question ("Dot product", "scalar product of vectors"). A subagent turns one
 * chapter's names into 6 to 15 concepts with stable slugs; every name is
 * either an alias of one concept, moved to another chapter, or dropped.
 */

import { cleanText, csvRow, type NcertOption } from './qb-study-classify';

export interface ChapterTag {
  id: string;
  slug: string;
  label: string;
  group: string; // the maths root's label, e.g. "Calculus"
}

export interface StudyRow {
  question_id: string;
  primary_slug: string | null;
  also_uses: string[] | null;
  concepts: Array<{ name?: string | null; why?: string | null; ncert_ref?: string | null }> | null;
}

export interface ExportName {
  name: string; // normalised (lower case)
  count: number; // questions that use it in this chapter
  ncert_ref: string | null; // the ref most often given with it
  samples: string[]; // up to 2 question texts, trimmed
}

export interface ConceptBatch {
  chapter: { slug: string; label: string; group: string };
  names: ExportName[];
}

/** One subagent's reply for one chapter. */
export interface ChapterResult {
  chapter: string;
  concepts: Array<{
    slug: string;
    label: string;
    ncert_ref?: string | null;
    summary?: string | null;
    aliases?: string[];
    requires?: string[];
  }>;
  dropped?: Array<{ name: string; reason?: string } | string>;
  /** Names that belong to another chapter: `to` is a chapter slug or a concept slug. */
  moved?: Array<{ name: string; to: string }>;
}

/** A concept ready to write. */
export interface ConceptRow {
  slug: string;
  chapter: string;
  label: string;
  ncert_ref: string | null;
  summary: string | null;
  aliases: string[];
  requires: string[];
  sort_order: number;
}

export interface ConceptValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  concepts: ConceptRow[];
  /** Every name dropped somewhere (normalised). */
  dropped: Set<string>;
  /** Slugs in prerequisite-first order (empty when there is a cycle). */
  order: string[];
  cycles: string[][];
}

export const SLUG_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export function normName(s: string): string {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const sampleText = (s: string | null | undefined, max = 220) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 3)}...` : t;
};

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * One batch per maths chapter that has names. A name counts under the
 * question's primary chapter only, so each (chapter, name) pair is decided once.
 * Chapter order follows `chapters` (syllabus order), names most used first.
 */
export function buildConceptBatches(
  chapters: ChapterTag[],
  study: StudyRow[],
  questionText: Map<string, string | null>,
  samplesPerName = 2,
): ConceptBatch[] {
  const bySlug = new Map(chapters.map((c) => [c.slug, c]));
  const acc = new Map<string, Map<string, { count: number; refs: Map<string, number>; qids: string[] }>>();
  for (const row of study) {
    if (!row.primary_slug || !bySlug.has(row.primary_slug)) continue;
    const names = acc.get(row.primary_slug) ?? new Map();
    acc.set(row.primary_slug, names);
    const seen = new Set<string>();
    for (const c of row.concepts || []) {
      const n = normName(c?.name ?? '');
      if (!n || seen.has(n)) continue;
      seen.add(n);
      const e = names.get(n) ?? { count: 0, refs: new Map<string, number>(), qids: [] };
      e.count += 1;
      if (c?.ncert_ref) e.refs.set(c.ncert_ref, (e.refs.get(c.ncert_ref) || 0) + 1);
      if (e.qids.length < samplesPerName && questionText.get(row.question_id)) e.qids.push(row.question_id);
      names.set(n, e);
    }
  }
  const out: ConceptBatch[] = [];
  for (const ch of chapters) {
    const names = acc.get(ch.slug);
    if (!names || names.size === 0) continue;
    out.push({
      chapter: { slug: ch.slug, label: ch.label, group: ch.group },
      names: [...names]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .map(([name, e]) => ({
          name,
          count: e.count,
          ncert_ref: [...e.refs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
          samples: e.qids.map((id) => sampleText(questionText.get(id))),
        })),
    });
  }
  return out;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

export function buildConceptSystemPrompt(chapters: ChapterTag[], ncert: NcertOption[]): string {
  const chapterLines = chapters.map((c) => `- ${c.slug}: ${c.label} (${c.group})`).join('\n');
  const ncertLines = ncert.map((n) => `- ${n.ref}: ${n.label}`).join('\n');
  return `You are an experienced JEE Main Paper 2 (B.Arch) and NATA mathematics teacher in India, building the concept map an AI tutor uses to track what each student has mastered.

You get ONE chapter of the question bank. For it you get every free-text concept name that teachers and an earlier pass attached to questions of this chapter, with how many questions use it, the NCERT section it was linked to, and up to two sample questions. Many names mean the same idea ("dot product", "scalar product of two vectors", "dot product formula"). Your job is to turn them into a small set of real concepts.

CONCEPTS
- Aim for 6 to 15 concepts for the chapter. A small chapter may need fewer; never more than 15.
- A concept is one teachable idea a student can be checked on in a minute, e.g. "Dot product in components" or "Domain of a square root function". Not a whole chapter ("Vectors"), not a single fact about one question.
- slug: <chapter_slug>.<snake_name>, lower case letters, digits and underscores only, starting with THIS chapter's slug. Example: vector_algebra.dot_product. Slugs are permanent, so make them plain and descriptive.
- label: short and student facing, Title case not required.
- ncert_ref: the most specific NCERT section from the list below that teaches it, or null when NCERT does not teach it.
- summary: ONE sentence a Class 12 student understands, saying what the idea is.
- aliases: the given names this concept covers, copied exactly as given (they are already lower case).
- requires: slugs of the concepts this one directly builds on (its prerequisites), usually in this same chapter. Only direct prerequisites, and no loops (A requires B and B requires A is not allowed). You may name a concept from another chapter only if you were told its exact slug (for example from a results file that already exists in the folder); otherwise leave it out.

EVERY NAME, EXACTLY ONCE
Each given name must appear exactly once in total, in one of three places:
- in the aliases of one of your concepts;
- in "moved", when it clearly belongs to another chapter's idea (e.g. "derivative of sin x" on an applications of derivatives question belongs to differentiation). Give "to" as that chapter's slug, or as a concept slug if you know it exactly. The coordinator makes sure the target chapter adopts it.
- in "dropped", when it is not a concept at all: study advice ("read carefully"), a restatement of one question, or too vague to teach ("basic maths"). Give a short reason.
Do not invent names that were not given, and do not leave any out.

Writing rules for every text you return: plain English, no LaTeX, no em dashes and no double dashes (use commas, colons or parentheses instead).

CHAPTERS (the chapter slugs, for "moved")
${chapterLines}

NCERT SECTIONS (use these refs exactly)
${ncertLines}`;
}

export function conceptOutputInstructions(): string {
  return `REPLY FORMAT
Process each batch-NN-<chapter>.json in the folder and write results-<chapter>.json next to it, holding one JSON object (and nothing else):
{"chapter": "<chapter slug>", "concepts": [{"slug": "<chapter slug>.<snake_name>", "label": "...", "ncert_ref": "<an NCERT ref or null>", "summary": "...", "aliases": ["<given name>"], "requires": ["<concept slug>"]}], "moved": [{"name": "<given name>", "to": "<chapter slug or concept slug>"}], "dropped": [{"name": "<given name>", "reason": "..."}]}
List concepts in teaching order (what is taught first comes first). Batches are numbered in syllabus order, so earlier chapters' results may already exist when you start a later one: read them if you want to name a concept from another chapter in requires or moved.`;
}

// ── Results ──────────────────────────────────────────────────────────────────

/** Each results file holds one chapter object or an array of them. */
export function collectConceptResults(files: unknown[]): ChapterResult[] {
  const out: ChapterResult[] = [];
  for (const f of files) {
    for (const r of Array.isArray(f) ? f : [f]) {
      if (r && typeof r === 'object' && typeof (r as ChapterResult).chapter === 'string') out.push(r as ChapterResult);
    }
  }
  return out;
}

/** Kahn's algorithm. Edges are [concept, requires]. Cycles are found among what is left over. */
export function topoSort(nodes: string[], edges: Array<[string, string]>): { order: string[]; cycles: string[][] } {
  const needs = new Map<string, Set<string>>(nodes.map((n) => [n, new Set()]));
  const neededBy = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) {
    if (!needs.has(a) || !needs.has(b)) continue;
    needs.get(a)!.add(b);
    neededBy.get(b)!.push(a);
  }
  const indeg = new Map(nodes.map((n) => [n, needs.get(n)!.size]));
  const queue = nodes.filter((n) => indeg.get(n) === 0);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const m of neededBy.get(n)!) {
      indeg.set(m, indeg.get(m)! - 1);
      if (indeg.get(m) === 0) queue.push(m);
    }
  }
  if (order.length === nodes.length) return { order, cycles: [] };

  // Every node left is on a cycle or downstream of one. Walk to find distinct cycles.
  const left = new Set(nodes.filter((n) => indeg.get(n)! > 0));
  const cycles: string[][] = [];
  const onCycle = new Set<string>();
  for (const start of left) {
    if (onCycle.has(start)) continue;
    const path: string[] = [];
    const at = new Map<string, number>();
    let cur: string | undefined = start;
    while (cur && !at.has(cur) && !onCycle.has(cur)) {
      at.set(cur, path.length);
      path.push(cur);
      cur = [...needs.get(cur)!].find((x) => left.has(x));
    }
    if (cur && at.has(cur)) {
      const cyc = path.slice(at.get(cur)!);
      cyc.forEach((c) => onCycle.add(c));
      cycles.push(cyc);
    }
  }
  return { order: [], cycles };
}

/**
 * Checks a full set of chapter results against the exported names before
 * anything is written:
 * - every exported name of a chapter is an alias, moved or dropped, exactly once;
 * - slugs are well formed, unique, and start with an existing chapter's slug;
 * - requires and moved targets name known concepts (these results, or `existingSlugs` in the DB);
 * - the prerequisites form a DAG.
 */
export function validateConceptResults(
  batches: ConceptBatch[],
  results: ChapterResult[],
  chapters: ChapterTag[],
  opts: { existingSlugs?: ReadonlySet<string>; ncertRefs?: ReadonlySet<string> } = {},
): ConceptValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const chapterSlugs = new Set(chapters.map((c) => c.slug));
  const existing = opts.existingSlugs ?? new Set<string>();
  const concepts: ConceptRow[] = [];
  const bySlug = new Map<string, ConceptRow>();
  const dropped = new Set<string>();
  const moves: Array<{ chapter: string; name: string; to: string }> = [];
  const seenChapters = new Set<string>();

  for (const r of results) {
    const ch = r.chapter;
    if (!chapterSlugs.has(ch)) {
      errors.push(`unknown chapter ${ch}`);
      continue;
    }
    if (seenChapters.has(ch)) {
      errors.push(`${ch}: results given twice`);
      continue;
    }
    seenChapters.add(ch);
    const list = Array.isArray(r.concepts) ? r.concepts : [];
    if (list.length > 15) warnings.push(`${ch}: ${list.length} concepts, the target is 6 to 15`);
    list.forEach((c, i) => {
      const slug = String(c?.slug ?? '');
      if (!SLUG_RE.test(slug)) {
        errors.push(`${ch}: bad slug "${slug}"`);
        return;
      }
      if (!slug.startsWith(`${ch}.`)) {
        errors.push(`${ch}: ${slug} does not start with ${ch}.`);
        return;
      }
      if (bySlug.has(slug)) {
        errors.push(`duplicate slug ${slug}`);
        return;
      }
      const label = cleanText(String(c.label ?? ''));
      if (!label) errors.push(`${slug}: no label`);
      let ncert = c.ncert_ref && c.ncert_ref !== 'none' ? String(c.ncert_ref) : null;
      if (ncert && opts.ncertRefs && !opts.ncertRefs.has(ncert)) {
        warnings.push(`${slug}: unknown NCERT ref ${ncert}, left empty`);
        ncert = null;
      }
      const row: ConceptRow = {
        slug,
        chapter: ch,
        label,
        ncert_ref: ncert,
        summary: c.summary ? cleanText(String(c.summary)) : null,
        aliases: [...new Set((c.aliases || []).map(normName).filter(Boolean))],
        requires: [...new Set((c.requires || []).map((s) => String(s).trim()).filter(Boolean))],
        sort_order: i,
      };
      bySlug.set(slug, row);
      concepts.push(row);
    });
    for (const d of r.dropped || []) {
      const n = normName(typeof d === 'string' ? d : d?.name ?? '');
      if (n) dropped.add(n);
    }
    for (const m of r.moved || []) moves.push({ chapter: ch, name: normName(m?.name ?? ''), to: String(m?.to ?? '').trim() });
  }

  // Coverage: each exported name exactly once in its chapter.
  for (const b of batches) {
    const ch = b.chapter.slug;
    if (!seenChapters.has(ch)) {
      errors.push(`no results for chapter ${ch} (${b.names.length} names)`);
      continue;
    }
    const r = results.find((x) => x.chapter === ch)!;
    const uses = new Map<string, number>();
    const bump = (n: string) => n && uses.set(n, (uses.get(n) || 0) + 1);
    for (const c of concepts.filter((x) => x.chapter === ch)) c.aliases.forEach(bump);
    for (const d of r.dropped || []) bump(normName(typeof d === 'string' ? d : d?.name ?? ''));
    for (const m of r.moved || []) bump(normName(m?.name ?? ''));
    const exported = new Set(b.names.map((n) => n.name));
    for (const n of exported) {
      const k = uses.get(n) || 0;
      if (k === 0) errors.push(`${ch}: "${n}" is not mapped or dropped`);
      else if (k > 1) errors.push(`${ch}: "${n}" is used ${k} times (aliases, moved and dropped together must use it once)`);
    }
    const extra = [...uses.keys()].filter((n) => !exported.has(n));
    if (extra.length) warnings.push(`${ch}: ${extra.length} names that were not exported (kept as extra aliases): ${extra.slice(0, 5).join('; ')}`);
  }

  // Moved names: to a concept slug (it becomes an alias there) or to a chapter that adopted it.
  for (const m of moves) {
    if (!m.name) continue;
    if (m.to.includes('.')) {
      const target = bySlug.get(m.to);
      if (target) {
        if (!target.aliases.includes(m.name)) target.aliases.push(m.name);
      } else if (existing.has(m.to)) {
        warnings.push(`${m.chapter}: "${m.name}" moved to ${m.to}, which is only in the database; add it to that concept's aliases there to map it`);
      } else errors.push(`${m.chapter}: "${m.name}" moved to unknown concept ${m.to}`);
    } else if (!chapterSlugs.has(m.to)) {
      errors.push(`${m.chapter}: "${m.name}" moved to unknown chapter ${m.to}`);
    } else if (!concepts.some((c) => c.chapter === m.to && c.aliases.includes(m.name))) {
      errors.push(`${m.chapter}: "${m.name}" moved to ${m.to}, but no concept there lists it as an alias (add it to one in results-${m.to}.json, or move it to a concept slug)`);
    }
  }

  // Within a chapter, an alias belongs to one concept.
  const aliasOwner = new Map<string, string>();
  for (const c of concepts) {
    for (const a of c.aliases) {
      const key = `${c.chapter}|${a}`;
      const prev = aliasOwner.get(key);
      if (prev && prev !== c.slug) errors.push(`${c.chapter}: alias "${a}" is on both ${prev} and ${c.slug}`);
      else aliasOwner.set(key, c.slug);
    }
  }

  // Prerequisites.
  const edges: Array<[string, string]> = [];
  for (const c of concepts) {
    for (const req of c.requires) {
      if (req === c.slug) errors.push(`${c.slug} requires itself`);
      else if (!bySlug.has(req) && !existing.has(req)) errors.push(`${c.slug} requires unknown concept ${req}`);
      else edges.push([c.slug, req]);
    }
  }
  const { order, cycles } = topoSort(concepts.map((c) => c.slug), edges);
  for (const cyc of cycles) errors.push(`prerequisite cycle: ${[...cyc, cyc[0]].join(' requires ')}`);

  return { ok: errors.length === 0, errors, warnings, concepts, dropped, order, cycles };
}

// ── Question mapping ─────────────────────────────────────────────────────────

export interface QuestionConceptRow {
  question_id: string;
  slug: string;
  role: 'core' | 'uses';
}

/**
 * Maps each maths question's free-text names to concepts through aliases.
 * When a name is an alias in several chapters: the question's primary chapter
 * wins, then its also_uses chapters, then the first other chapter by slug.
 * The role is 'core' when the concept's chapter is the question's primary_slug.
 */
export function mapQuestionsToConcepts(
  study: StudyRow[],
  concepts: Array<Pick<ConceptRow, 'slug' | 'chapter' | 'aliases'>>,
  mathChapters: ReadonlySet<string>,
  dropped: ReadonlySet<string> = new Set(),
): { rows: QuestionConceptRow[]; unmapped: Array<{ question_id: string; name: string }> } {
  const byAlias = new Map<string, Array<{ slug: string; chapter: string }>>();
  for (const c of [...concepts].sort((a, b) => a.slug.localeCompare(b.slug))) {
    for (const a of c.aliases) {
      const k = normName(a);
      byAlias.set(k, [...(byAlias.get(k) || []), { slug: c.slug, chapter: c.chapter }]);
    }
  }
  const rows: QuestionConceptRow[] = [];
  const unmapped: Array<{ question_id: string; name: string }> = [];
  for (const s of study) {
    if (!s.primary_slug || !mathChapters.has(s.primary_slug)) continue;
    const also = new Set(s.also_uses || []);
    const done = new Set<string>();
    for (const c of s.concepts || []) {
      const n = normName(c?.name ?? '');
      if (!n) continue;
      const cands = byAlias.get(n) || [];
      const pick =
        cands.find((x) => x.chapter === s.primary_slug) ?? cands.find((x) => also.has(x.chapter)) ?? cands[0];
      if (!pick) {
        if (!dropped.has(n)) unmapped.push({ question_id: s.question_id, name: n });
        continue;
      }
      if (done.has(pick.slug)) continue;
      done.add(pick.slug);
      rows.push({ question_id: s.question_id, slug: pick.slug, role: pick.chapter === s.primary_slug ? 'core' : 'uses' });
    }
  }
  return { rows, unmapped };
}

// ── Report ───────────────────────────────────────────────────────────────────

export function conceptReportCsv(
  v: ConceptValidation,
  results: ChapterResult[],
  mapping: { rows: QuestionConceptRow[] },
): string {
  const core = new Map<string, number>();
  const uses = new Map<string, number>();
  for (const r of mapping.rows) (r.role === 'core' ? core : uses).set(r.slug, ((r.role === 'core' ? core : uses).get(r.slug) || 0) + 1);
  const lines = [csvRow(['chapter', 'slug', 'label', 'ncert_ref', 'summary', 'requires', 'core_questions', 'uses_questions', 'alias_count', 'aliases'])];
  for (const c of v.concepts) {
    lines.push(
      csvRow([c.chapter, c.slug, c.label, c.ncert_ref ?? '', c.summary ?? '', c.requires.join(' | '), core.get(c.slug) || 0, uses.get(c.slug) || 0, c.aliases.length, c.aliases.join(' | ')]),
    );
  }
  for (const r of results) {
    for (const d of r.dropped || []) {
      const name = typeof d === 'string' ? d : d?.name;
      const reason = typeof d === 'string' ? '' : d?.reason ?? '';
      lines.push(csvRow([r.chapter, '(dropped)', '', '', reason, '', '', '', 1, normName(name ?? '')]));
    }
    for (const m of r.moved || []) lines.push(csvRow([r.chapter, `(moved to ${m.to})`, '', '', '', '', '', '', 1, normName(m.name)]));
  }
  return lines.join('\n');
}
