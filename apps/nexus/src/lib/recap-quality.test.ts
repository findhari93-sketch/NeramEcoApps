import { describe, it, expect } from 'vitest';
import { preflight, scoreRecapGeneration, THRESHOLDS } from './recap-quality';

const DURATION = 1800;
const TARGET = 300;
const SERVE = 3;

/** A transcript that mentions the words the questions below use. */
function transcript(duration = DURATION) {
  const lines = 90;
  const step = duration / lines;
  return Array.from({ length: lines }, (_, i) => ({
    start: Math.round(i * step),
    end: Math.round((i + 1) * step),
    text: 'The horizon line sits at eye level and the vanishing point controls the elevation perspective drawing.',
  }));
}

function question(n: number, correct: 'a' | 'b' | 'c' | 'd' = 'a') {
  return {
    question_text: `Where does the horizon line sit relative to eye level in drawing ${n}?`,
    option_a: 'At eye level',
    option_b: 'At the very top',
    option_c: 'At the base',
    option_d: 'Anywhere at all',
    correct_option: correct,
    explanation: 'The horizon line is always drawn at the viewer eye level.',
  };
}

/** Six segments of 300s covering the full 1800s, three questions each. */
function goodSections() {
  const letters: Array<'a' | 'b' | 'c' | 'd'> = ['a', 'b', 'c', 'd'];
  return Array.from({ length: 6 }, (_, i) => ({
    title: `Segment ${i + 1}`,
    description: 'Covers the perspective grid setup.',
    start_timestamp_seconds: i * TARGET,
    end_timestamp_seconds: (i + 1) * TARGET,
    questions: [0, 1, 2].map((j) => question(i * 3 + j, letters[(i + j) % 4])),
  }));
}

function score(sections: any[], duration = DURATION) {
  return scoreRecapGeneration({
    sections,
    transcript: transcript(duration),
    durationSeconds: duration,
    targetSegmentSeconds: TARGET,
    questionsToServe: SERVE,
  });
}

describe('preflight refuses to spend a Gemini call on nothing', () => {
  it('passes a real class', () => {
    expect(preflight(transcript(), DURATION).ok).toBe(true);
  });

  it('refuses an absent transcript', () => {
    const out = preflight([], DURATION);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('no_transcript');
  });

  it('refuses a handful of lines', () => {
    const out = preflight([{ start: 0, end: 5, text: 'hello can you hear me' }] as any, DURATION);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('short_transcript');
  });

  it('refuses a class that barely ran', () => {
    const out = preflight(transcript(120), 120);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('short_transcript');
  });
});

describe('a good generation publishes', () => {
  it('passes every check', () => {
    const v = score(goodSections());
    expect(v.publish).toBe(true);
    expect(v.holdReason).toBeNull();
    expect(v.score).toBeGreaterThanOrEqual(THRESHOLDS.publishScore);
    expect(v.checks.every((c) => c.passed)).toBe(true);
  });
});

describe('hard checks hold the recap whatever the score', () => {
  it('holds when the segments cover only part of the class', () => {
    // Four minutes of segments on a thirty minute class.
    const v = score(goodSections().slice(0, 1));
    expect(v.publish).toBe(false);
    expect(v.holdReason).toBe('low_coverage');
  });

  it('holds on a gap longer than the limit', () => {
    const sections = goodSections();
    sections.splice(2, 2); // rip a ten minute hole out of the middle
    const v = score(sections);
    expect(v.publish).toBe(false);
    expect(['low_coverage', 'bad_boundaries']).toContain(v.holdReason);
  });

  it('holds on overlapping segments', () => {
    const sections = goodSections();
    sections[2].start_timestamp_seconds = sections[1].start_timestamp_seconds;
    const v = score(sections);
    expect(v.publish).toBe(false);
  });

  it('holds when a segment cannot serve enough questions', () => {
    const sections = goodSections();
    sections[3].questions = [question(99)]; // 1 question, 3 must be served
    const v = score(sections);
    expect(v.publish).toBe(false);
    expect(v.holdReason).toBe('thin_questions');
  });

  it('holds a single-segment recap', () => {
    const only = [
      {
        title: 'All of it',
        description: '',
        start_timestamp_seconds: 0,
        end_timestamp_seconds: DURATION,
        questions: [question(1), question(2, 'b'), question(3, 'c')],
      },
    ];
    const v = score(only);
    expect(v.publish).toBe(false);
  });

  it('holds even when every soft check passes', () => {
    const sections = goodSections();
    sections[0].questions = []; // hard failure only
    const v = score(sections);
    const softAllPassed = v.checks.filter((c) => !c.hard).every((c) => c.passed);
    expect(softAllPassed).toBe(true);
    expect(v.publish).toBe(false);
  });
});

describe('soft checks pull the score down', () => {
  it('flags an answer key that is nearly all one letter', () => {
    const sections = goodSections().map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({ ...q, correct_option: 'a' as const })),
    }));
    const v = score(sections);
    const balance = v.checks.find((c) => c.id === 'answer_balance');
    expect(balance?.passed).toBe(false);
    expect(v.score).toBeLessThan(1);
  });

  it('flags missing explanations', () => {
    const sections = goodSections().map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({ ...q, explanation: '' })),
    }));
    expect(score(sections).checks.find((c) => c.id === 'explanations')?.passed).toBe(false);
  });

  it('holds questions that share no vocabulary with their own segment', () => {
    // The cheap hallucination detector, and the one soft check that also has a
    // hard floor under it. Nothing here was ever said in the class, so this is
    // not a recap worth polishing, it is one the model invented.
    //
    // Texts must be globally unique, or the duplicate filter starves the
    // segments and the thin_questions HARD check fires first, masking this one.
    let n = 0;
    const sections = goodSections().map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({
        ...q,
        question_text: `Which molecular orbital hybridisation governs benzene aromaticity, case ${n++}?`,
      })),
    }));
    const v = score(sections);
    expect(v.checks.find((c) => c.id === 'grounding')?.passed).toBe(false);
    expect(v.checks.find((c) => c.id === 'grounding_floor')?.passed).toBe(false);
    expect(v.publish).toBe(false);
    expect(v.holdReason).toBe('low_quality');
  });

  it('flags duplicate questions across the recap', () => {
    const dup = question(1);
    const sections = goodSections().map((s) => ({ ...s, questions: [dup, dup, dup] }));
    const v = score(sections);
    expect(v.checks.find((c) => c.id === 'distinctness')?.passed).toBe(false);
  });
});

describe('a soft failure publishes and is flagged, rather than holding', () => {
  // The change this suite exists to pin down. Holding on the soft score meant
  // one duplicated question could keep a correct, complete, grounded recap away
  // from a student for as long as it took somebody to notice, and on production
  // nobody was noticing. Cosmetic flaws are worth telling a teacher about; they
  // are not worth blocking a teenager over.

  it('publishes a recap whose answers all share one letter', () => {
    const sections = goodSections().map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({ ...q, correct_option: 'a' as const })),
    }));
    const v = score(sections);

    expect(v.checks.find((c) => c.id === 'answer_balance')?.passed).toBe(false);
    expect(v.score).toBeLessThan(THRESHOLDS.publishScore);
    expect(v.publish).toBe(true);
    expect(v.flagged).toBe(true);
    expect(v.holdReason).toBeNull();
    expect(v.summary).toMatch(/worth a look/);
  });

  it('publishes a recap with no explanations', () => {
    const sections = goodSections().map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({ ...q, explanation: '' })),
    }));
    const v = score(sections);
    expect(v.publish).toBe(true);
    expect(v.flagged).toBe(true);
  });

  it('does not flag a recap that passed everything', () => {
    const v = score(goodSections());
    expect(v.publish).toBe(true);
    expect(v.flagged).toBe(false);
  });

  it('publishes mild grounding drift but holds anything under the floor', () => {
    // Between the floor and the soft threshold the questions are still mostly
    // about the class, so a teacher gets told rather than a student getting
    // blocked. Under the floor the likeliest explanation is that the model wrote
    // about a class it was never given, and that is a wall nobody can appeal.
    let n = 0;
    const drifted = goodSections().map((s) => ({
      ...s,
      questions: s.questions.map((q, i) =>
        // One of every three questions talks about something else entirely,
        // which lands grounding at 67%: under the 70% soft bar, over the 50%
        // hard floor.
        i === 2 ? { ...q, question_text: `Explain benzene aromaticity, case ${n++}?` } : q,
      ),
    }));
    const mild = score(drifted);
    expect(mild.checks.find((c) => c.id === 'grounding')?.passed).toBe(false);
    expect(mild.checks.find((c) => c.id === 'grounding_floor')?.passed).toBe(true);
    expect(mild.publish).toBe(true);
    expect(mild.flagged).toBe(true);

    let m = 0;
    const invented = goodSections().map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({
        ...q,
        question_text: `Explain benzene aromaticity and orbital hybridisation, case ${m++}?`,
      })),
    }));
    const severe = score(invented);
    expect(severe.checks.find((c) => c.id === 'grounding_floor')?.passed).toBe(false);
    expect(severe.publish).toBe(false);
  });
});

describe('the verdict explains itself', () => {
  it('reports the measured number, not just a failure', () => {
    const v = score(goodSections().slice(0, 1));
    const coverage = v.checks.find((c) => c.id === 'coverage');
    expect(coverage?.detail).toMatch(/Covers \d+% of the class/);
    expect(coverage?.measured).toBeGreaterThan(0);
    expect(coverage?.threshold).toBe(THRESHOLDS.coverage);
  });

  it('summarises the worst failures for the tutor queue', () => {
    const v = score(goodSections().slice(0, 1));
    expect(v.summary.length).toBeGreaterThan(0);
    expect(v.summary).not.toBe('Passed every check.');
  });

  it('says so plainly when everything passed', () => {
    expect(score(goodSections()).summary).toBe('Passed every check.');
  });
});
