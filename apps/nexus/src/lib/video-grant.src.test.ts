// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.mock('@neram/database', () => ({ getSupabaseAdminClient: vi.fn(), getNexusSetting: vi.fn() }));
vi.mock('./recording-source-cache', () => ({ resolveMedia: vi.fn() }));

import { buildStreamSrc } from './video-grant';

describe('buildStreamSrc', () => {
  it('keeps the Vercel route when no media origin is configured', () => {
    expect(buildStreamSrc('vid_a.b', undefined)).toBe('/api/media/recording?vt=vid_a.b');
    expect(buildStreamSrc('vid_a.b', '')).toBe('/api/media/recording?vt=vid_a.b');
  });

  it('points at the media Worker when MEDIA_PROXY_ORIGIN is set', () => {
    expect(buildStreamSrc('vid_a.b', 'https://media.neramclasses.com')).toBe(
      'https://media.neramclasses.com/recording?vt=vid_a.b',
    );
  });

  it('tolerates a trailing slash and encodes the token', () => {
    expect(buildStreamSrc('vid_a+b/c.d', 'https://media.neramclasses.com/')).toBe(
      'https://media.neramclasses.com/recording?vt=vid_a%2Bb%2Fc.d',
    );
  });

  it('keeps the vt= marker the caption URL derivation relies on', () => {
    // RecapPlayer derives /api/media/captions?vt=... with src.split('vt=')[1].
    const src = buildStreamSrc('vid_x.y', 'https://media.neramclasses.com');
    expect(src.split('vt=')[1]).toBe('vid_x.y');
  });
});
