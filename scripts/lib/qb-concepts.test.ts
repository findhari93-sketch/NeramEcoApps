import { describe, expect, it } from 'vitest';
import {
  buildConceptBatches,
  buildConceptSystemPrompt,
  collectConceptResults,
  conceptOutputInstructions,
  mapQuestionsToConcepts,
  normName,
  topoSort,
  validateConceptResults,
  type ChapterTag,
  type ConceptBatch,
  type StudyRow,
} from './qb-concepts';

const CHAPTERS: ChapterTag[] = [
  { id: 't-va', slug: 'vector_algebra', label: 'Vector Algebra', group: 'Vectors and 3D Geometry' },
  { id: 't-diff', slug: 'differentiation', label: 'Differentiation', group: 'Calculus' },
  { id: 't-aod', slug: 'applications_of_derivatives', label: 'Applications of Derivatives', group: 'Calculus' },
];

const STUDY: StudyRow[] = [
  { question_id: 'q1', primary_slug: 'vector_algebra', also_uses: [], concepts: [{ name: 'Dot product' }, { name: 'Components of a vector' }] },
  { question_id: 'q2', primary_slug: 'vector_algebra', also_uses: [], concepts: [{ name: 'dot product ' }, { name: 'Scalar product of vectors' }] },
  { question_id: 'q3', primary_slug: 'differentiation', also_uses: [], concepts: [{ name: 'Chain rule' }] },
  { question_id: 'q4', primary_slug: 'applications_of_derivatives', also_uses: ['differentiation'], concepts: [{ name: 'Chain rule' }, { name: 'First derivative test' }, { name: 'Read the question carefully' }] },
  // Not a maths chapter: ignored.
  { question_id: 'q5', primary_slug: 'building_materials', also_uses: [], concepts: [{ name: 'English bond' }] },
  { question_id: 'q6', primary_slug: null, also_uses: [], concepts: [{ name: 'Dot product' }] },
];

const TEXTS = new Map([
  ['q1', 'Find a.b for a = 2i + 3j'],
  ['q2', 'Find the angle between two vectors'],
  ['q3', 'Differentiate sin(x^2)'],
  ['q4', 'Find the local maxima of f'],
]);

function batches(): ConceptBatch[] {
  return buildConceptBatches(CHAPTERS, STUDY, TEXTS);
}

/** A complete, valid set of results for batches(). */
function goodResults() {
  return [
    {
      chapter: 'vector_algebra',
      concepts: [
        { slug: 'vector_algebra.components', label: 'Components of a vector', summary: 'A vector splits into i, j, k parts.', aliases: ['components of a vector'], requires: [] },
        { slug: 'vector_algebra.dot_product', label: 'Dot product', ncert_ref: 'c12.10.6', summary: 'Multiply matching components and add.', aliases: ['dot product', 'scalar product of vectors'], requires: ['vector_algebra.components'] },
      ],
      dropped: [],
    },
    {
      chapter: 'differentiation',
      concepts: [{ slug: 'differentiation.chain_rule', label: 'Chain rule', summary: 'Differentiate the outside, times the inside.', aliases: ['chain rule'], requires: [] }],
      dropped: [],
    },
    {
      chapter: 'applications_of_derivatives',
      concepts: [
        { slug: 'applications_of_derivatives.first_derivative_test', label: 'First derivative test', summary: 'A sign change of f prime marks a turning point.', aliases: ['first derivative test'], requires: ['differentiation.chain_rule'] },
      ],
      dropped: [{ name: 'read the question carefully', reason: 'advice, not a concept' }],
      moved: [{ name: 'chain rule', to: 'differentiation' }],
    },
  ];
}

describe('normName', () => {
  it('lower-cases and squeezes spaces', () => {
    expect(normName('  Dot   Product ')).toBe('dot product');
  });
});

describe('buildConceptBatches', () => {
  it('makes one batch per maths chapter with merged names, counts and samples', () => {
    const b = batches();
    expect(b.map((x) => x.chapter.slug)).toEqual(['vector_algebra', 'differentiation', 'applications_of_derivatives']);
    const va = b[0];
    const dot = va.names.find((n) => n.name === 'dot product')!;
    expect(dot.count).toBe(2);
    expect(dot.samples).toHaveLength(2);
    // Most used first.
    expect(va.names[0].name).toBe('dot product');
    // A name counts under the question's primary chapter only.
    expect(b[1].names.map((n) => n.name)).toEqual(['chain rule']);
    expect(b[2].names.map((n) => n.name)).toContain('chain rule');
    // Non-maths and unclassified rows are left out.
    expect(b.flatMap((x) => x.names.map((n) => n.name))).not.toContain('english bond');
  });

  it('skips chapters with no names', () => {
    const b = buildConceptBatches([...CHAPTERS, { id: 't-x', slug: 'matrices', label: 'Matrices', group: 'Algebra' }], STUDY, TEXTS);
    expect(b.map((x) => x.chapter.slug)).not.toContain('matrices');
  });
});

describe('prompt', () => {
  it('lists chapters, states the slug rule and has no forbidden dashes', () => {
    const s = `${buildConceptSystemPrompt(CHAPTERS, [{ ref: 'c12.10.6', label: 'Class 12 Ch 10 Vector Algebra, 10.6' }])}\n\n${conceptOutputInstructions()}`;
    expect(s).toContain('- vector_algebra: Vector Algebra (Vectors and 3D Geometry)');
    expect(s).toContain('6 to 15');
    expect(s).toContain('<chapter_slug>.<snake_name>');
    expect(s).not.toMatch(/—|--|&mdash;/);
  });
});

describe('collectConceptResults', () => {
  it('accepts a single object or an array per file', () => {
    const r = goodResults();
    expect(collectConceptResults([r[0], [r[1], r[2]], null, 'junk'])).toHaveLength(3);
  });
});

describe('validateConceptResults', () => {
  it('accepts a complete, acyclic set', () => {
    const v = validateConceptResults(batches(), collectConceptResults(goodResults()), CHAPTERS);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
    expect(v.concepts.map((c) => c.slug)).toEqual([
      'vector_algebra.components',
      'vector_algebra.dot_product',
      'differentiation.chain_rule',
      'applications_of_derivatives.first_derivative_test',
    ]);
    expect(v.concepts[1]).toMatchObject({ chapter: 'vector_algebra', sort_order: 1, ncert_ref: 'c12.10.6' });
    // Prerequisites come before what needs them.
    expect(v.order.indexOf('vector_algebra.components')).toBeLessThan(v.order.indexOf('vector_algebra.dot_product'));
  });

  it('reports a name that is neither mapped nor dropped', () => {
    const r = goodResults();
    r[0].concepts[1].aliases = ['dot product'];
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS);
    expect(v.ok).toBe(false);
    expect(v.errors.join('\n')).toMatch(/vector_algebra: "scalar product of vectors" is not mapped or dropped/);
  });

  it('reports a name mapped twice in one chapter', () => {
    const r = goodResults();
    r[0].concepts[0].aliases.push('dot product');
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS);
    expect(v.errors.join('\n')).toMatch(/"dot product" is used 2 times/);
  });

  it('reports a name both mapped and dropped', () => {
    const r = goodResults();
    r[0].dropped.push({ name: 'Dot Product', reason: 'x' } as never);
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS);
    expect(v.errors.join('\n')).toMatch(/"dot product" is used 2 times/);
  });

  it('reports duplicate slugs, bad slugs and a slug from another chapter', () => {
    const r = goodResults();
    r[1].concepts.push({ slug: 'differentiation.chain_rule', label: 'Again', summary: 's', aliases: [], requires: [] });
    r[1].concepts.push({ slug: 'Differentiation.Bad-Slug', label: 'Bad', summary: 's', aliases: [], requires: [] });
    r[1].concepts.push({ slug: 'vector_algebra.cross_product', label: 'Cross', summary: 's', aliases: [], requires: [] });
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS);
    const all = v.errors.join('\n');
    expect(all).toMatch(/duplicate slug differentiation\.chain_rule/);
    expect(all).toMatch(/bad slug "Differentiation\.Bad-Slug"/);
    expect(all).toMatch(/vector_algebra\.cross_product does not start with differentiation\./);
  });

  it('reports an unknown chapter and a missing chapter', () => {
    const r = goodResults();
    r[1] = { ...r[1], chapter: 'calculus_stuff', concepts: [{ ...r[1].concepts[0], slug: 'calculus_stuff.chain_rule' }] };
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS);
    const all = v.errors.join('\n');
    expect(all).toMatch(/unknown chapter calculus_stuff/);
    expect(all).toMatch(/no results for chapter differentiation/);
  });

  it('reports requires that name no known concept, and allows existing DB concepts', () => {
    const r = goodResults();
    r[0].concepts[0].requires = ['algebra_basics.fractions'];
    expect(validateConceptResults(batches(), collectConceptResults(r), CHAPTERS).errors.join('\n')).toMatch(
      /vector_algebra\.components requires unknown concept algebra_basics\.fractions/,
    );
    const ok = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS, { existingSlugs: new Set(['algebra_basics.fractions']) });
    expect(ok.errors).toEqual([]);
  });

  it('finds a prerequisite cycle and names it', () => {
    const r = goodResults();
    r[0].concepts[0].requires = ['vector_algebra.dot_product'];
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS);
    expect(v.ok).toBe(false);
    expect(v.cycles).toHaveLength(1);
    expect(new Set(v.cycles[0])).toEqual(new Set(['vector_algebra.components', 'vector_algebra.dot_product']));
    expect(v.errors.join('\n')).toMatch(/prerequisite cycle: /);
  });

  it('rejects a concept requiring itself', () => {
    const r = goodResults();
    r[1].concepts[0].requires = ['differentiation.chain_rule'];
    expect(validateConceptResults(batches(), collectConceptResults(r), CHAPTERS).errors.join('\n')).toMatch(/requires itself/);
  });

  it('a moved name must land on a concept in the target chapter', () => {
    const r = goodResults();
    r[2].moved = [{ name: 'chain rule', to: 'vector_algebra' }];
    expect(validateConceptResults(batches(), collectConceptResults(r), CHAPTERS).errors.join('\n')).toMatch(
      /"chain rule" moved to vector_algebra, but no concept there lists it as an alias/,
    );
  });

  it('a name moved to a concept slug becomes that concept\'s alias', () => {
    const r = goodResults();
    r[1].concepts[0].aliases = [];
    r[1].dropped = [{ name: 'chain rule', reason: 'x' }];
    r[2].moved = [{ name: 'chain rule', to: 'differentiation.chain_rule' }];
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS);
    expect(v.errors).toEqual([]);
    expect(v.concepts.find((c) => c.slug === 'differentiation.chain_rule')!.aliases).toEqual(['chain rule']);
  });

  it('cleans forbidden dashes and drops an unknown NCERT ref with a warning', () => {
    const r = goodResults();
    r[0].concepts[1].label = 'Dot product — scalar';
    r[0].concepts[1].ncert_ref = 'c99.9';
    const v = validateConceptResults(batches(), collectConceptResults(r), CHAPTERS, { ncertRefs: new Set(['c12.10.6']) });
    expect(v.ok).toBe(true);
    expect(v.concepts[1].label).toBe('Dot product, scalar');
    expect(v.concepts[1].ncert_ref).toBeNull();
    expect(v.warnings.join('\n')).toMatch(/unknown NCERT ref c99\.9/);
  });
});

describe('topoSort', () => {
  it('orders a DAG and reports every cycle it can find', () => {
    expect(topoSort(['a', 'b', 'c'], [['b', 'a'], ['c', 'b']]).order).toEqual(['a', 'b', 'c']);
    const t = topoSort(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'a'], ['c', 'd'], ['d', 'c']]);
    expect(t.order).toEqual([]);
    expect(t.cycles).toHaveLength(2);
  });
});

describe('mapQuestionsToConcepts', () => {
  it('maps through aliases: core in the primary chapter, uses elsewhere', () => {
    const v = validateConceptResults(batches(), collectConceptResults(goodResults()), CHAPTERS);
    const m = mapQuestionsToConcepts(STUDY, v.concepts, new Set(CHAPTERS.map((c) => c.slug)), v.dropped);
    const by = (q: string) => m.rows.filter((r) => r.question_id === q).map((r) => `${r.slug}:${r.role}`).sort();
    expect(by('q1')).toEqual(['vector_algebra.components:core', 'vector_algebra.dot_product:core']);
    // Two names for one concept give one row.
    expect(by('q2')).toEqual(['vector_algebra.dot_product:core']);
    expect(by('q3')).toEqual(['differentiation.chain_rule:core']);
    expect(by('q4')).toEqual(['applications_of_derivatives.first_derivative_test:core', 'differentiation.chain_rule:uses']);
    // Dropped names are not "unmapped"; non-maths rows are ignored.
    expect(m.unmapped).toEqual([]);
    expect(by('q5')).toEqual([]);
  });

  it('prefers the primary chapter when an alias exists in two chapters, then also_uses', () => {
    const concepts = [
      { slug: 'differentiation.chain_rule', chapter: 'differentiation', aliases: ['chain rule'] },
      { slug: 'applications_of_derivatives.chain_rule_in_rates', chapter: 'applications_of_derivatives', aliases: ['chain rule'] },
      { slug: 'vector_algebra.chain', chapter: 'vector_algebra', aliases: ['chain rule'] },
    ];
    const rows: StudyRow[] = [
      { question_id: 'a', primary_slug: 'applications_of_derivatives', also_uses: [], concepts: [{ name: 'Chain rule' }] },
      { question_id: 'b', primary_slug: 'matrices', also_uses: ['differentiation'], concepts: [{ name: 'Chain rule' }] },
    ];
    const m = mapQuestionsToConcepts(rows, concepts, new Set(['applications_of_derivatives', 'matrices', 'differentiation', 'vector_algebra']));
    expect(m.rows).toEqual([
      { question_id: 'a', slug: 'applications_of_derivatives.chain_rule_in_rates', role: 'core' },
      { question_id: 'b', slug: 'differentiation.chain_rule', role: 'uses' },
    ]);
  });

  it('lists names with no concept', () => {
    const m = mapQuestionsToConcepts(
      [{ question_id: 'x', primary_slug: 'vector_algebra', also_uses: [], concepts: [{ name: 'Mystery idea' }] }],
      [],
      new Set(['vector_algebra']),
    );
    expect(m.unmapped).toEqual([{ question_id: 'x', name: 'mystery idea' }]);
  });
});
