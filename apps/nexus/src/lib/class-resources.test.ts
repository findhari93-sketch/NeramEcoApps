import { describe, it, expect } from 'vitest';
import {
  cleanText,
  detectResourceKind,
  displayHost,
  isSafeHttpUrl,
  resourceCount,
  sortResources,
  youtubeThumb,
  youtubeWatchUrl,
  MAX_NOTE_LENGTH,
} from './class-resources';

describe('isSafeHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeHttpUrl('https://khanacademy.org/isometric')).toBe(true);
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects the schemes that would turn a paste into an attack', () => {
    // These strings become an href, so this is the load-bearing check in the
    // whole module: a teacher pasting from a compromised page must not be able
    // to arm script execution for a whole class of students.
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('JavaScript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('vbscript:msgbox')).toBe(false);
  });

  it('rejects anything that is not an absolute URL', () => {
    expect(isSafeHttpUrl('not a link')).toBe(false);
    expect(isSafeHttpUrl('/relative/path')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
  });
});

describe('detectResourceKind', () => {
  it('recognises every YouTube form a teacher might paste', () => {
    const forms = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'dQw4w9WgXcQ', // a bare id, copied from a share sheet
    ];
    for (const form of forms) {
      expect(detectResourceKind(form), form).toBe('youtube');
    }
  });

  it('ignores tracking noise on a watch link', () => {
    expect(
      detectResourceKind('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=130s&list=PL123'),
    ).toBe('youtube');
  });

  it('treats any other http(s) address as a plain link', () => {
    expect(detectResourceKind('https://khanacademy.org/math/geometry')).toBe('link');
  });

  it('returns null while the teacher is still typing', () => {
    // The paste box uses null to stay quiet rather than flash an error.
    expect(detectResourceKind('')).toBe(null);
    expect(detectResourceKind('   ')).toBe(null);
    expect(detectResourceKind('isometric cubes')).toBe(null);
    expect(detectResourceKind(null)).toBe(null);
  });

  it('never classifies a dangerous scheme as a link', () => {
    expect(detectResourceKind('javascript:alert(1)')).toBe(null);
    expect(detectResourceKind('data:text/html,<script>')).toBe(null);
  });
});

describe('youtubeWatchUrl', () => {
  it('canonicalises every paste to one form', () => {
    // Three shares of one video must not become three resources.
    expect(youtubeWatchUrl('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});

describe('youtubeThumb', () => {
  it('builds a thumbnail without a request', () => {
    expect(youtubeThumb('dQw4w9WgXcQ')).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
});

describe('displayHost', () => {
  it('strips www so the subtitle reads as a source', () => {
    expect(displayHost('https://www.khanacademy.org/math')).toBe('khanacademy.org');
    expect(displayHost('https://docs.google.com/x')).toBe('docs.google.com');
  });

  it('returns empty rather than throwing on a malformed row', () => {
    expect(displayHost('not a url')).toBe('');
    expect(displayHost(null)).toBe('');
  });
});

describe('sortResources', () => {
  const row = (id: string, sort_order: number, created_at: string) => ({
    id,
    sort_order,
    created_at,
  });

  it('orders by the teacher’s arrangement first', () => {
    const out = sortResources([
      row('c', 2, '2026-07-30T10:00:00Z'),
      row('a', 0, '2026-07-30T10:00:00Z'),
      row('b', 1, '2026-07-30T10:00:00Z'),
    ]);
    expect(out.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a tie by created_at', () => {
    // Reordering only rewrites the rows that moved, so ties are normal.
    const out = sortResources([
      row('late', 0, '2026-07-30T12:00:00Z'),
      row('early', 0, '2026-07-30T09:00:00Z'),
    ]);
    expect(out.map((r) => r.id)).toEqual(['early', 'late']);
  });

  it('does not mutate the array it was given', () => {
    const input = [row('b', 1, '2026-07-30T10:00:00Z'), row('a', 0, '2026-07-30T10:00:00Z')];
    sortResources(input);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('resourceCount', () => {
  it('unwraps the PostgREST aggregate shape', () => {
    expect(resourceCount({ class_resources: [{ count: 3 }] })).toBe(3);
  });

  it('returns 0 for a class loaded without the count', () => {
    // POST and PATCH use the lean select, so the embed is simply absent there.
    expect(resourceCount({})).toBe(0);
    expect(resourceCount(null)).toBe(0);
    expect(resourceCount({ class_resources: [] })).toBe(0);
  });
});

describe('cleanText', () => {
  it('trims and returns null for nothing usable', () => {
    expect(cleanText('  hello  ', 100)).toBe('hello');
    expect(cleanText('   ', 100)).toBe(null);
    expect(cleanText(undefined, 100)).toBe(null);
    expect(cleanText(42, 100)).toBe(null);
  });

  it('caps at the limit rather than rejecting', () => {
    const long = 'a'.repeat(MAX_NOTE_LENGTH + 50);
    expect(cleanText(long, MAX_NOTE_LENGTH)).toHaveLength(MAX_NOTE_LENGTH);
  });
});
