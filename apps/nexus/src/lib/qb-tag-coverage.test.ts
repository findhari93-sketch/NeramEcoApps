import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', async () => {
  const paged = await vi.importActual<typeof import('../../../../packages/database/src/utils/paged-rows')>(
    '../../../../packages/database/src/utils/paged-rows',
  );
  return { fetchAllRows: paged.fetchAllRows };
});

import {
  computeCoverage,
  decorateSuggestions,
  findTagSuggestions,
  groupPairsByQuestion,
  isCoverageTopic,
  isMissingTableError,
  loadCoverageRegistry,
  resolveTopic,
  sourceLabelFor,
  validatePairs,
} from './qb-tag-coverage';

// ─── A tiny in-memory PostgREST stand-in ──────────────────────────────────────

type Row = Record<string, any>;

function likeToRegex(pattern: string): RegExp {
  const body = pattern
    .replace(/[.+?^${}()|[\]]/g, '\\$&')
    .replace(/%/g, '.*');
  return new RegExp(`^${body}$`, 'i');
}

function fakeDb(tables: Record<string, Row[] | Error>) {
  const calls: Array<{ table: string; filters: string[] }> = [];
  return {
    calls,
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      const log: string[] = [];
      calls.push({ table, filters: log });
      let from = 0;
      let to = Number.MAX_SAFE_INTEGER;
      const builder: any = {
        select: () => builder,
        order: () => builder,
        eq(col: string, val: unknown) {
          log.push(`eq:${col}`);
          filters.push((r) => r[col] === val);
          return builder;
        },
        in(col: string, vals: unknown[]) {
          log.push(`in:${col}:${vals.length}`);
          filters.push((r) => vals.includes(r[col]));
          return builder;
        },
        or(expr: string) {
          log.push(`or:${expr}`);
          const clauses = expr.split(',').map((c) => {
            const [col, , pattern] = c.split(/\.(ilike)\./).length === 3
              ? c.split(/\.(ilike)\./)
              : [c, '', ''];
            return { col, re: likeToRegex(pattern) };
          });
          filters.push((r) => clauses.some(({ col, re }) => re.test(String(r[col] ?? ''))));
          return builder;
        },
        range(a: number, b: number) {
          from = a;
          to = b;
          return builder;
        },
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
          const source = tables[table];
          if (source instanceof Error) return Promise.resolve({ data: null, error: source }).then(resolve, reject);
          const rows = (source || []).filter((r) => filters.every((f) => f(r))).slice(from, to + 1);
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TAGS: Row[] = [
  { id: uuid(1), slug: 'islamic_architecture', label: 'Islamic Architecture', group_type: 'theme', aliases: [], parent_id: null, is_active: true, sort_order: 0 },
  { id: uuid(2), slug: 'history_of_architecture', label: 'History Of Architecture', group_type: 'subject', aliases: [], parent_id: null, is_active: true, sort_order: 0 },
  { id: uuid(3), slug: 'mathematics', label: 'Mathematics', group_type: 'subject', aliases: ['maths'], parent_id: null, is_active: true, sort_order: 0 },
  { id: uuid(4), slug: 'nata', label: 'NATA', group_type: 'exam', aliases: [], parent_id: null, is_active: true, sort_order: 0 },
  { id: uuid(5), slug: 'indus_valley_civilization', label: 'Indus Valley Civilization', group_type: 'theme', aliases: [], parent_id: null, is_active: false, sort_order: 0 },
];

const q = (n: number, text: string, extra: Row = {}): Row => ({
  id: uuid(100 + n),
  question_text: text,
  options: [{ id: 'a', text: 'Option' }],
  correct_answer: 'a',
  exam_relevance: 'NATA',
  origin: 'authored',
  search_doc_norm: text.toLowerCase().replace(/[^a-z0-9]+/g, ' '),
  ...extra,
});

const QUESTIONS = [
  q(1, 'Who built the Taj Mahal, the Mughal mausoleum?'), // high for islamic
  q(2, 'Where is Fatehpur Sikri?'), // low for islamic
  q(3, 'A domestic building in the Mughal era'), // islamic via mughal (low)
  q(4, 'Solve x + 2 = 4'), // nothing
  q(5, 'Name the mosque near the Qutub Minar', { origin: 'pyq' }), // islamic high, already tagged islamic
  q(6, 'The mosque at Bijapur, Gol Gumbaz'), // islamic high, dismissed
];

function db(overrides: Record<string, Row[] | Error> = {}) {
  return fakeDb({
    nexus_qb_tags: TAGS,
    nexus_qb_questions: QUESTIONS,
    nexus_qb_question_tags: [
      { question_id: uuid(105), tag_id: uuid(1) },
      { question_id: uuid(104), tag_id: uuid(3) },
      { question_id: uuid(102), tag_id: uuid(4) }, // exam tag only: still untagged
    ],
    nexus_qb_tag_suggestion_dismissals: [{ question_id: uuid(106), tag_id: uuid(1) }],
    nexus_test_questions: [{ qb_question_id: uuid(101), test: { created_from: 'recap_authored' } }],
    ...overrides,
  });
}

describe('isCoverageTopic', () => {
  it('keeps active themes and the architecture subjects only', () => {
    expect(isCoverageTopic({ slug: 'islamic_architecture', group_type: 'theme', is_active: true })).toBe(true);
    expect(isCoverageTopic({ slug: 'history_of_architecture', group_type: 'subject', is_active: true })).toBe(true);
    expect(isCoverageTopic({ slug: 'mathematics', group_type: 'subject', is_active: true })).toBe(false);
    expect(isCoverageTopic({ slug: 'nata', group_type: 'exam', is_active: true })).toBe(false);
    expect(isCoverageTopic({ slug: 'indus_valley_civilization', group_type: 'theme', is_active: false })).toBe(false);
  });
});

describe('computeCoverage', () => {
  it('counts subject or theme tags as tagged, and tallies suggestions per topic', async () => {
    const summary = await computeCoverage(db());
    expect(summary.total).toBe(6);
    // q4 (mathematics) and q5 (islamic) are tagged; q2 carries only an exam tag.
    expect(summary.tagged).toBe(2);
    expect(summary.untagged).toBe(4);

    const islamic = summary.topics.find((t) => t.slug === 'islamic_architecture')!;
    expect(islamic.tagged_count).toBe(1);
    // q1, q2, q3 suggested; q5 already tagged; q6 dismissed.
    expect(islamic.suggestion_count).toBe(3);
    expect(islamic.high_confidence_count).toBe(1);
    expect(summary.topics.map((t) => t.slug)).not.toContain('mathematics');
    expect(summary.topics[0].slug).toBe('islamic_architecture');
  });

  it('treats a missing dismissals table as nothing dismissed', async () => {
    const missing = Object.assign(new Error('relation "nexus_qb_tag_suggestion_dismissals" does not exist'), { code: '42P01' });
    const summary = await computeCoverage(db({ nexus_qb_tag_suggestion_dismissals: missing }));
    expect(summary.topics.find((t) => t.slug === 'islamic_architecture')!.suggestion_count).toBe(4);
  });

  it('fails loudly on any other read error', async () => {
    await expect(computeCoverage(db({ nexus_qb_question_tags: new Error('fetch failed') }))).rejects.toThrow('fetch failed');
  });
});

describe('findTagSuggestions', () => {
  it('prefilters in SQL, drops whole-word misses, skips tagged and dismissed, sorts high first', async () => {
    const fake = db();
    const registry = await loadCoverageRegistry(fake);
    const tag = resolveTopic(registry, { slug: 'islamic_architecture' });
    const items = await findTagSuggestions(fake, registry, tag);

    expect(items.map((i) => i.id)).toEqual([uuid(101), uuid(102), uuid(103)]);
    expect(items[0]).toMatchObject({ confidence: 'high', matched_terms: ['taj mahal', 'mughal'] });
    expect(items[1]).toMatchObject({ confidence: 'low', matched_terms: ['fatehpur sikri'] });

    const questionReads = fake.calls.filter((c) => c.table === 'nexus_qb_questions');
    expect(questionReads.length).toBeGreaterThan(0);
    for (const read of questionReads) {
      const or = read.filters.find((f) => f.startsWith('or:'))!;
      expect(or).toContain('search_doc_norm.ilike.%');
      expect(or.length).toBeLessThan(3100);
    }
  });

  it('decorates a page with other suggested topics and a source label', async () => {
    const fake = db();
    const registry = await loadCoverageRegistry(fake);
    const tag = resolveTopic(registry, { slug: 'islamic_architecture' });
    const [first, , third] = await decorateSuggestions(fake, registry, tag, await findTagSuggestions(fake, registry, tag));
    expect(first.source_label).toBe('Class checkpoint');
    expect(third.source_label).toBe('Written by a teacher');
    // "mughal" is also a history_of_architecture phrase.
    expect(first.also_suggested.map((t) => t.slug)).toContain('history_of_architecture');
  });
});

describe('resolveTopic', () => {
  it('finds by slug or id and refuses the rest with a status', async () => {
    const registry = await loadCoverageRegistry(db());
    expect(resolveTopic(registry, { tagId: uuid(1) }).slug).toBe('islamic_architecture');
    expect(() => resolveTopic(registry, {})).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => resolveTopic(registry, { tagId: 'nope' })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => resolveTopic(registry, { slug: 'no_such_tag' })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => resolveTopic(registry, { slug: 'indus_valley_civilization' })).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => resolveTopic(registry, { slug: 'nata' })).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('validatePairs', () => {
  it('drops malformed ids, unknown tags and missing questions, and de-duplicates', async () => {
    const fake = db();
    const registry = await loadCoverageRegistry(fake);
    const { pairs, skipped } = await validatePairs(fake, registry, [
      { question_id: uuid(101), tag_id: uuid(1) },
      { question_id: uuid(101), tag_id: uuid(1) },
      { question_id: uuid(999), tag_id: uuid(1) },
      { question_id: 'x', tag_id: uuid(1) },
      { question_id: uuid(102), tag_id: uuid(5) }, // inactive tag
    ]);
    expect(pairs).toEqual([{ question_id: uuid(101), tag_id: uuid(1) }]);
    expect(skipped).toBe(3);
  });

  it('refuses an empty or oversized batch', async () => {
    const fake = db();
    const registry = await loadCoverageRegistry(fake);
    await expect(validatePairs(fake, registry, [])).rejects.toMatchObject({ status: 400 });
    await expect(validatePairs(fake, registry, new Array(501).fill({}))).rejects.toMatchObject({ status: 400 });
  });
});

describe('small helpers', () => {
  it('groups pairs by question', () => {
    expect(
      groupPairsByQuestion([
        { question_id: 'q1', tag_id: 't1' },
        { question_id: 'q1', tag_id: 't2' },
        { question_id: 'q2', tag_id: 't1' },
      ]),
    ).toEqual([
      { question_id: 'q1', tag_ids: ['t1', 't2'] },
      { question_id: 'q2', tag_ids: ['t1'] },
    ]);
  });

  it('labels sources in plain words', () => {
    expect(sourceLabelFor('pyq', false)).toBe('Past paper');
    expect(sourceLabelFor('imported', false)).toBe('Study material');
    expect(sourceLabelFor('authored', true)).toBe('Class checkpoint');
    expect(sourceLabelFor('authored', false)).toBe('Written by a teacher');
    expect(sourceLabelFor('student_recalled', false)).toBe('Student recall');
    expect(sourceLabelFor(null, false)).toBe('Question bank');
  });

  it('recognises a missing table error', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
    expect(isMissingTableError({ code: '23505' })).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
