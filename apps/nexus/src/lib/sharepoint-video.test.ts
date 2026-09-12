import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));

import {
  classifyRecordingLink,
  toResolvedVideoItem,
  isOneDriveItem,
  recordingPolicyProblem,
  sameRecording,
  graphStatusToCode,
  resolveVideoItem,
  resolveVideoItemCached,
  clearVideoItemCache,
  getDriveItemThumbnailUrl,
  VideoItemError,
  videoItemMessage,
} from './sharepoint-video';

/**
 * Turning whatever a teacher picked or pasted into the real video file.
 *
 * The recordings screen showed "DispForm.aspx" as the name of a Tamil class
 * video because that is the last segment of the link SharePoint search hands
 * back. Every fixture below is a shape Microsoft Graph actually returned when
 * probed against this tenant on 2026-09-11.
 */

const calls: string[] = [];

function mockFetch(handler: (url: string) => Promise<unknown>) {
  calls.length = 0;
  global.fetch = vi.fn((input: unknown) => {
    calls.push(String(input));
    return handler(String(input));
  }) as unknown as typeof fetch;
}

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

const ONEDRIVE_DISPFORM =
  'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/Forms/DispForm.aspx?ID=10171';
const LIBRARY_DISPFORM =
  'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/Forms/DispForm.aspx?ID=86';

/** The driveItem Graph returned for the prod Tamil recording. */
const ONEDRIVE_ITEM = {
  id: '01ONEDRIVEITEM',
  name: '1.History of Architecture.mp4',
  size: 877174153,
  file: { mimeType: 'video/mp4' },
  video: { duration: 3757909 },
  webUrl:
    'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/CommonPC/1%20-%20Class/2/Study%20materials/10%20chapters%20video%20edited/1.History%20of%20Architecture.mp4',
  parentReference: {
    driveId: 'b!onedrive',
    driveType: 'business',
    path: '/drives/b!onedrive/root:/CommonPC/1 - Class/2/Study materials/10 chapters video edited',
  },
};

const LIBRARY_ITEM = {
  id: '01LIBRARYITEM',
  name: 'Ch1 History Tamil.mp4',
  size: 877174153,
  file: { mimeType: 'video/mp4' },
  video: { duration: 3758200 },
  webUrl:
    'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos/Ch1%20History%20Tamil.mp4',
  parentReference: {
    driveId: 'b!library',
    driveType: 'documentLibrary',
    path: '/drives/b!library/root:/nexus/class-videos',
  },
};

beforeEach(() => {
  clearVideoItemCache();
});

describe('classifyRecordingLink', () => {
  it('recognises a list form link, which is the shape SharePoint search hands back', () => {
    expect(classifyRecordingLink(LIBRARY_DISPFORM)).toMatchObject({
      shape: 'list_form',
      oneDrive: false,
      url: LIBRARY_DISPFORM,
    });
  });

  it('knows a OneDrive address when it sees one', () => {
    expect(classifyRecordingLink(ONEDRIVE_DISPFORM)).toMatchObject({ shape: 'list_form', oneDrive: true });
  });

  it('turns a Stream player link into the address of the file it plays', () => {
    const link = classifyRecordingLink(
      'https://neram.sharepoint.com/sites/Neram/_layouts/15/stream.aspx?id=%2Fsites%2FNeram%2FRecordings%2FCh3%20English.mp4&web=1',
    );
    expect(link).toMatchObject({
      shape: 'stream_page',
      url: 'https://neram.sharepoint.com/sites/Neram/Recordings/Ch3%20English.mp4',
    });
  });

  it('reads the file out of a Teams recap link', () => {
    const inner = 'https://nerasmclasses-my.sharepoint.com/personal/x/Documents/Recordings/Class.mp4';
    const recap = `https://teams.microsoft.com/l/meetingrecap?fileUrl=${encodeURIComponent(inner)}`;
    expect(classifyRecordingLink(recap)).toMatchObject({ shape: 'teams_recap', oneDrive: true, url: inner });
  });

  it('recognises a sharing link and a plain file address', () => {
    expect(classifyRecordingLink('https://neram.sharepoint.com/:v:/s/Neram/EaBc123').shape).toBe('share_link');
    expect(classifyRecordingLink(LIBRARY_ITEM.webUrl).shape).toBe('file_path');
  });

  it('sets apart YouTube, other sites and things that are not links, none of which SharePoint can look up', () => {
    expect(classifyRecordingLink('https://youtu.be/dQw4w9WgXcQ').shape).toBe('youtube');
    expect(classifyRecordingLink('https://drive.google.com/file/d/abc').shape).toBe('not_sharepoint');
    expect(classifyRecordingLink('not a link').shape).toBe('invalid');
  });
});

describe('toResolvedVideoItem', () => {
  it('keeps what a teacher needs to recognise the file', () => {
    expect(toResolvedVideoItem(ONEDRIVE_ITEM)).toEqual({
      driveId: 'b!onedrive',
      itemId: '01ONEDRIVEITEM',
      name: '1.History of Architecture.mp4',
      sizeBytes: 877174153,
      durationSeconds: 3758,
      webUrl: ONEDRIVE_ITEM.webUrl,
      folderPath: 'CommonPC/1 - Class/2/Study materials/10 chapters video edited',
      driveType: 'business',
      mimeType: 'video/mp4',
      isFolder: false,
    });
  });

  it('leaves the duration empty when Graph has not measured the video', () => {
    expect(toResolvedVideoItem({ ...LIBRARY_ITEM, video: undefined }).durationSeconds).toBeNull();
  });

  it('reports no folder for a file at the top of its library', () => {
    expect(
      toResolvedVideoItem({
        ...LIBRARY_ITEM,
        parentReference: { driveId: 'b!library', path: '/drives/b!library/root:' },
      }).folderPath,
    ).toBeNull();
  });
});

describe('isOneDriveItem', () => {
  it('treats a OneDrive for Business drive as OneDrive, which Graph calls business rather than personal', () => {
    expect(isOneDriveItem({ webUrl: 'https://x.sharepoint.com/sites/a/b.mp4', driveType: 'business' })).toBe(true);
    expect(isOneDriveItem({ webUrl: null, driveType: 'personal' })).toBe(true);
  });

  it('recognises a OneDrive address even without a drive type', () => {
    expect(isOneDriveItem({ webUrl: ONEDRIVE_ITEM.webUrl, driveType: null })).toBe(true);
  });

  it('does not treat a SharePoint library as OneDrive', () => {
    expect(isOneDriveItem({ webUrl: LIBRARY_ITEM.webUrl, driveType: 'documentLibrary' })).toBe(false);
  });
});

describe('recordingPolicyProblem', () => {
  it('refuses a recording kept in OneDrive', () => {
    expect(recordingPolicyProblem(toResolvedVideoItem(ONEDRIVE_ITEM))).toBe('RECORDING_IN_ONEDRIVE');
  });

  it('accepts a video in the library', () => {
    expect(recordingPolicyProblem(toResolvedVideoItem(LIBRARY_ITEM))).toBeNull();
  });

  it('refuses a folder, and a file that is not a video', () => {
    expect(
      recordingPolicyProblem(
        toResolvedVideoItem({ ...LIBRARY_ITEM, file: undefined, folder: { childCount: 3 }, video: undefined }),
      ),
    ).toBe('NOT_A_VIDEO');
    expect(
      recordingPolicyProblem(
        toResolvedVideoItem({
          ...LIBRARY_ITEM,
          name: 'notes.pdf',
          file: { mimeType: 'application/pdf' },
          video: undefined,
        }),
      ),
    ).toBe('NOT_A_VIDEO');
  });

  it('accepts a video Graph gave no type for, going by its extension', () => {
    expect(recordingPolicyProblem(toResolvedVideoItem({ ...LIBRARY_ITEM, file: {}, video: undefined }))).toBeNull();
  });
});

describe('sameRecording', () => {
  it('is certain when the ids match', () => {
    expect(sameRecording({ driveId: 'd', itemId: 'i' }, { driveId: 'd', itemId: 'i' })).toBe('same');
  });

  it('is certain when a moved file keeps its size and its name', () => {
    expect(
      sameRecording(
        { name: 'Ch1 History.mp4', sizeBytes: 877174153 },
        { name: 'ch1 history.MP4', sizeBytes: 877174153 },
      ),
    ).toBe('same');
  });

  it('calls it likely when only the length matches, within two seconds', () => {
    expect(
      sameRecording({ name: null, durationSeconds: 3758 }, { name: 'Ch1 History Tamil.mp4', durationSeconds: 3757 }),
    ).toBe('likely');
  });

  it('calls it different when the length is off by more than two seconds', () => {
    expect(sameRecording({ durationSeconds: 3758 }, { durationSeconds: 3700 })).toBe('different');
  });

  it('never calls two unknowns the same', () => {
    expect(sameRecording({}, {})).toBe('different');
    expect(sameRecording({ sizeBytes: 0, name: 'a.mp4' }, { sizeBytes: 0, name: 'a.mp4' })).toBe('different');
  });
});

describe('graphStatusToCode', () => {
  it('maps what Graph answers to what the teacher is told', () => {
    expect(graphStatusToCode(400)).toBe('LINK_NOT_RECOGNISED');
    expect(graphStatusToCode(401)).toBe('NO_ACCESS');
    expect(graphStatusToCode(403)).toBe('NO_ACCESS');
    expect(graphStatusToCode(404)).toBe('NOT_FOUND');
    expect(graphStatusToCode(429)).toBe('GRAPH_UNAVAILABLE');
    expect(graphStatusToCode(503)).toBe('GRAPH_UNAVAILABLE');
  });
});

describe('resolveVideoItem', () => {
  it('looks a list form link up through the shares endpoint and returns the real file', async () => {
    mockFetch(async () => jsonRes(200, ONEDRIVE_ITEM));
    const item = await resolveVideoItem(ONEDRIVE_DISPFORM);
    expect(item.name).toBe('1.History of Architecture.mp4');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^https:\/\/graph\.microsoft\.com\/v1\.0\/shares\/u!.+\/driveItem\?\$select=/);
  });

  it('looks a picked file up by its ids', async () => {
    mockFetch(async () => jsonRes(200, LIBRARY_ITEM));
    await resolveVideoItem({ driveId: 'b!library', itemId: '01LIBRARYITEM' });
    expect(calls[0]).toMatch(
      /^https:\/\/graph\.microsoft\.com\/v1\.0\/drives\/b!library\/items\/01LIBRARYITEM\?\$select=/,
    );
  });

  it('refuses a link that is not SharePoint without calling Graph', async () => {
    mockFetch(async () => jsonRes(200, LIBRARY_ITEM));
    await expect(resolveVideoItem('https://youtu.be/dQw4w9WgXcQ')).rejects.toMatchObject({
      code: 'LINK_NOT_RECOGNISED',
    });
    expect(calls).toHaveLength(0);
  });

  it('says the file is gone when Graph answers 404', async () => {
    mockFetch(async () => jsonRes(404, { error: { code: 'itemNotFound' } }));
    const err = await resolveVideoItem(LIBRARY_DISPFORM).catch((e) => e);
    expect(err).toBeInstanceOf(VideoItemError);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('treats a network failure as SharePoint being unavailable, not as a bad link', async () => {
    mockFetch(async () => {
      throw new Error('socket hang up');
    });
    await expect(resolveVideoItem(LIBRARY_DISPFORM)).rejects.toMatchObject({ code: 'GRAPH_UNAVAILABLE' });
  });
});

describe('resolveVideoItemCached', () => {
  it('asks Graph once for the same link within the cache window', async () => {
    mockFetch(async () => jsonRes(200, LIBRARY_ITEM));
    await resolveVideoItemCached(LIBRARY_DISPFORM);
    await resolveVideoItemCached(LIBRARY_DISPFORM);
    expect(calls).toHaveLength(1);
  });

  it('does not remember a failure', async () => {
    let first = true;
    mockFetch(async () => {
      if (first) {
        first = false;
        return jsonRes(503, {});
      }
      return jsonRes(200, LIBRARY_ITEM);
    });
    await expect(resolveVideoItemCached(LIBRARY_DISPFORM)).rejects.toMatchObject({ code: 'GRAPH_UNAVAILABLE' });
    await expect(resolveVideoItemCached(LIBRARY_DISPFORM)).resolves.toMatchObject({
      name: 'Ch1 History Tamil.mp4',
    });
  });
});

describe('getDriveItemThumbnailUrl', () => {
  it('returns the short-lived picture link Graph hands back', async () => {
    mockFetch(async () => jsonRes(200, { url: 'https://thumb.example/large.jpg' }));
    await expect(getDriveItemThumbnailUrl('b!library', '01LIBRARYITEM')).resolves.toBe(
      'https://thumb.example/large.jpg',
    );
    expect(calls[0]).toContain('/drives/b!library/items/01LIBRARYITEM/thumbnails/0/large');
  });

  it('returns null when there is no thumbnail rather than throwing', async () => {
    mockFetch(async () => jsonRes(404, {}));
    await expect(getDriveItemThumbnailUrl('b!library', 'x')).resolves.toBeNull();
  });
});

describe('videoItemMessage', () => {
  it('names the file when it refuses a OneDrive recording, and says where it has to go', () => {
    const text = videoItemMessage('RECORDING_IN_ONEDRIVE', { name: '1.History of Architecture.mp4' });
    expect(text).toContain('1.History of Architecture.mp4');
    expect(text).toMatch(/Neram SharePoint library/);
    // And that Nexus can do the move, since the button beside it does.
    expect(text).toContain('Nexus can copy it there for you');
  });

  it('never uses a dash as punctuation', () => {
    const all = [
      'LINK_NOT_RECOGNISED',
      'NOT_FOUND',
      'NO_ACCESS',
      'GRAPH_UNAVAILABLE',
      'RECORDING_IN_ONEDRIVE',
      'NOT_A_VIDEO',
    ] as const;
    for (const code of all) {
      expect(videoItemMessage(code, { name: 'a.mp4' })).not.toMatch(/\u2014|--/);
    }
  });
});
