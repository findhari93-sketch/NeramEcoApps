import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildWrapUpUpdates, applyWrapUp, CONTENT_KEYS } from './class-wrapup-write';

// The Library mirror is a best-effort side effect with its own tests. Stubbed so
// these assertions are about the lock and the propagation, which are what a
// second write path would get wrong.
vi.mock('./class-library-bridge', () => ({
  syncClassToLibrary: vi.fn().mockResolvedValue(undefined),
}));

describe('buildWrapUpUpdates', () => {
  it('is partial: an absent key is left alone', () => {
    // The whole point of the partial contract. A teacher pasting the YouTube link
    // a week later must not have to restate the title and tags to do it.
    const built = buildWrapUpUpdates({ youtube_url: 'https://youtu.be/dQw4w9WgXcQ' });
    expect(built.ok).toBe(true);
    expect('title' in built.updates).toBe(false);
    expect('description' in built.updates).toBe(false);
  });

  it('is destructive when a key is present but empty', () => {
    const built = buildWrapUpUpdates({ description: '   ' });
    expect(built.updates.description).toBeNull();
  });

  it('refuses to blank a title', () => {
    const built = buildWrapUpUpdates({ title: '   ' });
    expect(built.ok).toBe(false);
    expect(built.error).toMatch(/title/i);
  });

  it('flags contentEdited only for the fields that describe the class', () => {
    // Recording links must NOT lock. Pasting a YouTube URL says nothing about
    // what the class was about, and locking on it would stop the Teams
    // reconciler correcting a title that nobody has actually written yet.
    expect(buildWrapUpUpdates({ recording_url: 'https://x.sharepoint.com/a' }).contentEdited).toBe(false);
    expect(buildWrapUpUpdates({ youtube_url: 'https://youtu.be/dQw4w9WgXcQ' }).contentEdited).toBe(false);
    expect(buildWrapUpUpdates({ topic_id: 'abc' }).contentEdited).toBe(false);

    for (const key of CONTENT_KEYS) {
      const body: Record<string, unknown> = { [key]: key === 'summary_bullets' ? ['a'] : 'x' };
      expect(buildWrapUpUpdates(body).contentEdited).toBe(true);
    }
  });

  it('drops empty bullets and stores null rather than an empty array', () => {
    const built = buildWrapUpUpdates({ summary_bullets: ['  ', 'Real point', ''] });
    expect(built.updates.summary_bullets).toEqual(['Real point']);
    expect(buildWrapUpUpdates({ summary_bullets: ['', '  '] }).updates.summary_bullets).toBeNull();
  });

  it('reports a bad link instead of writing it', () => {
    const built = buildWrapUpUpdates({ youtube_url: 'https://vimeo.com/123' });
    expect(built.ok).toBe(false);
    expect(built.updates).toEqual({});
  });
});

/**
 * A Supabase double that records what each table was asked to do.
 *
 * Deliberately hand-rolled rather than mocked per call: the propagation bug this
 * guards against is about WHICH ROWS get the second update, so the filters have
 * to be observable.
 */
function makeSupabase() {
  const calls: Array<{ table: string; op: string; payload?: any; filters: any[] }> = [];

  const client = {
    from(table: string) {
      const record = (op: string, payload?: any) => {
        const entry = { table, op, payload, filters: [] as any[] };
        calls.push(entry);
        const chain: any = {
          eq: (col: string, val: any) => {
            entry.filters.push(['eq', col, val]);
            return chain;
          },
          neq: (col: string, val: any) => {
            entry.filters.push(['neq', col, val]);
            return chain;
          },
          then: (resolve: any) => resolve({ error: null }),
        };
        return chain;
      };
      return {
        update: (payload: any) => record('update', payload),
        delete: () => record('delete'),
        insert: (payload: any) => record('insert', payload),
      };
    },
  };

  return { client, calls };
}

describe('applyWrapUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps the lock with the editor when a human writes', async () => {
    const { client, calls } = makeSupabase();
    const result = await applyWrapUp(
      client,
      { id: 'class-1', title: 'Old', description: null, meeting_group_id: null },
      { title: 'Perspective basics' },
      'user-9',
    );

    expect(result.ok).toBe(true);
    expect(result.contentEdited).toBe(true);

    const update = calls.find((c) => c.table === 'nexus_scheduled_classes' && c.op === 'update');
    expect(update?.payload.content_edited_by).toBe('user-9');
    expect(update?.payload.content_edited_at).toBeTruthy();
  });

  it('stamps the lock with a NULL author when the machine writes', async () => {
    // This is the whole convention the nightly autodraft rests on. The stamp
    // still has to be set, or the Teams reconciler puts the meeting subject back;
    // the author still has to be null, or the class looks teacher-owned and is
    // never redrafted while also never being recognised as machine work.
    const { client, calls } = makeSupabase();
    await applyWrapUp(
      client,
      { id: 'class-1', title: 'Class by Ar Hari Babu', description: null, meeting_group_id: null },
      { title: 'Shadows and shading' },
      null,
    );

    const update = calls.find((c) => c.table === 'nexus_scheduled_classes' && c.op === 'update');
    expect(update?.payload.content_edited_at).toBeTruthy();
    expect(update?.payload.content_edited_by).toBeNull();
  });

  it('does not stamp the lock when only a link changed', async () => {
    const { client, calls } = makeSupabase();
    const result = await applyWrapUp(
      client,
      { id: 'class-1', title: 'Old', description: null, meeting_group_id: null },
      { youtube_url: 'https://youtu.be/dQw4w9WgXcQ' },
      'user-9',
    );

    expect(result.contentEdited).toBe(false);
    const update = calls.find((c) => c.table === 'nexus_scheduled_classes' && c.op === 'update');
    expect(update?.payload.content_edited_at).toBeUndefined();
  });

  it('carries content AND the lock to the sibling row, never back to itself', async () => {
    // A class taught to two classrooms is two rows sharing one Teams meeting.
    // Miss this and the other classroom keeps reading the meeting subject and
    // keeps being reverted on the next reconcile.
    const { client, calls } = makeSupabase();
    await applyWrapUp(
      client,
      { id: 'class-1', title: 'Old', description: null, meeting_group_id: 'group-7' },
      { title: 'Perspective basics', summary_bullets: ['One point'] },
      'user-9',
    );

    const updates = calls.filter((c) => c.table === 'nexus_scheduled_classes' && c.op === 'update');
    expect(updates).toHaveLength(2);

    const sibling = updates[1];
    expect(sibling.filters).toContainEqual(['eq', 'meeting_group_id', 'group-7']);
    expect(sibling.filters).toContainEqual(['neq', 'id', 'class-1']);
    expect(sibling.payload.title).toBe('Perspective basics');
    expect(sibling.payload.summary_bullets).toEqual(['One point']);
    expect(sibling.payload.content_edited_by).toBe('user-9');
  });

  it('does not touch the sibling when only a link changed', async () => {
    const { client, calls } = makeSupabase();
    await applyWrapUp(
      client,
      { id: 'class-1', title: 'Old', description: null, meeting_group_id: 'group-7' },
      { recording_url: 'https://x.sharepoint.com/a' },
      'user-9',
    );

    const updates = calls.filter((c) => c.table === 'nexus_scheduled_classes' && c.op === 'update');
    expect(updates).toHaveLength(1);
  });

  it('replaces tags wholesale, deleting before inserting', async () => {
    const { client, calls } = makeSupabase();
    await applyWrapUp(
      client,
      { id: 'class-1', title: 'Old', description: null, meeting_group_id: null },
      { tag_ids: ['tag-a', 'tag-b', 'tag-a'] },
      'user-9',
    );

    const tagCalls = calls.filter((c) => c.table === 'nexus_class_tags');
    expect(tagCalls[0].op).toBe('delete');
    expect(tagCalls[1].op).toBe('insert');
    // Deduped: the picker can send the same id twice after a fast double tap.
    expect(tagCalls[1].payload).toEqual([
      { scheduled_class_id: 'class-1', tag_id: 'tag-a' },
      { scheduled_class_id: 'class-1', tag_id: 'tag-b' },
    ]);
  });

  it('leaves tags alone when the caller did not mention them', async () => {
    const { client, calls } = makeSupabase();
    await applyWrapUp(
      client,
      { id: 'class-1', title: 'Old', description: null, meeting_group_id: null },
      { title: 'Just a rename' },
      'user-9',
    );
    expect(calls.some((c) => c.table === 'nexus_class_tags')).toBe(false);
  });

  it('reports topicMoved only when the account actually changed', async () => {
    const { client } = makeSupabase();
    const cls = { id: 'class-1', title: 'Perspective basics', description: 'Brief', meeting_group_id: null };

    // Saving the same title again is not news, and refreshing the Teams card for
    // it would be a Graph round trip for nothing.
    const unchanged = await applyWrapUp(client, cls, { title: 'Perspective basics' }, 'user-9');
    expect(unchanged.topicMoved).toBe(false);

    const changed = await applyWrapUp(client, cls, { title: 'Shadows' }, 'user-9');
    expect(changed.topicMoved).toBe(true);
  });

  it('returns a 400 rather than throwing on a bad body', async () => {
    const { client, calls } = makeSupabase();
    const result = await applyWrapUp(
      client,
      { id: 'class-1', title: 'Old', description: null, meeting_group_id: null },
      { title: '' },
      'user-9',
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
