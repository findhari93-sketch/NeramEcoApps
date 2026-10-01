/**
 * Library list payloads must not carry transcripts.
 *
 * A class transcript is tens of kilobytes of text plus a segments JSON array,
 * and nothing on a Library card, row, bookmark or continue-watching tile renders
 * it. With select('*') every list response shipped them anyway. Only the
 * single-video detail (getVideoById) keeps them.
 */

import { describe, it, expect, vi } from 'vitest';
import { LIBRARY_CARD_COLUMNS } from './library';

describe('LIBRARY_CARD_COLUMNS', () => {
  const columns = LIBRARY_CARD_COLUMNS.split(',').map((c) => c.trim());

  it.each(['transcript_text', 'transcript_segments', 'search_vector', 'search_text_norm'])(
    'does not ship %s to a list response',
    (col) => {
      expect(columns).not.toContain(col);
    },
  );

  it('is not a wildcard', () => {
    expect(columns).not.toContain('*');
  });

  it.each([
    'id',
    'youtube_video_id',
    'original_title',
    'approved_title',
    'suggested_title',
    'approved_description',
    'youtube_thumbnail_url',
    'youtube_thumbnail_hq_url',
    'duration_seconds',
    'published_at',
    'category',
    'subcategories',
    'topics',
    'exam',
    'language',
    'difficulty',
    'view_count',
    'bookmark_count',
    'is_published',
    'review_status',
    'transcript_status',
  ])('still ships %s, which a card or the review queue reads', (col) => {
    expect(columns).toContain(col);
  });

  it('has no duplicate columns', () => {
    expect(new Set(columns).size).toBe(columns.length);
  });
});

describe('list queries use the card columns', () => {
  it('getVideosByCategory selects LIBRARY_CARD_COLUMNS, not *', async () => {
    const select = vi.fn();
    const chain: any = {
      select: (...a: unknown[]) => {
        select(...a);
        return chain;
      },
      eq: () => chain,
      order: () => chain,
      limit: async () => ({ data: [], error: null }),
    };
    const client: any = { from: () => chain };
    const { getVideosByCategory } = await import('./library');
    await getVideosByCategory('perspective', 5, client);
    expect(select).toHaveBeenCalledWith(LIBRARY_CARD_COLUMNS);
  });

  it('bookmarks embed the card columns for the joined video', async () => {
    const select = vi.fn();
    const chain: any = {
      select: (...a: unknown[]) => {
        select(...a);
        return chain;
      },
      eq: () => chain,
      order: async () => ({ data: [], error: null }),
    };
    const client: any = { from: () => chain };
    const { getStudentBookmarks } = await import('./library');
    await getStudentBookmarks('stu-1', client);
    expect(String(select.mock.calls[0][0])).toContain(`video:library_videos(${LIBRARY_CARD_COLUMNS})`);
    expect(String(select.mock.calls[0][0])).not.toContain('library_videos(*)');
  });
});
