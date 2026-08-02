import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./gemini-client', () => ({ generateGeminiText: vi.fn() }));

import { generateGeminiText } from './gemini-client';
import { generateSectionsAndQuestions, MAX_CALLS_PER_RECAP } from './ai-generate';

/**
 * Half an hour of class, which planSegments turns into two segments at the
 * fifteen minute default and six at a five minute target.
 */
function transcript(durationSeconds = 1800, lines = 120) {
  const step = durationSeconds / lines;
  return Array.from({ length: lines }, (_, i) => ({
    start: Math.round(i * step),
    end: Math.round((i + 1) * step),
    text: `Line ${i}: the vanishing point placement changes the perceived elevation height.`,
  }));
}

function question(n: number) {
  return {
    question_text: `Question ${n}: how does vanishing point placement change perceived height?`,
    option_a: `A${n}`,
    option_b: `B${n}`,
    option_c: `C${n}`,
    option_d: `D${n}`,
    correct_option: 'a',
    explanation: `Because the horizon sits at eye level, case ${n}.`,
  };
}

/** What a healthy call returns: one segment, named, with its questions. */
function reply(index: number, count: number, from = 0) {
  return JSON.stringify({
    segments: [
      {
        index,
        title: `Vanishing points, part ${index + 1}`,
        description: 'How placement changes the perceived elevation',
        questions: Array.from({ length: count }, (_, i) => question(from + i)),
      },
    ],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('one segment per call', () => {
  it('asks for each segment separately rather than batching four together', async () => {
    // The whole reason production ended up with one-checkpoint recaps. Four
    // segments at fifteen questions is sixty MCQs in one response, which
    // truncates on a real class and used to take the entire batch down with it.
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const m = /--- SEGMENT (\d+)/.exec(parts[0].text);
      return reply(Number(m![1]), 12, Number(m![1]) * 100);
    });

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 300,
      poolPerSegment: 12,
    });

    expect(out.sections).toHaveLength(6);
    expect(generateGeminiText).toHaveBeenCalledTimes(6);
    for (const call of vi.mocked(generateGeminiText).mock.calls) {
      const text = (call[0] as any).parts[0].text as string;
      expect(text.match(/--- SEGMENT /g)).toHaveLength(1);
    }
    expect(out.sections.every((s) => s.questions.length === 12)).toBe(true);
  });

  it('keeps the segments that worked when one call fails', async () => {
    vi.mocked(generateGeminiText)
      .mockResolvedValueOnce(reply(0, 10))
      .mockRejectedValueOnce(new Error('fetch failed'))
      // The retry pass has another go at the segment that came back empty.
      .mockRejectedValueOnce(new Error('fetch failed again'));

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 900,
      poolPerSegment: 10,
    });

    expect(out.sections).toHaveLength(2);
    expect(out.sections[0].questions).toHaveLength(10);
    expect(out.sections[1].questions).toHaveLength(0);
    // The named window survives, so a teacher opening the editor sees which
    // stretch of the class is missing its questions rather than a blank row.
    expect(out.sections[1].title).toMatch(/Part 2/);
  });

  it('lets a rate limit out, instead of swallowing it as one bad segment', async () => {
    // The sweep upstream stops its whole run on a refusal. Catching it here
    // would spend the rest of the budget on a key that has already said no, and
    // every app in the monorepo shares that key.
    vi.mocked(generateGeminiText).mockRejectedValue(new Error('429 Too Many Requests'));

    await expect(
      generateSectionsAndQuestions(transcript(), 'Perspective', { targetSegmentSeconds: 900 }),
    ).rejects.toThrow(/429/);
  });
});

describe('salvaging a truncated response', () => {
  it('recovers the questions written before the response was cut off', async () => {
    // A response that ran out of tokens mid-object. JSON.parse rejects the
    // whole thing, including the twelve complete questions in front of the cut,
    // and twelve grounded questions is a working checkpoint.
    const whole = JSON.parse(reply(0, 12)) as any;
    const truncated =
      JSON.stringify(whole).slice(0, JSON.stringify(whole).lastIndexOf('{"question_text"')) +
      '{"question_text":"Question 99: what happens when the resp';

    vi.mocked(generateGeminiText)
      .mockResolvedValueOnce(truncated)
      .mockResolvedValueOnce(reply(1, 12, 100));

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 900,
      poolPerSegment: 12,
    });

    expect(out.sections[0].questions).toHaveLength(11);
    expect(out.sections[0].title).toBe('Vanishing points, part 1');
    // Salvaged, so it counts as a result and the retry pass leaves it alone.
    expect(generateGeminiText).toHaveBeenCalledTimes(2);
  });

  it('does not invent a segment out of unparseable noise', async () => {
    vi.mocked(generateGeminiText).mockResolvedValue('I am sorry, I cannot help with that.');

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 900,
    });

    expect(out.sections.every((s) => s.questions.length === 0)).toBe(true);
  });
});

describe('the retry pass', () => {
  it('has one more go at a segment that came back empty', async () => {
    vi.mocked(generateGeminiText)
      .mockResolvedValueOnce(reply(0, 10))
      .mockResolvedValueOnce(JSON.stringify({ segments: [] })) // segment 1: nothing
      .mockResolvedValueOnce(reply(1, 10, 100)); // retry: it works

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 900,
      poolPerSegment: 10,
    });

    expect(generateGeminiText).toHaveBeenCalledTimes(3);
    expect(out.sections[1].questions).toHaveLength(10);
  });

  it('does not retry a segment that already has questions', async () => {
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const m = /--- SEGMENT (\d+)/.exec(parts[0].text);
      return reply(Number(m![1]), 10, Number(m![1]) * 100);
    });

    await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 900,
      poolPerSegment: 10,
    });

    expect(generateGeminiText).toHaveBeenCalledTimes(2);
  });

  it('never spends more than the call budget, retries included', async () => {
    // A backstop against a runaway loop on a shared, metered key. A ninety
    // minute class is six segments, so this only bites when nearly every one of
    // them is failing.
    vi.mocked(generateGeminiText).mockResolvedValue(JSON.stringify({ segments: [] }));

    await generateSectionsAndQuestions(transcript(5400, 300), 'Perspective', {
      targetSegmentSeconds: 900,
      poolPerSegment: 10,
    });

    expect(vi.mocked(generateGeminiText).mock.calls.length).toBeLessThanOrEqual(
      MAX_CALLS_PER_RECAP,
    );
  });
});

describe('the questions it accepts', () => {
  it('drops a question repeated inside one segment', async () => {
    const dup = question(1);
    vi.mocked(generateGeminiText).mockResolvedValue(
      JSON.stringify({
        segments: [{ index: 0, title: 'Part', description: '', questions: [dup, dup, question(2)] }],
      }),
    );

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 900,
    });

    expect(out.sections[0].questions).toHaveLength(2);
  });

  it('drops a question whose options are not four distinct answers', async () => {
    vi.mocked(generateGeminiText).mockResolvedValue(
      JSON.stringify({
        segments: [
          {
            index: 0,
            title: 'Part',
            description: '',
            questions: [
              { ...question(1), option_b: question(1).option_a },
              { ...question(2), option_c: '' },
              question(3),
            ],
          },
        ],
      }),
    );

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 900,
    });

    expect(out.sections[0].questions).toHaveLength(1);
  });
});
