import { describe, it, expect } from 'vitest';
import {
  resolvePhotoOrigin,
  photoOriginLabel,
  isExternallyHosted,
  type PhotoOrigin,
} from './photo-origin';

/**
 * Provenance matters because most photos in the review queue were never
 * submitted by anyone. On the live classroom, 17 of 21 arrived from a background
 * Microsoft sync and 4 more came from Google sign-in. Misreporting that would
 * have a teacher approve a face nobody offered.
 */

const SUPABASE = 'https://db.neramclasses.com/storage/v1/object/public';

describe('resolvePhotoOrigin', () => {
  it('returns null when there is no photo at all', () => {
    expect(resolvePhotoOrigin({ avatarUrl: null })).toBeNull();
    expect(resolvePhotoOrigin({ avatarUrl: '' })).toBeNull();
    expect(resolvePhotoOrigin({ avatarUrl: '   ' })).toBeNull();
  });

  it('null beats a stale avatar source when there is no url', () => {
    // No image means nothing to judge, whatever a leftover row claims.
    expect(resolvePhotoOrigin({ avatarSource: 'upload', avatarUrl: null })).toBeNull();
  });

  it('trusts the recorded avatar source over the url', () => {
    // The row is written by whichever code stored the image, so it beats a guess.
    expect(
      resolvePhotoOrigin({
        avatarSource: 'microsoft',
        avatarUrl: `${SUPABASE}/profile-pictures/abc/1.jpg`,
      }),
    ).toBe('microsoft');
    expect(
      resolvePhotoOrigin({
        avatarSource: 'upload',
        avatarUrl: `${SUPABASE}/documents/ms-avatars/abc/1.jpg`,
      }),
    ).toBe('upload');
  });

  it('is case insensitive about the recorded source', () => {
    expect(resolvePhotoOrigin({ avatarSource: 'Microsoft', avatarUrl: 'x' })).toBe('microsoft');
    expect(resolvePhotoOrigin({ avatarSource: ' UPLOAD ', avatarUrl: 'x' })).toBe('upload');
  });

  it('detects a Google sign-in avatar with no stored row', () => {
    // This is the real shape in prod: an lh3 URL and no user_avatars row at all.
    expect(
      resolvePhotoOrigin({
        avatarSource: null,
        avatarUrl: 'https://lh3.googleusercontent.com/a/ACg8ocLA3ALGiYn4fMLMGI4QPilU5jHNCieZ',
      }),
    ).toBe('google');
  });

  it('falls back to the storage path when no source was recorded', () => {
    expect(
      resolvePhotoOrigin({ avatarUrl: `${SUPABASE}/documents/ms-avatars/abc/1.jpg` }),
    ).toBe('microsoft');
    expect(resolvePhotoOrigin({ avatarUrl: `${SUPABASE}/profile-pictures/abc/1.jpg` })).toBe(
      'upload',
    );
  });

  it('calls anything else unknown rather than guessing', () => {
    expect(resolvePhotoOrigin({ avatarUrl: 'https://example.com/someone.jpg' })).toBe('other');
  });
});

describe('photoOriginLabel', () => {
  it('labels every origin and nothing when there is no photo', () => {
    expect(photoOriginLabel('upload')).toBe('Uploaded in Nexus');
    expect(photoOriginLabel('microsoft')).toBe('From Microsoft');
    expect(photoOriginLabel('google')).toBe('From Google sign-in');
    expect(photoOriginLabel('other')).toBe('Source unknown');
    expect(photoOriginLabel(null)).toBeNull();
  });

  it('uses no em dashes or double dashes (project content rule)', () => {
    const origins: (PhotoOrigin | null)[] = ['upload', 'microsoft', 'google', 'other', null];
    for (const origin of origins) {
      const label = photoOriginLabel(origin);
      if (label) expect(label).not.toMatch(/—|--|&mdash;/);
    }
  });
});

describe('isExternallyHosted', () => {
  it('flags exactly the origins we do not control', () => {
    // These are the ones that must be copied into our storage on approval,
    // otherwise the "approved photo" depends on a URL that can stop resolving.
    expect(isExternallyHosted('google')).toBe(true);
    expect(isExternallyHosted('other')).toBe(true);
    expect(isExternallyHosted('upload')).toBe(false);
    expect(isExternallyHosted('microsoft')).toBe(false);
    expect(isExternallyHosted(null)).toBe(false);
  });
});
