import { describe, it, expect } from 'vitest';
import { buildClassLinkPatch, isGraphApiUrl } from './class-links';

describe('isGraphApiUrl', () => {
  it('spots the Graph recording content endpoint', () => {
    expect(
      isGraphApiUrl(
        'https://graph.microsoft.com/v1.0/users/5b3c917c/onlineMeetings/MSo1/recordings/ktVi/content',
      ),
    ).toBe(true);
  });

  it('leaves real file links alone', () => {
    expect(
      isGraphApiUrl(
        'https://nerasmclasses.sharepoint.com/sites/2027FutureArchitectsNeramClasses/Shared%20Documents/General/Recordings/Class.mp4',
      ),
    ).toBe(false);
    expect(isGraphApiUrl('https://teams.microsoft.com/l/meetingrecap?driveId=b%21x')).toBe(false);
    expect(isGraphApiUrl('not a url')).toBe(false);
  });
});

describe('buildClassLinkPatch', () => {
  it('rejects a Graph API address, which plays for nobody', () => {
    // Regression: this exact value was stored in production and every "Watch
    // Recording" click answered `InvalidAuthenticationToken: Access token is empty`.
    const result = buildClassLinkPatch({
      recording_url:
        'https://graph.microsoft.com/v1.0/users/5b3c917c/onlineMeetings/MSo1/recordings/ktVi/content',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/access token/i);
    expect(result.patch).toEqual({});
  });

  it('accepts a SharePoint recording link', () => {
    const url =
      'https://nerasmclasses.sharepoint.com/sites/2027FutureArchitectsNeramClasses/Shared%20Documents/General/Recordings/Class.mp4';
    expect(buildClassLinkPatch({ recording_url: url })).toEqual({
      ok: true,
      error: null,
      patch: { recording_url: url },
    });
  });

  it('clears the link when given an empty string', () => {
    expect(buildClassLinkPatch({ recording_url: '' }).patch).toEqual({ recording_url: null });
  });

  it('leaves an absent key alone', () => {
    expect(buildClassLinkPatch({ youtube_url: 'https://youtu.be/abc12345678' }).patch).toEqual({
      youtube_url: 'https://www.youtube.com/watch?v=abc12345678',
    });
  });

  it('still requires http or https', () => {
    expect(buildClassLinkPatch({ recording_url: 'ftp://x/y.mp4' }).ok).toBe(false);
  });
});
