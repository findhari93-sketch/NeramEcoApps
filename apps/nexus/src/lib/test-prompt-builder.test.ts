import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIX,
  apportion,
  buildTestPrompt,
  mixBreakdown,
  normalisePoolServe,
  promptTagsFor,
  type BuildTestPromptOptions,
  type PromptTag,
} from './test-prompt-builder';
import { SCHEMA_NAME, SCHEMA_VERSION, validateImportJSON } from './qb-import-schema';

const TAGS: PromptTag[] = [
  { slug: 'nata', label: 'NATA', group_type: 'exam' },
  { slug: 'history_of_architecture', label: 'History of Architecture', group_type: 'subject' },
  { slug: 'general_knowledge', label: 'General Knowledge', group_type: 'subject' },
  { slug: 'still_life', label: 'Still Life', group_type: 'subject' },
  { slug: 'calculus', label: 'Calculus', group_type: 'subject' },
  { slug: 'mirror_image', label: 'Mirror Image', group_type: 'subject' },
  { slug: 'islamic_architecture', label: 'Islamic Architecture', group_type: 'theme' },
];

function opts(patch: Partial<BuildTestPromptOptions> = {}): BuildTestPromptOptions {
  return {
    chapterTitle: 'Mughal Architecture',
    exam: 'NATA',
    pool: 150,
    serve: 50,
    mix: { ...DEFAULT_MIX },
    language: 'English',
    tags: TAGS,
    ...patch,
  };
}

describe('buildTestPrompt', () => {
  it('opens as the paper setter for the chosen exam', () => {
    expect(buildTestPrompt(opts({ exam: 'NATA' }))).toMatch(
      /^You are a senior paper setter for NATA \(Council of Architecture\)\./,
    );
    expect(buildTestPrompt(opts({ exam: 'JEE' }))).toMatch(
      /^You are a senior paper setter for JEE Main Paper 2 B\.Arch \(NTA\)\./,
    );
    const both = buildTestPrompt(opts({ exam: 'BOTH' }));
    expect(both).toContain('NATA (Council of Architecture) and JEE Main Paper 2 B.Arch (NTA)');
  });

  it('states the pool, the serve and the chapter', () => {
    const prompt = buildTestPrompt(opts());
    expect(prompt).toContain('Write 150 multiple choice questions from the attached chapter, "Mughal Architecture",');
    expect(prompt).toContain('Each student will get 50 of the 150 at random');
    expect(prompt).toContain('No two questions may test the same fact.');
  });

  it('asks for the reading pass before writing', () => {
    const prompt = buildTestPrompt(opts());
    expect(prompt).toContain('Read the whole document');
    expect(prompt).toContain('List the key facts');
    expect(prompt).toContain('in proportion');
  });

  it('carries the exam-style rules', () => {
    const prompt = buildTestPrompt(opts());
    expect(prompt).toContain('exactly one correct answer');
    expect(prompt).toContain('same category or era');
    expect(prompt).toContain('Never use "All of the above" or "None of the above".');
    expect(prompt).toContain('NOT in capitals');
    expect(prompt).toContain('under 40 words');
    expect(prompt).toContain('"source_quote"');
    expect(prompt).toContain('1 to 2 sentences');
  });

  it('asks for batches of 50 across several replies, never a half question', () => {
    const prompt = buildTestPrompt(opts());
    expect(prompt).toContain('Send 50 questions per reply, so this takes 3 replies.');
    expect(prompt).toContain('I will type "continue"');
    expect(prompt).toContain('Never cut a question in half.');
    expect(prompt).toContain('Reply with only JSON');
  });

  it('asks for one reply when the pool fits', () => {
    const prompt = buildTestPrompt(opts({ pool: 40, serve: 20 }));
    expect(prompt).toContain('Send all 40 questions in one reply');
    expect(prompt).not.toContain('continue');
  });

  it('honours a custom batch size', () => {
    expect(buildTestPrompt(opts({ batchSize: 30 }))).toContain('Send 30 questions per reply, so this takes 5 replies.');
  });

  it('ends with a v3 sample the validator accepts, carrying pool and serve', () => {
    const prompt = buildTestPrompt(opts());
    const json = prompt.slice(prompt.indexOf('FORMAT\n') + 'FORMAT\n'.length);
    const sample = JSON.parse(json);
    expect(sample.schema).toBe(SCHEMA_NAME);
    expect(sample.version).toBe(SCHEMA_VERSION);
    expect(sample.test).toMatchObject({ title: 'Mughal Architecture', exam: 'NATA', pool: 150, serve: 50 });
    expect(json).not.toContain('difficulty');
    const result = validateImportJSON(json, []);
    expect(result.errors).toEqual([]);
    expect(result.test.serve).toBe(50);
  });

  it('never contains an em dash or a double hyphen', () => {
    for (const exam of ['NATA', 'JEE', 'BOTH'] as const) {
      for (const language of ['English', 'English with Tamil'] as const) {
        const prompt = buildTestPrompt(opts({ exam, language }));
        expect(prompt).not.toMatch(/—|–|--|&mdash;/);
      }
    }
  });

  it('clamps serve to the pool', () => {
    const prompt = buildTestPrompt(opts({ pool: 30, serve: 80 }));
    expect(prompt).toContain('Each student will get 30 of the 30');
  });

  it('works without a chapter title', () => {
    const prompt = buildTestPrompt(opts({ chapterTitle: '   ' }));
    expect(prompt).toContain('from the attached chapter and from nothing else');
  });

  it('adds the Tamil line only when asked', () => {
    expect(buildTestPrompt(opts({ language: 'English with Tamil' }))).toContain('same stem in Tamil');
    expect(buildTestPrompt(opts())).not.toContain('Tamil');
  });
});

describe('the question mix', () => {
  it('lists only the ticked kinds, with shares that add up to 100 and to the pool', () => {
    const lines = mixBreakdown({ ...DEFAULT_MIX, chronology: false, oddOneOut: false }, 150);
    expect(lines.map((l) => l.kind)).toEqual(['recall', 'identify', 'matchPairs', 'assertionReason']);
    expect(lines.reduce((s, l) => s + l.percent, 0)).toBe(100);
    expect(lines.reduce((s, l) => s + l.count, 0)).toBe(150);
  });

  it('falls back to direct recall when nothing is ticked', () => {
    const none = { recall: false, identify: false, assertionReason: false, matchPairs: false, chronology: false, oddOneOut: false };
    expect(mixBreakdown(none, 50)).toEqual([{ kind: 'recall', percent: 100, count: 50 }]);
  });

  it('writes the mix into the prompt', () => {
    const prompt = buildTestPrompt(opts({ mix: { ...DEFAULT_MIX, assertionReason: false } }));
    expect(prompt).toContain('- Direct recall,');
    expect(prompt).not.toContain('Assertion and reason');
    expect(prompt).toContain('Match the following');
  });

  it('spells out the standard assertion and reason options', () => {
    expect(buildTestPrompt(opts())).toContain('"A is true but R is false"');
  });
});

describe('apportion', () => {
  it('always adds up to the total', () => {
    for (const total of [1, 7, 50, 150, 299]) {
      expect(apportion(total, [35, 25, 15, 10, 8, 7]).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('is all zeros for nothing to share', () => {
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
  });
});

describe('normalisePoolServe', () => {
  it('keeps serve within the pool and both positive', () => {
    expect(normalisePoolServe(150, 50)).toEqual({ pool: 150, serve: 50 });
    expect(normalisePoolServe(20, 50)).toEqual({ pool: 20, serve: 20 });
    expect(normalisePoolServe(0, 0)).toEqual({ pool: 1, serve: 1 });
    expect(normalisePoolServe(900, 50)).toEqual({ pool: 300, serve: 50 });
  });
});

describe('promptTagsFor', () => {
  it('offers NATA only architecture and GK subjects, never drawing, maths or aptitude', () => {
    const { subject, theme } = promptTagsFor('NATA', TAGS);
    expect(subject.map((t) => t.slug)).toEqual(['history_of_architecture', 'general_knowledge']);
    expect(theme.map((t) => t.slug)).toEqual(['islamic_architecture']);
  });

  it('adds maths and aptitude subjects for JEE and for both', () => {
    for (const exam of ['JEE', 'BOTH'] as const) {
      const slugs = promptTagsFor(exam, TAGS).subject.map((t) => t.slug);
      expect(slugs).toContain('calculus');
      expect(slugs).toContain('mirror_image');
      expect(slugs).not.toContain('still_life');
    }
  });

  it('leaves exam tags out, since the exam travels once in test.exam', () => {
    const prompt = buildTestPrompt(opts());
    expect(prompt).not.toContain('nata (NATA)');
    expect(prompt).toContain('history_of_architecture (History of Architecture)');
    expect(prompt).toContain('THEME: islamic_architecture (Islamic Architecture)');
  });

  it('says what to do when there is no tag list', () => {
    expect(buildTestPrompt(opts({ tags: [] }))).toContain('No tag list was given');
  });
});
