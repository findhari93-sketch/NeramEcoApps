import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isRateLimited,
  isUsableSection,
  findAutodraftCandidates,
  autodraftRecapForClass,
  runRecapAutodraft,
  MAX_DRAFTS_PER_RUN,
  STALLED_DRAFT_HOURS,
  MAX_GENERATION_ATTEMPTS,
} from './recap-autodraft';

vi.mock('@neram/database', () => ({
  createRecapForClass: vi.fn(async (classId: string) => ({
    id: `recap-${classId}`,
    title: 'Generated title',
    status: 'draft',
    generation_attempts: 0,
  })),
  replaceRecapSections: vi.fn(async () => undefined),
  setRecapReadiness: vi.fn(async () => undefined),
  createUserNotification: vi.fn(async () => ({ id: 'notif-1' })),
  buildClassTestFromRecap: vi.fn(async () => ({
    test_id: 'test-1',
    placement_id: 'placement-1',
    question_count: 24,
    passing_pct: 85,
    must_get_right: 21,
  })),
}));

vi.mock('./ai-generate', () => ({
  generateSectionsAndQuestions: vi.fn(),
}));

vi.mock('./transcript-resolver', () => ({
  readStoredTranscript: vi.fn(),
}));

import {
  buildClassTestFromRecap,
  createRecapForClass,
  replaceRecapSections,
  setRecapReadiness,
} from '@neram/database';
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
 * A generation good enough to clear all eight quality checks and go live.
 *
 * Every other fixture in this file is deliberately thin, which means every other
 * test exercises the HELD path. Without one of these, nothing here would prove
 * that a recap can reach a student at all, which is the entire purpose of the
 * pipeline.
 *
 * Shaped against `richTranscript`: the question text reuses that transcript's
 * vocabulary so the grounding check can find its three shared content words
 * inside each segment's own window, and the correct answer rotates so the
 * answer-balance check sees no favoured letter.
 */
function publishableSections(durationSeconds = 1800, target = 300) {
  const letters = ['a', 'b', 'c', 'd'] as const;
  const count = Math.round(durationSeconds / target);
  return Array.from({ length: count }, (_, s) => ({
    title: `Vanishing points, part ${s + 1}`,
    description: 'How placement changes the perceived elevation',
    start_timestamp_seconds: s * target,
    end_timestamp_seconds: (s + 1) * target,
    questions: Array.from({ length: 12 }, (_, q) => ({
      question_text: `Part ${s + 1}, question ${q + 1}: how does vanishing point placement change the perceived elevation height in a NATA drawing?`,
      option_a: 'It raises the horizon line',
      option_b: 'It lowers the horizon line',
      option_c: 'It has no effect at all',
      option_d: 'It only changes the shadow',
      correct_option: letters[q % 4],
      explanation: 'The horizon line always sits at the eye level of the viewer.',
    })),
  }));
}

/**
 * A stand-in for the Supabase builder, just deep enough for the batched reads
 * the candidate query makes. Each table answers from a fixture; a table with no
 * fixture answers empty, which is what a class with no checkpoints looks like.
 *
 * `updates` records every write, so a test can assert that a live recap was
 * actually taken down before its checkpoints were replaced.
 */
function fakeSupabase(tables: Record<string, any[]>) {
  const updates: Array<{ table: string; patch: any }> = [];
  return {
    updates,
    from(table: string) {
      const rows = tables[table] ?? [];
      const builder: any = {
        select: () => builder,
        update: (patch: any) => {
          updates.push({ table, patch });
          return builder;
        },
        eq: () => builder,
        neq: () => builder,
        not: () => builder,
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

/** Checkpoint rows for a recap, enough to satisfy the "not broken" rule. */
function sectionRows(recapId: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `sec-${recapId}-${i}`, recap_id: recapId }));
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
      nexus_class_recap_sections: sectionRows('recap-1', 4),
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('leaves a published recap with real checkpoints alone', async () => {
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
      nexus_class_recap_sections: sectionRows('recap-1', 4),
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('repairs a published recap that has no checkpoints at all', async () => {
    // Exactly the 12 July class on production: status 'published', zero
    // sections, so every student who opened it met "Checkpoints coming soon" on
    // a class they could never clear. The old rule skipped anything published,
    // which meant it would have sat there forever.
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

    const found = await findAutodraftCandidates(supabase);
    expect(found).toHaveLength(1);
    expect(found[0].repair).toBe(true);
    expect(found[0].existing_recap_id).toBe('recap-1');
  });

  it('repairs a published recap left with a single checkpoint', async () => {
    // One checkpoint at the end of an hour is a test, not a set of checkpoints.
    // planSegments cannot produce fewer than two, so this is a generation that
    // mostly failed, not a deliberate split.
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'published',
          generated_at: new Date(Date.now() - 2 * HOUR).toISOString(),
          created_at: new Date(Date.now() - 3 * HOUR).toISOString(),
          generation_attempts: 1,
        },
      ],
      nexus_class_recap_sections: sectionRows('recap-1', 1),
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    const found = await findAutodraftCandidates(supabase);
    expect(found).toHaveLength(1);
    expect(found[0].repair).toBe(true);
  });

  it('refuses to repair a recap students have already worked through', async () => {
    // Their passed checkpoints live on these section rows and cascade on delete.
    // Regenerating would wipe progress somebody earned, so this belongs to them
    // now and any change has to go through the teacher's diffing editor.
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'published',
          generated_at: new Date(Date.now() - 40 * HOUR).toISOString(),
          created_at: new Date(Date.now() - 41 * HOUR).toISOString(),
        },
      ],
      nexus_class_recap_sections: sectionRows('recap-1', 1),
      nexus_class_recap_attempts: [{ section_id: 'sec-recap-1-0' }],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('waits out the stall window before repairing a draft somebody just generated', async () => {
    // A published recap is failing a student right now, so it is repaired at
    // once. A draft is not visible to anyone, and the teacher who generated it
    // five minutes ago may be writing the missing checkpoints by hand.
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'draft',
          generated_at: new Date(Date.now() - 1 * HOUR).toISOString(),
          created_at: new Date(Date.now() - 2 * HOUR).toISOString(),
        },
      ],
      nexus_class_recap_sections: sectionRows('recap-1', 1),
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

  it('retries a pending row at once instead of waiting out the stall window', async () => {
    // The exact production failure: the sweep created the row, generation threw,
    // and the 24 hour rule (which exists to protect a teacher mid-review) then
    // parked the class for a day behind a draft nobody was editing.
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'draft',
          readiness: 'pending',
          generated_at: null,
          created_at: new Date(Date.now() - 1 * HOUR).toISOString(),
          generation_attempts: 1,
        },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    const found = await findAutodraftCandidates(supabase);
    expect(found).toHaveLength(1);
    expect(found[0].existing_recap_id).toBe('recap-1');
  });

  it('stops retrying a class that has failed too many times', async () => {
    // Matters now that a failure holds rather than abandons: a held row with no
    // generated_at is a candidate again every night, so a class that can never
    // produce enough questions would spend the shared Gemini key forever.
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'draft',
          readiness: 'held',
          generated_at: null,
          created_at: new Date(Date.now() - 40 * HOUR).toISOString(),
          generation_attempts: MAX_GENERATION_ATTEMPTS,
        },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(0);
  });

  it('still retries a held class that has attempts left', async () => {
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: [classRow()],
      nexus_class_recaps: [
        {
          id: 'recap-1',
          scheduled_class_id: 'class-1',
          status: 'draft',
          readiness: 'held',
          generated_at: null,
          created_at: new Date(Date.now() - 40 * HOUR).toISOString(),
          generation_attempts: MAX_GENERATION_ATTEMPTS - 1,
        },
      ],
      nexus_class_transcripts: [{ class_id: 'class-1' }],
    });

    expect(await findAutodraftCandidates(supabase)).toHaveLength(1);
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

  it('puts a class a student is waiting on ahead of newer ones', async () => {
    // The pending row was inserted when a student pressed Watch and found no
    // guided recap. Without this ordering the run cap always went to whatever
    // happened to be most recent, and the class somebody actually opened today
    // waited its turn behind classes nobody had asked for.
    const classes = [
      classRow({ id: 'newest', scheduled_date: '2026-07-30' }),
      classRow({ id: 'middle', scheduled_date: '2026-07-20' }),
      classRow({ id: 'asked-for', scheduled_date: '2026-07-03' }),
    ];
    const supabase = fakeSupabase({
      nexus_classrooms: [{ id: 'room-1' }],
      nexus_scheduled_classes: classes,
      nexus_class_recaps: [
        {
          id: 'recap-asked',
          scheduled_class_id: 'asked-for',
          status: 'draft',
          readiness: 'pending',
          generated_at: null,
          created_at: new Date().toISOString(),
          generation_attempts: 0,
        },
      ],
      nexus_class_transcripts: classes.map((c) => ({ class_id: c.id })),
    });

    const found = await findAutodraftCandidates(supabase, 3);
    expect(found[0].id).toBe('asked-for');
    expect(found[0].requested).toBe(true);
    // The rest keep their newest-first order behind it.
    expect(found.map((c) => c.id)).toEqual(['asked-for', 'newest', 'middle']);
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
    repair: false,
    requested: false,
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

  it('marks the row it creates as pending, so an empty one cannot read as ready', async () => {
    // readiness defaults to 'ready' in the database. Without this the row the
    // sweep inserts before it has anything to put in it is indistinguishable
    // from a finished recap.
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: [goodSection],
    } as any);

    await autodraftRecapForClass({} as any, candidate);

    expect(createRecapForClass).toHaveBeenCalledWith('class-1', null, expect.anything(), {
      readiness: 'pending',
    });
  });

  it('holds the recap when generation throws, instead of abandoning it', async () => {
    // The production bug this fixes: the catch returned without touching the row
    // it had already created, leaving an empty draft that read as healthy, told
    // nobody, and blocked its own retry for a day.
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockRejectedValue(
      new Error('malformed JSON from the model'),
    );

    const out = await autodraftRecapForClass({} as any, candidate);

    expect(out).toMatchObject({ ok: false, reason: 'error' });
    expect(setRecapReadiness).toHaveBeenCalledWith(
      'recap-class-1',
      expect.objectContaining({
        readiness: 'held',
        hold_reason: 'generation_failed',
        hold_detail: 'malformed JSON from the model',
      }),
      expect.anything(),
    );
  });

  it('does not hold on a rate limit, because the key says nothing about the class', async () => {
    // Holding here would spend an attempt and alert every teacher over a queue
    // that drains by itself. The row stays pending and is retried next run.
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockRejectedValue(new Error('RESOURCE_EXHAUSTED'));

    await autodraftRecapForClass({} as any, candidate);

    expect(setRecapReadiness).not.toHaveBeenCalled();
  });

  it('publishes a generation that clears every check', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: publishableSections(),
    } as any);

    const out = await autodraftRecapForClass({} as any, candidate);

    expect(out).toMatchObject({ ok: true, published: true, held: false });
    expect(setRecapReadiness).toHaveBeenCalledWith(
      'recap-class-1',
      expect.objectContaining({ readiness: 'ready', publish: true }),
      expect.anything(),
    );
  });

  it('builds the class test before it publishes', async () => {
    // The gap this closes: every recap the sweep published went out without a
    // test, so a catch-up student passed all the checkpoints and then had
    // nothing to actually clear the class with. Built BEFORE the publish so a
    // recap can never be live without one.
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: publishableSections(),
    } as any);

    const out = await autodraftRecapForClass({} as any, candidate);

    expect(buildClassTestFromRecap).toHaveBeenCalledOnce();
    expect(out).toMatchObject({ ok: true, published: true, classTestQuestions: 24 });
    expect(vi.mocked(buildClassTestFromRecap).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setRecapReadiness).mock.invocationCallOrder[0],
    );
  });

  it('holds the recap when the class test cannot be built', async () => {
    // Publishing anyway would put a recap in front of students that they can
    // finish the checkpoints of and then never clear.
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: publishableSections(),
    } as any);
    vi.mocked(buildClassTestFromRecap).mockRejectedValueOnce(
      new Error('NO_CHECKPOINT_QUESTIONS'),
    );

    const out = await autodraftRecapForClass({} as any, candidate);

    expect(out).toMatchObject({ ok: false, reason: 'error' });
    expect(setRecapReadiness).toHaveBeenCalledWith(
      'recap-class-1',
      expect.objectContaining({ readiness: 'held', hold_reason: 'generation_failed' }),
      expect.anything(),
    );
  });

  it('does not build a class test for a recap it is holding', async () => {
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({ sections: [goodSection] } as any);

    const out = await autodraftRecapForClass({} as any, candidate);

    expect(out).toMatchObject({ ok: true, held: true });
    expect(buildClassTestFromRecap).not.toHaveBeenCalled();
  });

  it('takes a live recap down before replacing its checkpoints', async () => {
    // For the minute a repair takes, a student opening it would meet a
    // half-replaced checkpoint list. The catch-up screen's in-app recording is
    // a better thing to meet than that, and it goes back up if it passes.
    vi.mocked(createRecapForClass).mockResolvedValueOnce({
      id: 'recap-class-1',
      title: 'Generated title',
      status: 'published',
      generation_attempts: 1,
    } as any);
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: publishableSections(),
    } as any);

    const supabase = fakeSupabase({});
    await autodraftRecapForClass(supabase, { ...candidate, repair: true });

    expect(supabase.updates).toContainEqual({
      table: 'nexus_class_recaps',
      patch: { status: 'draft', published_at: null, auto_published_at: null },
    });
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
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({
      sections: publishableSections(),
    } as any);

    const run = await runRecapAutodraft(threeCandidates());
    expect(run.drafted).toBe(3);
    expect(run.publishedByClassroom.get('room-1')).toBe(3);
    expect(run.rateLimited).toBe(false);
  });

  it('does not announce a held recap as open for catch-up', async () => {
    // One section fails the segment-count check, so all three are held. They
    // already alert through notifyHeld; counting them here too would tell
    // teachers the class is ready when a student still cannot open it.
    vi.mocked(readStoredTranscript).mockResolvedValue(richTranscript() as any);
    vi.mocked(generateSectionsAndQuestions).mockResolvedValue({ sections: [goodSection] } as any);

    const run = await runRecapAutodraft(threeCandidates());
    expect(run.drafted).toBe(3);
    expect(run.publishedByClassroom.size).toBe(0);
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
