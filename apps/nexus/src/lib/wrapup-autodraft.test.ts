import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted, because vi.mock is lifted above every const in this file and a
// plain `const fn = vi.fn()` would not exist yet when the factory runs.
const {
  readStoredTranscript,
  buildWrapUpDraft,
  loadClassImages,
  loadTagRegistry,
  applyWrapUp,
} = vi.hoisted(() => ({
  readStoredTranscript: vi.fn(),
  buildWrapUpDraft: vi.fn(),
  loadClassImages: vi.fn(),
  loadTagRegistry: vi.fn(),
  applyWrapUp: vi.fn(),
}));

vi.mock('./transcript-resolver', () => ({ readStoredTranscript }));
vi.mock('./class-wrapup-draft', () => ({ buildWrapUpDraft, loadClassImages, loadTagRegistry }));
vi.mock('./class-wrapup-write', () => ({ applyWrapUp }));

import {
  findWrapUpCandidates,
  autodraftWrapUpForClass,
  runWrapUpAutodraft,
} from './wrapup-autodraft';

/**
 * A Supabase double for the two reads the candidate scan makes.
 *
 * `classes` is what the filtered class query would return, and `transcripts` is
 * the set of class ids with a stored transcript.
 */
function makeSupabase(classes: any[], transcriptIds: string[]) {
  const applied: Array<[string, ...any[]]> = [];

  const client = {
    from(table: string) {
      if (table === 'nexus_class_transcripts') {
        const chain: any = {
          select: () => chain,
          in: () => chain,
          eq: () => Promise.resolve({ data: transcriptIds.map((id) => ({ class_id: id })) }),
        };
        return chain;
      }

      const chain: any = {
        select: () => chain,
        is: (col: string, val: any) => {
          applied.push(['is', col, val]);
          return chain;
        },
        eq: (col: string, val: any) => {
          applied.push(['eq', col, val]);
          return chain;
        },
        neq: (col: string, val: any) => {
          applied.push(['neq', col, val]);
          return chain;
        },
        in: (col: string, val: any) => {
          applied.push(['in', col, val]);
          return chain;
        },
        lte: (col: string, val: any) => {
          applied.push(['lte', col, val]);
          return chain;
        },
        order: () => chain,
        limit: () => Promise.resolve({ data: classes, error: null }),
      };
      return chain;
    },
  };

  return { client, applied };
}

const CLASS = {
  id: 'class-1',
  classroom_id: 'room-1',
  title: 'Class by Ar Hari Babu',
  description: null,
  scheduled_date: '2026-07-31',
  meeting_group_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  loadClassImages.mockResolvedValue([]);
  loadTagRegistry.mockResolvedValue([]);
  applyWrapUp.mockResolvedValue({ ok: true, contentEdited: true, topicMoved: true });
  readStoredTranscript.mockResolvedValue([{ start: 0, end: 5, text: 'hello' }]);
  buildWrapUpDraft.mockResolvedValue({
    suggested_title: 'Perspective basics',
    short_description: 'A brief',
    detailed_description: 'The detail',
    bullets: ['One', 'Two'],
    matched: [{ id: 'tag-a', slug: 'aptitude', label: 'Aptitude', group_type: 'subject', color: null }],
    unmatched: [],
  });
});

describe('findWrapUpCandidates', () => {
  it('only ever asks for classes nobody has described', async () => {
    // THE guard. `content_edited_at IS NULL` is what keeps a teacher's words safe
    // and stops the machine redrafting its own work, in one column check.
    const { client, applied } = makeSupabase([CLASS], ['class-1']);
    await findWrapUpCandidates(client, 3);

    expect(applied).toContainEqual(['is', 'content_edited_at', null]);
    expect(applied).toContainEqual(['eq', 'publish_state', 'published']);
    expect(applied).toContainEqual(['neq', 'status', 'cancelled']);
  });

  it('drops a class with no stored transcript', async () => {
    // Never falls back to the full resolver ladder here: that would spend Graph
    // and SharePoint calls per class and burn the transcript attempt cap.
    const { client } = makeSupabase([CLASS], []);
    expect(await findWrapUpCandidates(client, 3)).toHaveLength(0);
  });

  it('keeps a class that has one', async () => {
    const { client } = makeSupabase([CLASS], ['class-1']);
    const found = await findWrapUpCandidates(client, 3);
    expect(found.map((c) => c.id)).toEqual(['class-1']);
  });

  it('honours the limit', async () => {
    const many = ['a', 'b', 'c', 'd'].map((id) => ({ ...CLASS, id }));
    const { client } = makeSupabase(many, ['a', 'b', 'c', 'd']);
    expect(await findWrapUpCandidates(client, 2)).toHaveLength(2);
  });

  it('returns nothing for a zero or negative budget', async () => {
    // The caller subtracts what the recap sweep already spent, so this is a real
    // input, not a defensive nicety.
    const { client } = makeSupabase([CLASS], ['class-1']);
    expect(await findWrapUpCandidates(client, 0)).toHaveLength(0);
  });

  it('treats an explicitly empty class list as nothing to do', async () => {
    // Different from "no filter". The event path passes the ids whose transcripts
    // just landed; none means none, not "sweep everything".
    const { client } = makeSupabase([CLASS], ['class-1']);
    expect(await findWrapUpCandidates(client, 3, { classIds: [] })).toHaveLength(0);
  });

  it('drops the date floor on the event path', async () => {
    // The class whose transcript just arrived is TODAY's, and a "before today"
    // rule would exclude the very thing we were told about.
    const { client, applied } = makeSupabase([CLASS], ['class-1']);
    await findWrapUpCandidates(client, 3, { classIds: ['class-1'] });

    expect(applied).toContainEqual(['in', 'id', ['class-1']]);
    expect(applied.some(([op]) => op === 'lte')).toBe(false);
  });
});

describe('autodraftWrapUpForClass', () => {
  it('writes the draft with a NULL author', async () => {
    const { client } = makeSupabase([], []);
    const outcome = await autodraftWrapUpForClass(client, CLASS);

    expect(outcome.ok).toBe(true);
    const [, , patch, editor] = applyWrapUp.mock.calls[0];
    expect(editor).toBeNull();
    expect(patch.title).toBe('Perspective basics');
    expect(patch.summary_bullets).toEqual(['One', 'Two']);
    expect(patch.tag_ids).toEqual(['tag-a']);
  });

  it('skips a class whose stored transcript is empty', async () => {
    readStoredTranscript.mockResolvedValue([]);
    const { client } = makeSupabase([], []);
    const outcome = await autodraftWrapUpForClass(client, CLASS);

    expect(outcome).toMatchObject({ ok: false, reason: 'no_transcript' });
    expect(applyWrapUp).not.toHaveBeenCalled();
  });

  it('writes nothing when the model returned no title', async () => {
    // Saving an empty title would either fail validation or replace a real Teams
    // subject with nothing at all.
    buildWrapUpDraft.mockResolvedValue({
      suggested_title: '   ',
      short_description: '',
      detailed_description: '',
      bullets: [],
      matched: [],
      unmatched: [],
    });
    const { client } = makeSupabase([], []);
    const outcome = await autodraftWrapUpForClass(client, CLASS);

    expect(outcome).toMatchObject({ ok: false, reason: 'empty_draft' });
    expect(applyWrapUp).not.toHaveBeenCalled();
  });

  it('classifies a Gemini quota refusal as rate_limited, not an error', async () => {
    buildWrapUpDraft.mockRejectedValue(new Error('429 Too Many Requests'));
    const { client } = makeSupabase([], []);
    expect(await autodraftWrapUpForClass(client, CLASS)).toMatchObject({ reason: 'rate_limited' });
  });

  it('never throws, so one bad class cannot end a sweep', async () => {
    buildWrapUpDraft.mockRejectedValue(new Error('something exploded'));
    const { client } = makeSupabase([], []);
    expect(await autodraftWrapUpForClass(client, CLASS)).toMatchObject({ reason: 'error' });
  });
});

describe('runWrapUpAutodraft', () => {
  it('stops the WHOLE run on a rate limit', async () => {
    // Not "skip this class". The key is shared with three other apps, so trying
    // the next class spends another call on a key that has already said no.
    const classes = ['a', 'b', 'c'].map((id) => ({ ...CLASS, id }));
    const { client } = makeSupabase(classes, ['a', 'b', 'c']);
    buildWrapUpDraft.mockRejectedValue(new Error('RESOURCE_EXHAUSTED'));

    const result = await runWrapUpAutodraft(client, { limit: 3 });

    expect(result.rateLimited).toBe(true);
    expect(buildWrapUpDraft).toHaveBeenCalledTimes(1);
  });

  it('reads the tag registry once for the run, not once per class', async () => {
    const classes = ['a', 'b', 'c'].map((id) => ({ ...CLASS, id }));
    const { client } = makeSupabase(classes, ['a', 'b', 'c']);

    const result = await runWrapUpAutodraft(client, { limit: 3 });

    expect(result.drafted).toBe(3);
    expect(loadTagRegistry).toHaveBeenCalledTimes(1);
  });

  it('spends nothing at all when the budget is used up', async () => {
    const { client } = makeSupabase([CLASS], ['class-1']);
    const result = await runWrapUpAutodraft(client, { limit: 0 });

    expect(result.drafted).toBe(0);
    expect(loadTagRegistry).not.toHaveBeenCalled();
    expect(buildWrapUpDraft).not.toHaveBeenCalled();
  });

  it('counts a skip without stopping', async () => {
    const classes = ['a', 'b'].map((id) => ({ ...CLASS, id }));
    const { client } = makeSupabase(classes, ['a', 'b']);
    readStoredTranscript.mockResolvedValueOnce([]);

    const result = await runWrapUpAutodraft(client, { limit: 2 });

    expect(result.skipped).toBe(1);
    expect(result.drafted).toBe(1);
    expect(result.rateLimited).toBe(false);
  });
});
