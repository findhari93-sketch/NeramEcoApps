// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  SCHEDULED_CLASS_LIST_COLUMNS,
  SCHEDULED_CLASS_LIST_EXCLUDED,
  isUnknownColumnError,
  selectWithColumnFallback,
} from './scheduled-class-columns';

const columns = SCHEDULED_CLASS_LIST_COLUMNS.split(',').map((c) => c.trim());

describe('SCHEDULED_CLASS_LIST_COLUMNS', () => {
  it('is an explicit list, not *', () => {
    expect(columns).not.toContain('*');
    expect(new Set(columns).size).toBe(columns.length);
  });

  it.each([...SCHEDULED_CLASS_LIST_EXCLUDED])('drops the server-only column %s', (col) => {
    expect(columns).not.toContain(col);
  });

  // Every field a calendar, card, class panel or the prep gate reads.
  it.each([
    'id',
    'classroom_id',
    'title',
    'description',
    'scheduled_date',
    'start_time',
    'end_time',
    'status',
    'publish_state',
    'batch_id',
    'teams_meeting_url',
    'teams_meeting_join_url',
    'recording_url',
    'youtube_url',
    'summary_bullets',
    'notes',
    'transcript_url',
    'teams_calendar_event_id',
    'teams_organizer_event_id',
    'recording_sync_status',
    'recording_sync_attempts',
    'recording_sync_detail',
    'organizer_email',
    'organizer_ms_oid',
    'cover_image_id',
    'kind',
  ])('keeps %s', (col) => {
    expect(columns).toContain(col);
  });
});

describe('selectWithColumnFallback', () => {
  it('uses the narrow list when the database accepts it', async () => {
    const run = vi.fn(async (_cols: string) => ({ data: [1], error: null }));
    const res = await selectWithColumnFallback(run, 'a, b', '*', 't');
    expect(res.data).toEqual([1]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('a, b');
  });

  it('retries with * when a column is unknown in this environment', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = vi.fn(async (cols: string) =>
      cols === '*' ? { data: [2], error: null } : { data: null, error: { code: '42703', message: 'column x does not exist' } },
    );
    const res = await selectWithColumnFallback(run, 'a, x', '*', 't');
    expect(res.data).toEqual([2]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const run = vi.fn(async () => ({ data: null, error: { code: '57014', message: 'timeout' } }));
    const res = await selectWithColumnFallback(run, 'a', '*', 't');
    expect(res.error).toEqual({ code: '57014', message: 'timeout' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('recognises both unknown-column codes', () => {
    expect(isUnknownColumnError({ code: '42703' })).toBe(true);
    expect(isUnknownColumnError({ code: 'PGRST204' })).toBe(true);
    expect(isUnknownColumnError({ code: 'PGRST116' })).toBe(false);
    expect(isUnknownColumnError(null)).toBe(false);
  });
});
