import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRateLimited,
  isUsableSection,
  findAutodraftCandidates,
  autodraftRecapForClass,
  runRecapAutodraft,
  MAX_DRAFTS_PER_RUN,
  STALLED_DRAFT_HOURS,
} from './recap-autodraft';

vi.mock('@neram/database', () => ({
  createRecapForClass: vi.fn(async (classId: string) => ({
    id: `recap-${classId}`,
    title: 'Generated title',
  })),
  replaceRecapSections: vi.fn(async () => undefined),
  setRecapReadiness: vi.fn(async () => undefined),
  createUserNotification: vi.fn(async () => ({ id: 'notif-1' })),
}));

vi.mock('./ai-generate', () => ({
  generateSectionsAndQuestions: vi.fn(),
}));

vi.mock('./transcript-resolver', () => ({
  readStoredTranscript: vi.fn(),
}));

import { createRecapForClass, replaceRecapSections } from '@neram/database';
import { generateSectionsAndQuestions } from './ai-generate';
import { readStoredTranscript } from './transcript-resolver';

/**
 * A transcript substantial enough to be worth generating from.
 *
 * The sweep now runs a pre-flight before it will spend a Gemini call, because a
 * three minute clip cannot produce a real checkpoint quiz and the API key is
 * shared across all four apps. A one-line fixture is below that bar, so tests
 * that want to exercise generation have to look like an actual class.
 */
function richTranscript(durationSeconds = 1800) {
  const lines = 90;
  const step = durationSeconds / lines;
  return Array.from({ length: lines }, (_, i) => ({
    start: Math.round(i * step),
    end: Math.round((i + 1) * step),
    text: `In this part of the class we look at how the vanishing point placement changes the perceived height of the elevation, and why that matters for a NATA drawing question number ${i}.`,
  }));
}

const goodSection = {
  title: 'Setting up the two-point grid',
  description: 'How the vanishing points are placed',
  start_timestamp_seconds: 0,
  end_timestamp_seconds: 420,
  questions: [
    {
      question_text: 'Where does the horizon line sit?',
      option_a: 'At eye level',
      option_b: 'At the top',
      option_c: 'At the base',
      option_d: 'Anywhere',
      correct_option: 'a' as const,
      explanation: 'The horizon is always eye level.',
    },
  ],
};

/**
 * A stand-in for the Supabase builder, just deep enough for the three batched
 * reads the candidate query makes. Each table answers from a fixture.
 */
function fakeSupabase(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        neq: () => builder,
        lt: () => builder,
        in: () => builder,
        or: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: rows, error: null }),
        then: (resolve: any) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  };
}

const HOUR = 3_600_000;

function classRow(over: Record<string, unknown> = {}) {
  return {
    id: 'class-1',
    classroom_id: 'room-1',
    title: 'Class by Ar. Hari Babu',
    scheduled_date: '2026-07-22',
    start_time: '19:00:00',
    recording_url: 'https://sharepoint/rec.mp4',
    youtube_url: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isRateLimited', () => {
  it('recognises every shape Gemini refuses in', () => {
    expect(isRateLimited('Error: 429 Too Many Requests')).toBe(true);
    expect(isRateLimited('RESOURCE_EXHAUSTED')).toBe(true);
    expect(isRateLimited('You have exceeded your quota')).toBe(true);
  });

  it('does not mistake an ordinary failure for a refusal', () => {
    // This matters: a run that stops early on a plain error would silently skip
    // every remaining class and still report success.
    expect(isRateLimited('fetch failed')).toBe(false);
    expect(isRateLimited('Recap not found')).toBe(false);
  });
});

describe('isUsableSection', () => {
  it('accepts a checkpoint a student could actually pass', () => {
    expect(isUsableSection(goodSection)).toBe(true);
  });

  it('rejects a zero length window', () => {
    // The gated player would never let anyone reach the end of it.
    expect(
      isUsableSection({ ...goodSection, end_timestamp_seconds: 0 }),
    ).toBe(false);
  });

  it('rejects a backwards window', () => {
    expect(
      isUsableSection({ ...goodSection, start_timestamp_seconds: 500, end_timestamp_seconds: 420 }),
    ).toBe(false);
  });

  it('rejects a checkpoint with no questions', () => {
    expect(isUsableSection({ ...goodSection, questions: [] })).toBe(false);
  });

  it('rejects a checkpoint with no title', () => {
    expect(isUsableSection({ ...goodSection, title: '' })).toBe(false);
  });
});

describe('findAutodraftCandidates', () => {
  it('takes a recorded class that has a transcript and no recap', async () => {
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    const found = await findAutodraftCandidates(supabase);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('class-1');
    expect(found[0].existing_recap_id).toBeNull();
  });

  it('skips a class with no stored transcript', async () => {
    // The whole point of the stored-only rule: no transcript means this sweep
    // walks away rather than paying Graph and SharePoint to go looking.
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [],
      nexus_class_transcripts: [],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('leaves a recap that already has content alone', async () => {
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'draft',
          generated_at: '2026-07-23T00:00:00Z',
          created_at: '2026-07-23T00:00:00Z',
        },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('leaves a published recap alone even when it was never generated', async () => {
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'published',
          generated_at: null,
          created_at: new Date(Date.now() - 40 * HOUR).toISOString(),
        },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('does not touch an empty draft a teacher just made', async () => {
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'draft',
          generated_at: null,
          created_at: new Date(Date.now() - 1 * HOUR).toISOString(),
        },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('adopts an empty draft that has been abandoned', async () => {
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'draft',
          generated_at: null,
          created_at: new Date(Date.now() - (STALLED_DRAFT_HOURS + 2) * HOUR).toISOString(),
        },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    const found = await findAutodraftCandidates(supabase);
    expect(found).toHaveLength(1);
    expect(found[0].existing_recap_id).toBe('recap-1');
  });

  it('never returns more than the run cap', async () => {
    const classes = Array.from({ length: 10 }, (_, i) =>
      classRow({ id: `class-${i}`, scheduled_date: `2026-07-${10 + i}` }),
    );
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: classes,
      nexus_class_recaps: [],
      nexus_class_transcripts: classes.map((c) => ({ class_id: c.id })),
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(MAX_DRAFTS_PER_RUN);
  });

  it('returns nothing when no classroom is active', async () => {
    const supabase = fakeSupabase({ nexus_classrooms: [] });
    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });
});

describe('autodraftRecapForClass', () => {
  const candidate = {
    id: 'class-1',
    classroom_id: 'room-1',
    title: 'Class by Ar. Hari Babu',
    scheduled_date: '2026-07-22',
    existing_recap_id: null,
  };

  it('drafts checkpoints from the stored transcript', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: [goodSection, { ...goodSection, start_timestamp_seconds: 420, end_timestamp_seconds: 900 }],
    } as any);

    const out = await autodraftRecapForClass({} as any, candidate);

    expect(out).toMatchObject({ ok: true, recapId: 'recap-class-1', sections: 2, questions: 2 });
    expect(createRecapForClass).toHaveBeenCalledOnce();
    expect(replaceRecapSections).toHaveBeenCalledOnce();
  });

  it('drops an unusable checkpoint rather than saving it', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: [goodSection, { ...goodSection, questions: [] }],
    } as any);

    const out = await autodraftRecapForClass({} as any, candidate);
    expect(out).toMatchObject({ ok: true, sections: 1 });
  });

  it('gives up before spending a Gemini call when there is no transcript', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(null);

    const out = await autodraftRecapForClass({} as any, candidate);
    expect(out).toMatchObject({ ok: false, reason: 'no_transcript' });
    expect(generateSectionsAndQuestions).not.toHaveBeenCalled();
    expect(createRecapForClass).not.toHaveBeenCalled();
  });

  it('holds a class too thin to quiz, without spending a Gemini call', async () => {
    // A three minute clip, or a session that was mostly "can everyone hear me".
    // There is no checkpoint quiz to be had, and the key is shared across apps.
    vi.mocked(readStoredTranscript).mockResolvedValue([
      { start: 0, end: 5, text: 'hello can you hear me' },
    ] as any);

    const out = await autodraftRecapForClass({} as any, candidate);
    expect(out).toMatchObject({ ok: false, reason: 'no_transcript' });
    expect(generateSectionsAndQuestions).not.toHaveBeenCalled();
  });

  it('saves nothing when every checkpoint is unusable', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: [{ ...goodSection, questions: [] }],
    } as any);

    const out = await autodraftRecapForClass({} as any, candidate);
    expect(out).toMatchObject({ ok: false, reason: 'no_sections' });
    expect(replaceRecapSections).not.toHaveBeenCalled();
  });

  it('reports a refusal as rate_limited, not as an ordinary error', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockRejectedValue(new Error('429 Too Many Requests'));

    const out = await autodraftRecapForClass({} as any, candidate);
    expect(out).toMatchObject({ ok: false, reason: 'rate_limited' });
  });

  it('never throws, so one bad class cannot end the sweep', async () => {
    vi.mocked(readStoredTranscript).mockRejectedValue(new Error('transcript table is gone'));

    const out = await autodraftRecapForClass({} as any, candidate);
    expect(out).toMatchObject({ ok: false, reason: 'error', detail: 'transcript table is gone' });
  });
});

describe('runRecapAutodraft', () => {
  function threeCandidates() {
    const classes = [classRow({ id: 'c1' }), classRow({ id: 'c2' }), classRow({ id: 'c3' })];
    return fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: classes,
      nexus_class_recaps: [],
      nexus_class_transcripts: classes.map((c) => ({ class_id: c.id })),
    });
  }

  it('counts each classroom so the teachers get one notification, not three', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({ sections: [goodSection] } as any);

    const run = await runRecapAutodraft(threeCandidates());
    expect(run.drafted).toBe(3);
    expect(run.byClassroom.get('room-1')).toBe(3);
    expect(run.rateLimited).toBe(false);
  });

  it('stops the whole run on a refusal instead of burning the rest of the key', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions)
      .mockResolvedValueOnce({ sections: [goodSection] } as any)
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce({ sections: [goodSection] } as any);

    const run = await runRecapAutodraft(threeCandidates());
    expect(run.drafted).toBe(1);
    expect(run.rateLimited).toBe(true);
    // The third class was never attempted.
    expect(generateSectionsAndQuestions).toHaveBeenCalledTimes(2);
  });

  it('keeps going past an ordinary failure', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions)
      .mockResolvedValueOnce({ sections: [goodSection] } as any)
      .mockRejectedValueOnce(new Error('malformed JSON from the model'))
      .mockResolvedValueOnce({ sections: [goodSection] } as any);

    const run = await runRecapAutodraft(threeCandidates());
    expect(run.drafted).toBe(2);
    expect(run.skipped).toBe(1);
    expect(run.rateLimited).toBe(false);
  });
});
