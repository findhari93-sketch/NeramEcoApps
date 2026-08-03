import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The server-side metadata generator's contract.
 *
 * Two things are being protected here, and they pull in opposite directions.
 *
 * The first is the teacher's work. This runs unattended against every class with
 * a recording, and the row it writes has no undo, so every guard that stops it
 * overwriting a human is tested explicitly.
 *
 * The second is the upload that runs straight after it. Its next step is moving a
 * 400 MB file that Teams deletes in six months, so a generator that throws would
 * cost a recording. Every failure path is asserted to return rather than raise,
 * and to leave the row untouched so the copy-paste bridge can still pick it up.
 */

const generateGeminiText = vi.fn();
const readStoredTranscript = vi.fn();

vi.mock('@/lib/gemini-client', () => ({
  generateGeminiText: (...args: unknown[]) => generateGeminiText(...args),
}));
vi.mock('@/lib/transcript-resolver', () => ({
  readStoredTranscript: (...args: unknown[]) => readStoredTranscript(...args),
}));

import { generateVideoMetaForClass, composeMetaPatch } from './class-video-meta-ai';
import { validateVideoMetaPatch } from './class-video-meta-schema';
import { YT_TITLE_MAX, YT_TAGS_MAX_CHARS, tagsCharCount } from './youtube-metadata';

const REGISTRY = [
  { id: 't1', slug: 'perspective', label: 'Perspective', group_type: 'subject', aliases: ['vanishing point'] },
  { id: 't2', slug: 'shadow', label: 'Shadow', group_type: 'theme', aliases: [] },
];

const CLASS_ROW = {
  id: 'c1',
  classroom_id: 'r1',
  teacher_id: 'u1',
  title: 'Perspective basics',
  description: null,
  summary_bullets: null,
  scheduled_date: '2026-07-28',
  youtube_url: null,
  recording_url: 'https://x.sharepoint.com/:v:/r/rec.mp4',
  transcript_url: null,
  teams_meeting_id: 'm1',
};

/** What a well-behaved model returns. */
const GOOD_JSON = JSON.stringify({
  topic_phrase: 'One Point Perspective',
  hook: 'Learn how a single vanishing point builds depth.',
  bullets: ['Set the horizon line', 'Place the vanishing point', 'Project the edges'],
  chapters: [{ t: 0, label: 'Intro' }, { t: 120, label: 'Horizon line' }, { t: 300, label: 'Practice' }],
  tag_slugs: ['perspective', 'shadow'],
  search_terms: ['1 point perspective', 'vanishing point drawing'],
  category: 'drawing',
  exam: 'nata',
  language: 'ta_en',
  difficulty: 'beginner',
});

/**
 * A Supabase double. `meta` is the existing nexus_class_video_meta row, or null.
 * Returns the upsert spy so a test can assert nothing was written.
 */
function makeSupabase(opts: { cls?: any; meta?: any } = {}) {
  const upsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn((table: string) => {
    if (table === 'nexus_scheduled_classes') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: opts.cls === undefined ? CLASS_ROW : opts.cls,
              error: null,
            })),
          })),
        })),
      };
    }
    if (table === 'nexus_class_video_meta') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: opts.meta ?? null, error: null })),
          })),
        })),
        upsert,
      };
    }
    if (table === 'nexus_qb_tags') {
      const chain: any = {};
      for (const m of ['select', 'in', 'eq']) chain[m] = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      // The second .order() is the awaited one.
      chain.order = vi.fn(() => ({
        order: vi.fn(async () => ({ data: REGISTRY, error: null })),
      }));
      return chain;
    }
    if (table === 'nexus_class_tags') {
      return { select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })) };
    }
    // users
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { name: 'Hari' } })) })),
      })),
    };
  });

  return { supabase: { from } as any, upsert };
}

beforeEach(() => {
  generateGeminiText.mockReset().mockResolvedValue(GOOD_JSON);
  readStoredTranscript.mockReset().mockResolvedValue([
    { start: 0, text: 'today we look at perspective' },
    { start: 120, text: 'the horizon line sits at eye level' },
  ]);
});

describe('generateVideoMetaForClass, guards on the teacher’s work', () => {
  it('never overwrites a listing a teacher saved', async () => {
    const { supabase, upsert } = makeSupabase({ meta: { generated_by: 'u9', status: 'draft', yt_title: 'Mine' } });
    const out = await generateVideoMetaForClass(supabase, 'c1');

    expect(out).toEqual({ status: 'skipped', reason: 'edited_by_teacher' });
    expect(upsert).not.toHaveBeenCalled();
    // The expensive part must not even be attempted.
    expect(generateGeminiText).not.toHaveBeenCalled();
  });

  it.each(['ready', 'published'])('leaves a listing at status %s alone', async (status) => {
    const { supabase, upsert } = makeSupabase({ meta: { generated_by: null, status, yt_title: '' } });
    const out = await generateVideoMetaForClass(supabase, 'c1');

    expect(out).toEqual({ status: 'skipped', reason: `status_${status}` });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('leaves a row that already has a title alone', async () => {
    const { supabase, upsert } = makeSupabase({ meta: { generated_by: null, status: 'draft', yt_title: 'Already' } });
    const out = await generateVideoMetaForClass(supabase, 'c1');

    expect(out).toEqual({ status: 'skipped', reason: 'already_has_title' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('force overrides every one of those guards, because it is an explicit press', async () => {
    const { supabase, upsert } = makeSupabase({ meta: { generated_by: 'u9', status: 'ready', yt_title: 'Mine' } });
    const out = await generateVideoMetaForClass(supabase, 'c1', { force: true });

    expect(out.status).toBe('generated');
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('generateVideoMetaForClass, failure never blocks the upload', () => {
  it('reports a rate limit as gemini_429 and writes nothing', async () => {
    generateGeminiText.mockRejectedValue(new Error('Gemini API 429: rate limit reached on all models'));
    const { supabase, upsert } = makeSupabase();

    const out = await generateVideoMetaForClass(supabase, 'c1');

    expect(out).toEqual({ status: 'failed', reason: 'gemini_429' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('writes nothing when the model returns text that is not JSON', async () => {
    generateGeminiText.mockResolvedValue('Sure! Here is your metadata, I think.');
    const { supabase, upsert } = makeSupabase();

    const out = await generateVideoMetaForClass(supabase, 'c1');

    expect(out).toEqual({ status: 'failed', reason: 'unparseable' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns rather than throws when the write itself fails', async () => {
    const { supabase, upsert } = makeSupabase();
    upsert.mockResolvedValue({ error: { message: 'permission denied' } });

    const out = await generateVideoMetaForClass(supabase, 'c1');

    // PostgREST hands back { error } instead of throwing, so an unchecked write
    // would have reported success here on every class forever.
    expect(out.status).toBe('failed');
    expect((out as any).reason).toContain('permission denied');
  });

  it('never throws, whatever the client does', async () => {
    const supabase = { from: () => { throw new Error('connection reset'); } } as any;
    await expect(generateVideoMetaForClass(supabase, 'c1')).resolves.toEqual({
      status: 'failed',
      reason: 'connection reset',
    });
  });
});

describe('generateVideoMetaForClass, the happy path', () => {
  it('stores a listing that passes the same gate the PATCH route applies', async () => {
    const { supabase, upsert } = makeSupabase();
    const out = await generateVideoMetaForClass(supabase, 'c1');

    expect(out.status).toBe('generated');
    const row = upsert.mock.calls[0][0];

    // Assert by actually running the validator, not by re-listing its rules.
    expect(validateVideoMetaPatch(row)).toEqual([]);
    expect(row.yt_title).toContain('One Point Perspective');
    expect(row.yt_description).toContain('Chapters');
    expect(row.status).toBe('draft');
  });

  it('marks the row as machine-written, which is what the skip guard reads', async () => {
    const { supabase, upsert } = makeSupabase();
    await generateVideoMetaForClass(supabase, 'c1');

    expect(upsert.mock.calls[0][0].generated_by).toBeNull();
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'scheduled_class_id' });
  });

  it('still generates when no transcript is stored, and invents no chapters', async () => {
    readStoredTranscript.mockResolvedValue(null);
    generateGeminiText.mockResolvedValue(
      JSON.stringify({
        topic_phrase: 'Perspective Basics',
        hook: 'An introduction to perspective.',
        bullets: ['What perspective is'],
        chapters: [],
        tag_slugs: ['perspective'],
        search_terms: ['perspective drawing'],
        category: 'drawing',
        exam: 'nata',
        language: 'en',
        difficulty: 'beginner',
      }),
    );
    const { supabase, upsert } = makeSupabase();

    const out = await generateVideoMetaForClass(supabase, 'c1');

    expect(out.status).toBe('generated');
    expect(upsert.mock.calls[0][0].chapters).toEqual([]);
    // The prompt has to say so, or the model fabricates timestamps.
    const prompt = generateGeminiText.mock.calls[0][0].parts[0].text;
    expect(prompt).toContain('No transcript is stored');
  });

  it('reads the stored transcript only, never the Graph ladder', async () => {
    const { supabase } = makeSupabase();
    await generateVideoMetaForClass(supabase, 'c1');

    // Running resolveTranscript here would count against this class's transcript
    // attempt cap for a hunt the sweep has already made.
    expect(readStoredTranscript).toHaveBeenCalledWith(supabase, 'c1');
  });

  it('puts the timestamped transcript in the prompt, so chapters can be real', async () => {
    const { supabase } = makeSupabase();
    await generateVideoMetaForClass(supabase, 'c1');

    const prompt = generateGeminiText.mock.calls[0][0].parts[0].text;
    expect(prompt).toContain('[0:00] today we look at perspective');
    expect(prompt).toContain('[2:00] the horizon line sits at eye level');
  });
});

describe('composeMetaPatch', () => {
  const data = {
    topicPhrase: 'One Point Perspective',
    hook: 'A hook.',
    bullets: ['a'],
    chapters: [],
    tagSlugs: ['perspective', 'shadow'],
    searchTerms: ['vanishing point'],
    category: 'drawing' as const,
    exam: 'nata' as const,
    language: 'ta_en' as const,
    difficulty: 'beginner' as const,
  };

  // The date the CLASS_ROW fixture is scheduled on, so the composed title can be
  // checked against the class it belongs to rather than a constant.
  const CLASS_DATE = '2026-07-28';

  it('resolves slugs to registry labels rather than echoing the slug', () => {
    const patch = composeMetaPatch(data as any, REGISTRY, CLASS_DATE);
    // "Perspective", not "perspective". This is what keeps a student's tap on a
    // topic matching the class.
    expect(patch.yt_description).toContain('Topic: Perspective, Shadow');
  });

  it('picks the subject tag for the title, not the theme tag', () => {
    const patch = composeMetaPatch(data as any, REGISTRY, CLASS_DATE);
    expect(patch.yt_title).toContain('Perspective');
    expect(patch.yt_title).not.toContain('Shadow');
  });

  it('ends the title with the class date', () => {
    const patch = composeMetaPatch(data as any, REGISTRY, CLASS_DATE);
    expect(patch.yt_title).toMatch(/\(28 Jul 26\)$/);
  });

  it('drops a slug the registry does not know instead of inventing a label', () => {
    const patch = composeMetaPatch(
      { ...data, tagSlugs: ['perspective', 'ghost'] } as any,
      REGISTRY,
      CLASS_DATE,
    );
    expect(patch.yt_description).toContain('Topic: Perspective');
    expect(patch.yt_description).not.toContain('ghost');
  });

  it('respects YouTube’s limits even when the model is verbose', () => {
    const patch = composeMetaPatch(
      {
        ...data,
        topicPhrase: 'A'.repeat(300),
        searchTerms: Array.from({ length: 60 }, (_, i) => `search term number ${i}`),
      } as any,
      REGISTRY,
      CLASS_DATE,
    );
    expect((patch.yt_title as string).length).toBeLessThanOrEqual(YT_TITLE_MAX);
    // A runaway topic must not be allowed to push the date off the end.
    expect(patch.yt_title).toMatch(/\(28 Jul 26\)$/);
    expect(tagsCharCount(patch.yt_tags as string[])).toBeLessThanOrEqual(YT_TAGS_MAX_CHARS);
    expect(validateVideoMetaPatch(patch)).toEqual([]);
  });
});
