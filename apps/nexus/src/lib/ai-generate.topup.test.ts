import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@neram/ai', () => ({
  generateGeminiText: vi.fn(),
  AiBlockedError: class AiBlockedError extends Error {},
}));

import { generateGeminiText } from '@neram/ai';
import { generateSectionsAndQuestions, MAX_CALLS_PER_RECAP } from './ai-generate';

/**
 * Thin checkpoints were never the transcript's fault.
 *
 * On 2026-09-09 one 46,000 character transcript was split into four stretches
 * of 13, 15, 14 and 13 minutes and came back with 3, 7, 13 and 5 questions. The
 * class two days earlier, from a SHORTER transcript, returned the full pool on
 * every checkpoint. The prompt asks for "up to" and rule 8 tells the model not
 * to pad, so a thin reply is a legitimate answer to the question we asked, and
 * nothing asked again: the retry pass skipped any segment holding one or more.
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

/** Is this call a top-up, that is, does it carry the questions already held? */
function isTopUp(text: string): boolean {
  return text.includes('This segment already has these');
}

function segmentOf(text: string): number {
  return Number(/--- SEGMENT (\d+)/.exec(text)![1]);
}

function promptsSent(): string[] {
  return vi.mocked(generateGeminiText).mock.calls.map((c: any) => c[0].parts[0].text);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('topping up a thin checkpoint', () => {
  it('asks again for the checkpoint that came back short', async () => {
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const text = parts[0].text;
      const idx = segmentOf(text);
      if (isTopUp(text)) return reply(idx, 7, 500);
      return reply(idx, idx === 0 ? 3 : 10);
    });

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    expect(promptsSent().filter(isTopUp)).toHaveLength(1);
    expect(out.sections[0].questions).toHaveLength(10);
    expect(out.sections[1].questions).toHaveLength(10);
  });

  it('adds to the questions instead of replacing them', async () => {
    // The trap: the first pass ASSIGNS the reply. A top-up that assigned would
    // turn three questions into seven, losing the three that were already good.
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const text = parts[0].text;
      const idx = segmentOf(text);
      if (isTopUp(text)) return reply(idx, 7, 500);
      return reply(idx, idx === 0 ? 3 : 10);
    });

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    const texts = out.sections[0].questions.map((q) => q.question_text);
    expect(texts).toContain(question(0).question_text);
    expect(texts).toContain(question(500).question_text);
  });

  it('tells the model what it already wrote, so it does not send the same back', async () => {
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const text = parts[0].text;
      const idx = segmentOf(text);
      if (isTopUp(text)) return reply(idx, 7, 500);
      return reply(idx, idx === 0 ? 3 : 10);
    });

    await generateSectionsAndQuestions(transcript(), 'Perspective', {
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    const topUpPrompt = promptsSent().filter(isTopUp)[0];
    expect(topUpPrompt).toContain('already has these 3 questions');
    expect(topUpPrompt).toContain(question(0).question_text);
    expect(topUpPrompt).toContain('Do not repeat or rephrase');
  });

  it('drops a top-up that repeats itself rather than counting it twice', async () => {
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const text = parts[0].text;
      const idx = segmentOf(text);
      if (isTopUp(text)) return reply(idx, 3, 0);
      return reply(idx, idx === 0 ? 3 : 10);
    });

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    expect(out.sections[0].questions).toHaveLength(3);
  });

  it('leaves a full checkpoint alone', async () => {
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) =>
      reply(segmentOf(parts[0].text), 10),
    );

    await generateSectionsAndQuestions(transcript(), 'Perspective', {
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    expect(promptsSent().filter(isTopUp)).toHaveLength(0);
  });

  it('does not re-ask a segment the model deliberately left empty', async () => {
    // Greetings, an audio check, timetable admin. Rule 8 says an empty array is
    // the right answer there, and a top-up would spend a metered call to be
    // told so a second time.
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const idx = segmentOf(parts[0].text);
      return reply(idx, idx === 0 ? 0 : 10);
    });

    await generateSectionsAndQuestions(transcript(), 'Perspective', {
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    expect(promptsSent().filter(isTopUp)).toHaveLength(0);
  });

  it('does nothing at all when the caller did not ask for a floor', async () => {
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) =>
      reply(segmentOf(parts[0].text), 3),
    );

    const out = await generateSectionsAndQuestions(transcript(), 'Perspective', {
      poolPerSegment: 15,
    });

    expect(out.sections[0].questions).toHaveLength(3);
    expect(promptsSent().filter(isTopUp)).toHaveLength(0);
  });

  it('spends the remaining budget on the thinnest checkpoints first', async () => {
    // Six segments, all thin, with only four of the ten calls left. The one
    // holding two questions needs the call more than the one holding nine.
    const order: number[] = [];
    const have = [8, 2, 7, 3, 9, 4];
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) => {
      const text = parts[0].text;
      const idx = segmentOf(text);
      if (isTopUp(text)) {
        order.push(idx);
        return reply(idx, 1, 900 + idx);
      }
      return reply(idx, have[idx]);
    });

    await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 300,
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    expect(order).toEqual([1, 3, 5, 2]);
  });

  it('never exceeds the per-recap call ceiling', async () => {
    vi.mocked(generateGeminiText).mockImplementation(async ({ parts }: any) =>
      reply(segmentOf(parts[0].text), 1),
    );

    await generateSectionsAndQuestions(transcript(), 'Perspective', {
      targetSegmentSeconds: 300,
      poolPerSegment: 15,
      minPerSegment: 10,
    });

    expect(vi.mocked(generateGeminiText).mock.calls.length).toBeLessThanOrEqual(
      MAX_CALLS_PER_RECAP,
    );
  });
});
