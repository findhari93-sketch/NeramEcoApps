import { describe, expect, it } from 'vitest';
import {
  MAX_TAGS_PER_QUESTION,
  buildImportPrompt,
  importSlugify,
  validateImportJSON,
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
    expect(result.test).toEqual({ title: 'HOA Test', folder_path: ['Foundation', 'History of Architecture'] });
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

  it('defaults an unknown difficulty and exam with a warning', () => {
    const result = validateImportJSON(wrap([{ ...GOOD_MCQ, difficulty: 'IMPOSSIBLE', exam: 'GATE' }]), REGISTRY);
    expect(result.questions[0].difficulty).toBe('MEDIUM');
    expect(result.questions[0].exam_relevance).toBe('BOTH');
    expect(result.warnings.join(' ')).toContain('unknown difficulty');
    expect(result.warnings.join(' ')).toContain('unknown exam');
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
    const prompt = buildImportPrompt(REGISTRY, { chapter: 'History of Architecture' });
    const start = prompt.indexOf('{\n  "test"');
    const sample = prompt.slice(start, prompt.indexOf('\n\nRULES'));
    const result = validateImportJSON(sample, REGISTRY);
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });
});

describe('importSlugify', () => {
  it('matches the registry slug rules', () => {
    expect(importSlugify('Mughal Architecture')).toBe('mughal_architecture');
    expect(importSlugify('  Indo-Islamic  ')).toBe('indo_islamic');
    expect(importSlugify('!!!')).toBe('');
  });
});
