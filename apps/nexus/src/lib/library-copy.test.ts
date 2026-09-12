import { describe, it, expect } from 'vitest';
import {
  chapterFolderName,
  copyFailureMessage,
  findFinishedCopy,
  isMonitorUrl,
  libraryDestinationPath,
  parseCopyStatus,
} from './library-copy';

/**
 * Copying a OneDrive recording into the Neram library, the parts that need no
 * network.
 *
 * Both prod recordings on the first chapter sat in personal OneDrives
 * (2026-09-11), and the teachers who own them had never used SharePoint. Nexus
 * copies the file for them. These pin the folder it lands in, the guard on the
 * address the status check fetches, and how Microsoft's progress reports read.
 */

describe('chapterFolderName', () => {
  it('turns the chapter title into a folder name SharePoint accepts', () => {
    expect(chapterFolderName('Ch:1 History Of Architecture')).toBe('Ch 1 History Of Architecture');
  });

  it('replaces every character SharePoint refuses in a folder name', () => {
    expect(chapterFolderName('a"b*c:d<e>f?g/h\\i|j')).toBe('a b c d e f g h i j');
  });

  it('drops trailing dots and spaces, which SharePoint also refuses', () => {
    expect(chapterFolderName('  Unit 3...  ')).toBe('Unit 3');
  });

  it('falls back to a plain name when nothing usable is left', () => {
    expect(chapterFolderName('')).toBe('Chapter');
    expect(chapterFolderName(null)).toBe('Chapter');
    expect(chapterFolderName(' ?:* ')).toBe('Chapter');
  });

  it('keeps a long title to a length a SharePoint path can carry', () => {
    expect(chapterFolderName('x'.repeat(300)).length).toBe(100);
  });

  it('does not end in a space after shortening', () => {
    const name = chapterFolderName(`${'a'.repeat(99)} b`);
    expect(name).toBe('a'.repeat(99));
  });

  it('keeps a Tamil title as it is', () => {
    expect(chapterFolderName('கட்டிடக்கலை வரலாறு')).toBe('கட்டிடக்கலை வரலாறு');
  });
});

describe('libraryDestinationPath', () => {
  it('names the site, the class videos folder and the chapter, as SharePoint shows them', () => {
    expect(
      libraryDestinationPath({
        folderUrl: 'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos',
        rootPath: 'nexus/class-videos',
        chapterTitle: 'Ch:1 History Of Architecture',
      }),
    ).toBe('NeramStorage › nexus › class-videos › Ch 1 History Of Architecture');
  });

  it('says Neram library when the site is not known, and uses the default folder', () => {
    expect(libraryDestinationPath({ folderUrl: null, rootPath: null, chapterTitle: 'Unit 2' })).toBe(
      'Neram library › nexus › class-videos › Unit 2',
    );
  });
});

describe('isMonitorUrl', () => {
  it('accepts the progress addresses SharePoint and OneDrive hand back for a copy', () => {
    expect(isMonitorUrl('https://nerasmclasses.sharepoint.com/_api/v2.0/monitor/4A3407B5-88FC-4504-8B21-0AABD3412717')).toBe(true);
    expect(isMonitorUrl('https://nerasmclasses-my.sharepoint.com/_api/v2.1/monitor/780293e6-07b3-4544-a126-fea909efcc84')).toBe(true);
    expect(isMonitorUrl('https://api.onedrive.com/monitor/4A3407B5-88FC-4504-8B21-0AABD3412717')).toBe(true);
  });

  it('accepts the operations address this tenant actually returns for a copy (probed 2026-09-11)', () => {
    // Not the /monitor/ shape the Graph docs show. Missing this made every live copy fail.
    expect(
      isMonitorUrl(
        'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/_api/v2.1/drives/b!XlDJSC9oqUK7KE6t5VDTWD9KG5KsBAlDq_v6wSIqU-UUMYWO53dxQIGXnihjO9-b/operations/26502aed-8d81-47ab-835f-efbc88dfc570?c=abc&v=2.0&tempauth=v1.xyz',
      ),
    ).toBe(true);
  });

  it('refuses anything else, because the status check fetches whatever address it is given', () => {
    const refused: unknown[] = [
      'https://nerasmclasses-my.sharepoint.com/personal/x/_api/v2.1/drives/b!x/items/01ITEM',
      'https://nerasmclasses-my.sharepoint.com/personal/x/_api/v2.1/drives/b!x/operations/',
      'http://nerasmclasses.sharepoint.com/_api/v2.0/monitor/abc',
      'https://sharepoint.com.evil.com/_api/v2.0/monitor/abc',
      'https://evil.com/_api/v2.0/monitor/abc?u=nerasmclasses.sharepoint.com',
      'https://nerasmclasses.sharepoint.com/_api/v2.0/drives/abc',
      'https://user:pw@nerasmclasses.sharepoint.com/_api/v2.0/monitor/abc',
      'https://nerasmclasses.sharepoint.com:8443/_api/v2.0/monitor/abc',
      'not a url',
      '',
      null,
      42,
    ];
    for (const address of refused) expect(isMonitorUrl(address), String(address)).toBe(false);
  });
});

describe('parseCopyStatus', () => {
  it('reads a copy still running, with how far it has got', () => {
    expect(parseCopyStatus({ operation: 'ItemCopy', percentageComplete: 27.8, status: 'inProgress' })).toEqual({
      state: 'copying',
      percent: 28,
    });
  });

  it('reads a copy that has not started yet as running, with no percent', () => {
    expect(parseCopyStatus({ status: 'notStarted' })).toEqual({ state: 'copying', percent: null });
  });

  it('reads a finished copy and the id of the new file', () => {
    expect(
      parseCopyStatus({ percentageComplete: 100, resourceId: '01MOWKYVJML57KN2ANMBA3JZJS2MBGC7KM', status: 'completed' }),
    ).toEqual({ state: 'done', itemId: '01MOWKYVJML57KN2ANMBA3JZJS2MBGC7KM' });
  });

  it('reads a failed copy with its reason', () => {
    expect(
      parseCopyStatus({ status: 'failed', error: { code: 'nameAlreadyExists', message: 'Name already exists' } }),
    ).toMatchObject({ state: 'failed', code: 'nameAlreadyExists' });
  });

  it('takes the first detail when a failure only lists details', () => {
    expect(
      parseCopyStatus({
        status: 'failed',
        error: {
          message: 'Errors occurred during copy/move operation.',
          details: [{ code: 'nameAlreadyExists', message: 'Name already exists' }],
        },
      }),
    ).toMatchObject({ state: 'failed', code: 'nameAlreadyExists' });
  });

  it('treats a finished copy with no file id as a failure that pressing copy again picks up', () => {
    expect(parseCopyStatus({ status: 'completed' })).toMatchObject({ state: 'failed', code: 'COPY_NO_RESULT' });
  });

  it('treats an answer it cannot read as still running, and keeps the percent in range', () => {
    expect(parseCopyStatus(null)).toEqual({ state: 'copying', percent: null });
    expect(parseCopyStatus({ status: 'somethingNew', percentComplete: 150 })).toEqual({ state: 'copying', percent: 100 });
  });
});

describe('copyFailureMessage', () => {
  it('tells the teacher a name clash is picked up by pressing copy again', () => {
    expect(copyFailureMessage('nameAlreadyExists')).toContain('Copy to Neram library again');
  });

  it('names a full library plainly', () => {
    expect(copyFailureMessage('quotaLimitReached')).toContain('out of space');
  });

  it('never shows a raw code', () => {
    expect(copyFailureMessage('weirdInternalCode')).not.toContain('weirdInternalCode');
  });
});

describe('findFinishedCopy', () => {
  const source = { name: '1.History of Architecture.mp4', sizeBytes: 877174153 };

  it('finds a copy that already finished, by its name and size', () => {
    const children = [
      { id: 'a', name: 'notes.pdf', size: 1000, file: {} },
      { id: 'b', name: '1.History of Architecture.mp4', size: 877174153, file: { mimeType: 'video/mp4' } },
    ];
    expect(findFinishedCopy(children, source)?.id).toBe('b');
  });

  it('ignores a same-named file of another size, which is half copied or a different video', () => {
    expect(findFinishedCopy([{ id: 'b', name: '1.History of Architecture.mp4', size: 1024, file: {} }], source)).toBeNull();
  });

  it('matches the name whatever its case, as SharePoint does', () => {
    expect(
      findFinishedCopy([{ id: 'b', name: '1.HISTORY OF ARCHITECTURE.MP4', size: 877174153, file: {} }], source)?.id,
    ).toBe('b');
  });

  it('never matches a folder', () => {
    expect(
      findFinishedCopy([{ id: 'f', name: '1.History of Architecture.mp4', size: 877174153, folder: { childCount: 0 } }], source),
    ).toBeNull();
  });

  it('matches nothing when the size of the original is unknown', () => {
    expect(
      findFinishedCopy([{ id: 'b', name: '1.History of Architecture.mp4', size: 877174153, file: {} }], {
        name: source.name,
        sizeBytes: null,
      }),
    ).toBeNull();
  });
});
