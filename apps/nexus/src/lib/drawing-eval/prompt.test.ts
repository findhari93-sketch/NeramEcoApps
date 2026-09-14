import { describe, it, expect } from 'vitest';

import { BRIEF_CRITERION, SHARED_CRITERIA } from '@/lib/drawing-rubric';

import { GENERIC_OBSERVABLE_CHECKS } from './generic-checks';
import { buildEvaluationParts, buildSystemInstruction, type PromptInput } from './prompt';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);

const criteria = SHARED_CRITERIA.map((c) => ({
  key: c.key,
  title: c.title,
  observableChecks: [...(GENERIC_OBSERVABLE_CHECKS[c.key] ?? [])],
  bandDescriptions: {},
}));

const student = { base64: 'c3R1ZGVudA==', mimeType: 'image/jpeg' };
const anchors = [1, 2, 3, 4, 5].map((band) => ({ band, base64: `a${band}`, mimeType: 'image/jpeg', comment: null }));

function input(overrides: Partial<PromptInput> = {}): PromptInput {
  return {
    briefTitle: 'Perspective of a staircase',
    briefDescription: null,
    questionText: null,
    criteria,
    anchors: [],
    student,
    ...overrides,
  };
}

const allText = (parts: ReturnType<typeof buildEvaluationParts>, system: string) =>
  [system, ...parts.map((p) => p.text ?? '')].join('\n');

describe('generic prompt', () => {
  const parts = buildEvaluationParts(input({ mode: 'generic', tagLabels: ['Still Life', 'Perspective'] }));
  const text = allText(parts, buildSystemInstruction('generic'));

  it('sends only the student sheet, last', () => {
    const images = parts.filter((p) => p.inline_data);
    expect(images).toHaveLength(1);
    expect(parts[parts.length - 1].inline_data?.data).toBe(student.base64);
    expect(text).not.toContain('REFERENCE SHEETS');
  });

  it('grades against the observable checks and entrance exam expectations', () => {
    expect(text).toContain('BAND SCALE');
    expect(text).toContain(GENERIC_OBSERVABLE_CHECKS.composition[0]);
    expect(text).toMatch(/NATA and JEE Paper 2/);
  });

  it('asks for 3 to 4 sentences to the student: what works, the biggest fix, what next', () => {
    expect(text).toMatch(/3 to 4 plain sentences/);
    expect(text).toMatch(/what works/);
    expect(text).toMatch(/single biggest fix/);
    expect(text).toMatch(/next sheet/);
  });

  it('offers the tags as a closed list', () => {
    expect(text).toContain('TAGS.');
    expect(text).toContain('Still Life; Perspective');
    expect(text).toMatch(/ONLY from this list/);
  });
});

describe('anchored prompt', () => {
  it('keeps the anchors before the student sheet, so the cacheable prefix is stable', () => {
    const parts = buildEvaluationParts(input({ anchors }));
    const images = parts.filter((p) => p.inline_data).map((p) => p.inline_data?.data);
    expect(images).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', student.base64]);
  });

  it('keeps the question text out of the shared prefix', () => {
    const a = buildEvaluationParts(input({ anchors, questionText: 'Draw a jug.' }));
    const b = buildEvaluationParts(input({ anchors, questionText: 'Draw a kettle.' }));
    expect(a.slice(0, -2)).toEqual(b.slice(0, -2));
  });

  it('leaves the tags block out when no tags are offered', () => {
    const text = allText(buildEvaluationParts(input({ anchors })), buildSystemInstruction());
    expect(text).not.toContain('TAGS.');
  });
});

describe('every instruction the model reads', () => {
  it('uses no dash as punctuation, since the model copies it into feedback', () => {
    for (const mode of ['generic', 'anchored'] as const) {
      const text = allText(
        buildEvaluationParts(input({ mode, anchors: mode === 'anchored' ? anchors : [], tagLabels: ['Still Life'] })),
        buildSystemInstruction(mode),
      );
      expect(text).not.toContain(EM);
      expect(text).not.toContain(EN);
      expect(text).not.toMatch(/--/);
      expect(text).not.toMatch(/\s-\s/);
    }
  });
});

describe('generic observable checks', () => {
  it('cover every criterion the rubric panel can show', () => {
    const keys = new Set([...SHARED_CRITERIA.map((c) => c.key), ...Object.values(BRIEF_CRITERION).map((c) => c.key)]);
    for (const key of Array.from(keys)) {
      expect(GENERIC_OBSERVABLE_CHECKS[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
