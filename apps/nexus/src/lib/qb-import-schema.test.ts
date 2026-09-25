import { describe, expect, it } from 'vitest';
import {
  MAX_TAGS_PER_QUESTION,
  SCHEMA_NAME,
  SCHEMA_VERSION,
  SPEC_EXAMPLE,
  TEST_JSON_SPEC,
  buildImportPrompt,
  importSampleObject,
  importSlugify,
  splitJsonReplies,
  validateImportJSON,
  validationReport,
  type ImportRegistryTag,
} from './qb-import-schema';

const REGISTRY: ImportRegistryTag[] = [
  { id: 'tag-nata', slug: 'nata', label: 'NATA', group_type: 'exam' },
  { id: 'tag-jee', slug: 'jee', label: 'JEE', group_type: 'exam' },
  { id: 'tag-hoa', slug: 'history_of_architecture', label: 'History Of Architecture', group_type: 'subject' },
  { id: 'tag-indian', slug: 'indian_architecture', label: 'Indian Architecture', group_type: 'theme' },
];

/** The shape the prompt asks for, which is what most pastes will look like. */
function wrap(questions: unknown[], test?: unknown): string {
  return JSON.stringify({ test: test ?? { title: 'HOA Test', suggested_folder: 'Foundation / History of Architecture' }, questions });
}

const GOOD_MCQ = {
  question: 'Shahjahanabad is presently known as which city?',
  options: { a: 'Agra', b: 'Old Delhi', c: 'Lahore', d: 'Jaipur' },
  answer: 'b',
  explanation: 'Shahjahanabad is the walled city that is now Old Delhi.',
  difficulty: 'MEDIUM',
  exam: 'NATA',
  tag_slugs: ['history_of_architecture', 'indian_architecture'],
};

describe('validateImportJSON', () => {
  it('parses a well formed reply', () => {
    const result = validateImportJSON(wrap([GOOD_MCQ]), REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    const q = result.questions[0];
    expect(q.question_format).toBe('MCQ');
    expect(q.correct_answer).toBe('b');
    expect(q.options).toEqual([
      { id: 'a', text: 'Agra' },
      { id: 'b', text: 'Old Delhi' },
      { id: 'c', text: 'Lahore' },
      { id: 'd', text: 'Jaipur' },
    ]);
    expect(q.difficulty).toBe('MEDIUM');
    expect(q.exam_relevance).toBe('NATA');
    expect(q.tag_ids).toEqual(['tag-hoa', 'tag-indian']);
    expect(result.test).toMatchObject({ title: 'HOA Test', folder_path: ['Foundation', 'History of Architecture'] });
  });

  it('strips markdown fences and leading prose', () => {
    const raw = 'Sure, here you go!\n```json\n' + wrap([GOOD_MCQ]) + '\n```';
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.questions).toHaveLength(1);
  });

  it('accepts an array of option strings and renumbers them', () => {
    const result = validateImportJSON(
      wrap([{ ...GOOD_MCQ, options: ['Agra', 'Old Delhi', 'Lahore', 'Jaipur'], answer: 'b' }]),
      REGISTRY,
    );
    expect(result.questions[0].options?.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('renumbers non-canonical option ids so the answer stays gradable', () => {
    const result = validateImportJSON(
      wrap([
        {
          ...GOOD_MCQ,
          options: [
            { id: 'opt_0_177366', text: 'Agra' },
            { id: 'opt_1_177366', text: 'Old Delhi' },
          ],
          answer: 'Old Delhi',
        },
      ]),
      REGISTRY,
    );
    const q = result.questions[0];
    expect(q.options?.map((o) => o.id)).toEqual(['a', 'b']);
    expect(q.correct_answer).toBe('b');
  });

  it('resolves an answer given as text or as a decorated key', () => {
    const byText = validateImportJSON(wrap([{ ...GOOD_MCQ, answer: 'Old Delhi' }]), REGISTRY);
    expect(byText.questions[0].correct_answer).toBe('b');
    const decorated = validateImportJSON(wrap([{ ...GOOD_MCQ, answer: 'B)' }]), REGISTRY);
    expect(decorated.questions[0].correct_answer).toBe('b');
  });

  it('drops a row whose answer matches no option, keeping the good rows', () => {
    const result = validateImportJSON(wrap([GOOD_MCQ, { ...GOOD_MCQ, question: 'Another one entirely?', answer: 'z' }]), REGISTRY);
    expect(result.questions).toHaveLength(1);
    expect(result.errors.join(' ')).toContain('does not match any option');
  });

  it('drops a row with fewer than two options', () => {
    const result = validateImportJSON(wrap([{ ...GOOD_MCQ, options: { a: 'Only one' }, answer: 'a' }]), REGISTRY);
    expect(result.questions).toHaveLength(0);
    expect(result.errors.join(' ')).toContain('at least two options');
  });

  it('treats a question with no options as numerical', () => {
    const result = validateImportJSON(
      wrap([{ question: 'How many minarets does the Taj Mahal have?', answer: '4', tag_slugs: ['indian_architecture'] }]),
      REGISTRY,
    );
    expect(result.questions[0].question_format).toBe('NUMERICAL');
    expect(result.questions[0].correct_answer).toBe('4');
    expect(result.questions[0].options).toBeNull();
  });

  it('ignores a declared NUMERICAL format when options are present', () => {
    const result = validateImportJSON(wrap([{ ...GOOD_MCQ, format: 'NUMERICAL' }]), REGISTRY);
    expect(result.questions[0].question_format).toBe('MCQ');
  });

  it('collapses a repeated question within one paste', () => {
    const result = validateImportJSON(wrap([GOOD_MCQ, { ...GOOD_MCQ }]), REGISTRY);
    expect(result.questions).toHaveLength(1);
    expect(result.warnings.join(' ')).toContain('repeats an earlier question');
  });

  it('drops unknown tags but keeps the question', () => {
    const result = validateImportJSON(
      wrap([{ ...GOOD_MCQ, tag_slugs: ['history_of_architecture', 'not_a_real_tag'] }]),
      REGISTRY,
    );
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].tag_ids).toEqual(['tag-hoa']);
    expect(result.warnings.join(' ')).toContain('unknown tag "not_a_real_tag"');
  });

  it('collects proposed new tags and links them to the question', () => {
    const result = validateImportJSON(
      wrap([
        {
          ...GOOD_MCQ,
          tag_slugs: ['history_of_architecture', 'mughal_architecture'],
          new_tags: [{ slug: 'mughal_architecture', label: 'Mughal Architecture', group: 'theme' }],
        },
      ]),
      REGISTRY,
    );
    expect(result.proposedTags).toEqual([
      { slug: 'mughal_architecture', label: 'Mughal Architecture', group_type: 'theme', usage: 1 },
    ]);
    expect(result.questions[0].new_tag_slugs).toEqual(['mughal_architecture']);
    expect(result.questions[0].tag_slugs).toContain('mughal_architecture');
  });

  it('forces a proposed exam or subject tag down to a theme tag', () => {
    const result = validateImportJSON(
      wrap([{ ...GOOD_MCQ, new_tags: [{ slug: 'gate_exam', label: 'GATE', group: 'exam' }] }]),
      REGISTRY,
    );
    expect(result.proposedTags[0].group_type).toBe('theme');
    expect(result.warnings.join(' ')).toContain('curated');
  });

  it('never proposes a tag that already exists', () => {
    const result = validateImportJSON(
      wrap([{ ...GOOD_MCQ, new_tags: [{ slug: 'indian_architecture', label: 'Indian Architecture' }] }]),
      REGISTRY,
    );
    expect(result.proposedTags).toEqual([]);
  });

  it('forgets a proposal whose only question was dropped', () => {
    const result = validateImportJSON(
      wrap([{ ...GOOD_MCQ, answer: 'z', new_tags: [{ slug: 'orphan_tag', label: 'Orphan' }] }]),
      REGISTRY,
    );
    expect(result.questions).toHaveLength(0);
    expect(result.proposedTags).toEqual([]);
  });

  it('caps tags per question', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ slug: `extra_${i}`, label: `Extra ${i}` }));
    const result = validateImportJSON(wrap([{ ...GOOD_MCQ, tag_slugs: [], new_tags: many }]), REGISTRY);
    expect(result.questions[0].tag_slugs.length).toBeLessThanOrEqual(MAX_TAGS_PER_QUESTION);
  });

  it('defaults an unknown exam with a warning', () => {
    const result = validateImportJSON(wrap([{ ...GOOD_MCQ, exam: 'GATE' }]), REGISTRY);
    expect(result.questions[0].exam_relevance).toBe('BOTH');
    expect(result.warnings.join(' ')).toContain('unknown exam');
  });

  it('reads difficulty silently, whether it is there, odd, or missing', () => {
    // v3 stopped asking for it. Neither an old reply that still sends one nor a
    // new one without it may produce a warning.
    const odd = validateImportJSON(wrap([{ ...GOOD_MCQ, difficulty: 'IMPOSSIBLE' }]), REGISTRY);
    expect(odd.questions[0].difficulty).toBe('MEDIUM');
    expect(odd.warnings).toEqual([]);

    const hard = validateImportJSON(wrap([{ ...GOOD_MCQ, difficulty: 'hard' }]), REGISTRY);
    expect(hard.questions[0].difficulty).toBe('HARD');

    const { difficulty: _drop, ...noDifficulty } = GOOD_MCQ;
    const missing = validateImportJSON(wrap([noDifficulty]), REGISTRY);
    expect(missing.questions[0].difficulty).toBe('MEDIUM');
    expect(missing.warnings).toEqual([]);
  });

  it('reports unparseable input without throwing', () => {
    const result = validateImportJSON('I could not complete this request.', REGISTRY);
    expect(result.questions).toEqual([]);
    expect(result.errors.join(' ')).toContain('Could not read that as JSON');
  });

  it('rejects a JSON object with no questions array', () => {
    const result = validateImportJSON(JSON.stringify({ test: { title: 'x' } }), REGISTRY);
    expect(result.errors.join(' ')).toContain('questions');
  });

  it('accepts a bare array of questions', () => {
    const result = validateImportJSON(JSON.stringify([GOOD_MCQ]), REGISTRY);
    expect(result.questions).toHaveLength(1);
    expect(result.test.title).toBe('');
  });
});

describe('source_quote, which decides what an unreviewed test may publish', () => {
  it('keeps a quote the model gave', () => {
    const quote = 'Shahjahanabad was founded by Shah Jahan in 1639 and is now Old Delhi.';
    const result = validateImportJSON(wrap([{ ...GOOD_MCQ, source_quote: quote }]), REGISTRY);
    expect(result.questions[0].source_quote).toBe(quote);
  });

  it('reports no quote rather than inventing one', () => {
    // The generator drops these. It is the only thing standing between a
    // hallucinated question and a student, so it must not be filled in with a
    // default that would make an ungrounded question look grounded.
    expect(validateImportJSON(wrap([GOOD_MCQ]), REGISTRY).questions[0].source_quote).toBeNull();
  });

  it('rejects a quote too short to be evidence', () => {
    const result = validateImportJSON(wrap([{ ...GOOD_MCQ, source_quote: 'yes' }]), REGISTRY);
    expect(result.questions[0].source_quote).toBeNull();
  });

  it('does not drop the question itself over a missing quote', () => {
    // Dropping is the generator's decision, not the validator's: a teacher
    // pasting from ChatGPT is reviewing the questions themselves and should
    // keep every usable one.
    const result = validateImportJSON(wrap([GOOD_MCQ]), REGISTRY);
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
});

describe('a question set written outside the app', () => {
  /**
   * The uploaded case, which is not the pasted case scaled up. A teacher who ran
   * the prompt themselves comes back with far more questions than one in-app
   * model call produces, none of them necessarily quoting the chapter, and the
   * whole point is that all of them land.
   */
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      ...GOOD_MCQ,
      question: `Question number ${i + 1}: which dynasty built this monument?`,
    }));

  it('keeps every row of a large hand-written set', () => {
    const result = validateImportJSON(wrap(many(150)), REGISTRY);
    expect(result.questions).toHaveLength(150);
    expect(result.errors).toEqual([]);
  });

  it('keeps a set in which nothing carries a quote', () => {
    // The upload route does not run the generator's grounding filter, so a set
    // with no source_quote anywhere has to survive validation intact or the
    // feature imports nothing.
    const result = validateImportJSON(wrap(many(30)), REGISTRY);
    expect(result.questions).toHaveLength(30);
    expect(result.questions.every((q) => q.source_quote === null)).toBe(true);
  });

  it('keeps a 250-question file whole, now the cap is 300', () => {
    const result = validateImportJSON(wrap(many(250)), REGISTRY);
    expect(result.questions).toHaveLength(250);
    expect(result.warnings.join(' ')).not.toContain('Only the first');
  });

  it('warns rather than failing when a file passes the per-import cap', () => {
    // Surfaced in the confirm step. Silently keeping 300 of 350 would look like
    // a successful import of the whole file.
    const result = validateImportJSON(wrap(many(350)), REGISTRY);
    expect(result.questions).toHaveLength(300);
    expect(result.warnings.join(' ')).toContain('Only the first 300');
  });

  it('accepts question_text and correct_answer as the field names', () => {
    const result = validateImportJSON(
      wrap([
        {
          question_text: 'Which walled city is Shahjahanabad today?',
          options: { a: 'Agra', b: 'Old Delhi' },
          correct_answer: 'b',
          tag_slugs: ['history_of_architecture'],
        },
      ]),
      REGISTRY,
    );
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].correct_answer).toBe('b');
  });
});

describe('buildImportPrompt', () => {
  it('asks the model to name the chapter from the document', () => {
    // The typed "Chapter or topic" field is gone. The document is the only
    // thing that knows what it covers, and its answer already won: the AI's
    // test.title has always overridden the title built from the typed value.
    const prompt = buildImportPrompt(REGISTRY, { exam: 'NATA', count: 40 });
    expect(prompt).toContain('Read the chapter name off the document');
    expect(prompt).toContain('take the name from the document');
    expect(prompt).not.toContain('Chapter Test');
  });

  it('offers a filename as a hint the model may overrule', () => {
    const prompt = buildImportPrompt(REGISTRY, { chapter: 'Islamic architecture _ Chapter 2' });
    expect(prompt).toContain('Islamic architecture _ Chapter 2');
    expect(prompt).toContain('does not name itself more precisely');
  });

  it('demands a quote when the document is attached to the same call', () => {
    const attached = buildImportPrompt(REGISTRY, { fromDocument: true });
    expect(attached).toContain('discarded without being read by anyone');
    expect(buildImportPrompt(REGISTRY, {})).not.toContain('discarded without being read');
  });

  it('lists every registry slug and states the reply contract', () => {
    const prompt = buildImportPrompt(REGISTRY, { chapter: 'History of Architecture', exam: 'NATA', count: 40 });
    for (const tag of REGISTRY) expect(prompt).toContain(tag.slug);
    expect(prompt).toContain('40 questions');
    expect(prompt).toContain('History of Architecture');
    expect(prompt).toContain('no markdown fences');
    expect(prompt).toContain('"questions"');
  });

  it('produces an example the validator itself accepts', () => {
    // Guards the contract drifting: the sample embedded in the prompt is the
    // single clearest instruction a model gets, so it has to stay valid.
    const result = validateImportJSON(JSON.stringify(importSampleObject()), REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.schema.recognised).toBe(true);
  });

  it('embeds that exact sample, so the prompt and the spec cannot drift apart', () => {
    const prompt = buildImportPrompt(REGISTRY, { chapter: 'History of Architecture' });
    expect(prompt).toContain(JSON.stringify(importSampleObject('BOTH', ''), null, 2));
    expect(TEST_JSON_SPEC).toContain(JSON.stringify(importSampleObject('BOTH', '', SPEC_EXAMPLE), null, 2));
  });

  it('the published spec is itself a valid payload once the comments are stripped', () => {
    const json = TEST_JSON_SPEC.split('\n').filter((l) => !l.startsWith('//')).join('\n');
    const result = validateImportJSON(json, REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.schema.recognised).toBe(true);
  });
});

describe('schema labelling', () => {
  it('recognises a labelled v3 payload', () => {
    const result = validateImportJSON(JSON.stringify(importSampleObject()), REGISTRY);
    expect(SCHEMA_VERSION).toBe(3);
    expect(result.schema).toEqual({ name: SCHEMA_NAME, version: SCHEMA_VERSION, recognised: true });
  });

  it('still reads a v2 payload, per-question exam and difficulty included', () => {
    const v2 = {
      schema: SCHEMA_NAME,
      version: 2,
      test: { title: 'HOA', suggested_folder: 'Foundation / HOA' },
      questions: [{ ...GOOD_MCQ, difficulty: 'EASY', exam: 'JEE' }],
    };
    const result = validateImportJSON(JSON.stringify(v2), REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.schema).toEqual({ name: SCHEMA_NAME, version: 2, recognised: true });
    expect(result.questions[0].exam_relevance).toBe('JEE');
    expect(result.questions[0].difficulty).toBe('EASY');
    expect(result.test.pool).toBeNull();
    expect(result.test.serve).toBeNull();
    expect(validationReport(result)[0].message).toBe(`Schema valid, ${SCHEMA_NAME} v2`);
  });

  it('accepts an unlabelled payload, because the shape is what matters', () => {
    const raw = JSON.stringify({
      test: { title: 'X' },
      questions: [{ question: 'A perfectly fine question stem', options: { a: 'one', b: 'two' }, answer: 'a' }],
    });
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.questions).toHaveLength(1);
    expect(result.schema.recognised).toBe(false);
    expect(result.schema.name).toBeNull();
  });

  it('warns about a newer schema rather than refusing the file', () => {
    const sample = importSampleObject();
    const raw = JSON.stringify({ ...sample, version: SCHEMA_VERSION + 1 });
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.questions).toHaveLength(1);
    expect(result.warnings.some((w) => /newer|ignored/i.test(w))).toBe(true);
  });
});

describe('image_ref', () => {
  it('is captured but does NOT count as the question having an image', () => {
    const sample = importSampleObject() as any;
    sample.questions[0].image_ref = 'fig-7.png';
    const result = validateImportJSON(JSON.stringify(sample), REGISTRY);
    expect(result.questions[0].image_ref).toBe('fig-7.png');
  });

  it('accepts the shorter "image" key some tools emit', () => {
    const sample = importSampleObject() as any;
    sample.questions[0].image = '  diagram-2.png ';
    const result = validateImportJSON(JSON.stringify(sample), REGISTRY);
    expect(result.questions[0].image_ref).toBe('diagram-2.png');
  });

  it('is null when absent', () => {
    const result = validateImportJSON(JSON.stringify(importSampleObject()), REGISTRY);
    expect(result.questions[0].image_ref).toBeNull();
  });
});

describe('validationReport, the upload screen list', () => {
  it('leads with the schema line then the question count', () => {
    const checks = validationReport(validateImportJSON(JSON.stringify(importSampleObject()), REGISTRY));
    expect(checks[0]).toEqual({ level: 'ok', message: `Schema valid, ${SCHEMA_NAME} v${SCHEMA_VERSION}` });
    expect(checks[1].message).toBe('1 question found, all have a correct answer');
  });

  it('states the passing checks, so a clean file is distinguishable from an unchecked one', () => {
    const checks = validationReport(validateImportJSON(JSON.stringify(importSampleObject()), REGISTRY));
    expect(checks.every((c) => c.level === 'ok')).toBe(true);
  });

  it('names the questions that need an image attached', () => {
    const sample = importSampleObject() as any;
    sample.questions[0].image_ref = 'fig-7.png';
    const checks = validationReport(validateImportJSON(JSON.stringify(sample), REGISTRY));
    expect(checks.some((c) => c.level === 'warning' && /Q1 reference/.test(c.message))).toBe(true);
  });

  it('reports an unusable file as an error', () => {
    const checks = validationReport(validateImportJSON('not json at all', REGISTRY));
    expect(checks.some((c) => c.level === 'error')).toBe(true);
  });
});

describe('importSlugify', () => {
  it('matches the registry slug rules', () => {
    expect(importSlugify('Mughal Architecture')).toBe('mughal_architecture');
    expect(importSlugify('  Indo-Islamic  ')).toBe('indo_islamic');
    expect(importSlugify('!!!')).toBe('');
  });
});

describe('schema v3 test fields', () => {
  it('reads exam, pool and serve off the test block', () => {
    const raw = wrap([GOOD_MCQ], { title: 'HOA', exam: 'nata', pool: 150, serve: '50' });
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.test).toMatchObject({ exam: 'NATA', pool: 150, serve: 50 });
  });

  it('gives every question the test exam unless the question names its own', () => {
    const { exam: _drop, ...noExam } = GOOD_MCQ;
    const raw = wrap(
      [noExam, { ...noExam, question: 'Which city was Fatehpur Sikri built near?', exam: 'BOTH' }],
      { title: 'HOA', exam: 'JEE' },
    );
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.questions.map((q) => q.exam_relevance)).toEqual(['JEE', 'BOTH']);
  });

  it('ignores a pool or serve that is not a positive number', () => {
    const result = validateImportJSON(wrap([GOOD_MCQ], { title: 'x', pool: 'lots', serve: -3 }), REGISTRY);
    expect(result.test.pool).toBeNull();
    expect(result.test.serve).toBeNull();
  });

  it('carries no difficulty in the sample or the spec', () => {
    expect(JSON.stringify(importSampleObject())).not.toContain('difficulty');
    expect(TEST_JSON_SPEC).not.toContain('difficulty');
    expect(TEST_JSON_SPEC).not.toMatch(/\u2014|--|&mdash;/);
  });

  it('puts pool and serve in the spec sample, and in the plain sample only when asked', () => {
    const spec = importSampleObject('BOTH', '', SPEC_EXAMPLE) as any;
    expect(spec.test).toMatchObject({ exam: 'BOTH', pool: 150, serve: 50 });
    const plain = importSampleObject() as any;
    expect(plain.test.pool).toBeUndefined();
    expect(plain.test.serve).toBeUndefined();
  });
});

describe('several replies pasted one after another', () => {
  const batch = (from: number, count: number, test: Record<string, unknown> = { title: 'HOA', exam: 'NATA', pool: 6, serve: 3 }) =>
    JSON.stringify({
      schema: SCHEMA_NAME,
      version: SCHEMA_VERSION,
      test,
      questions: Array.from({ length: count }, (_, i) => ({
        ...GOOD_MCQ,
        question: `Batch question ${from + i}: which dynasty built this monument?`,
      })),
    });

  it('splits objects separated by chat text and markdown fences', () => {
    const raw = [
      'Here is the first batch:',
      '```json',
      batch(1, 2),
      '```',
      'continue',
      'Sure! Batch 2 of 2 [final]:',
      '```',
      batch(3, 2),
      '```',
    ].join('\n');
    const parts = splitJsonReplies(raw);
    expect(parts).toHaveLength(2);
    expect(JSON.parse(parts[1]).questions[0].question).toContain('Batch question 3');
  });

  it('respects brackets and escaped quotes inside strings', () => {
    const tricky = JSON.stringify({
      questions: [{ ...GOOD_MCQ, question: 'Which "}]" bracket \\ closes { this [ stem?' }],
    });
    const parts = splitJsonReplies(`${tricky}\n${batch(1, 1)}`);
    expect(parts).toHaveLength(2);
    expect(JSON.parse(parts[0]).questions[0].question).toBe('Which "}]" bracket \\ closes { this [ stem?');
  });

  it('splits bare arrays as well as objects', () => {
    const parts = splitJsonReplies(`${JSON.stringify([GOOD_MCQ])}\n\n${JSON.stringify([{ ...GOOD_MCQ, question: 'A second question entirely here?' }])}`);
    expect(parts).toHaveLength(2);
  });

  it('ignores a stray bracket in the prose instead of swallowing the reply after it', () => {
    const parts = splitJsonReplies(`Note [see page 4\n${batch(1, 1)}`);
    expect(parts).toHaveLength(1);
  });

  it('merges every reply into one set and says how many replies it read', () => {
    const raw = `${batch(1, 2)}\ncontinue\n${batch(3, 2)}\n${batch(5, 2)}`;
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(6);
    expect(result.replies).toBe(3);
    expect(new Set(result.questions.map((q) => q.key)).size).toBe(6);
    expect(result.test).toMatchObject({ title: 'HOA', exam: 'NATA', pool: 6, serve: 3 });
    const checks = validationReport(result);
    expect(checks[1]).toEqual({ level: 'ok', message: '6 questions read from 3 replies, all have a correct answer' });
  });

  it('skips a question a later reply repeats', () => {
    const raw = `${batch(1, 2)}\n${batch(2, 2)}`;
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.questions).toHaveLength(3);
    expect(result.warnings.join(' ')).toContain('repeats an earlier question');
  });

  it('keeps the first reply title when a later one differs', () => {
    const raw = `${batch(1, 1)}\n${batch(2, 1, { title: 'Something else' })}`;
    expect(validateImportJSON(raw, REGISTRY).test.title).toBe('HOA');
  });

  it('warns when the last reply was cut off, keeping the complete ones', () => {
    const full = batch(1, 2);
    const cut = batch(3, 2).slice(0, -60);
    const result = validateImportJSON(`${full}\n${cut}`, REGISTRY);
    expect(result.questions.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.join(' ')).toContain('stops partway through');
  });

  it('forgives a trailing comma a chat model left in', () => {
    const raw = batch(1, 1).replace(/\]\}$/, ',]}');
    const result = validateImportJSON(raw, REGISTRY);
    expect(result.questions).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it('a single reply still reports the plain count', () => {
    const checks = validationReport(validateImportJSON(batch(1, 2), REGISTRY));
    expect(checks[1].message).toBe('2 questions found, all have a correct answer');
  });
});
