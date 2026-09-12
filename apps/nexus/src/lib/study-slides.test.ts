import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const storage = {
    upload: vi.fn(async () => ({ data: {}, error: null as { message: string } | null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    list: vi.fn(async () => ({ data: [] as { name: string }[], error: null })),
    createSignedUrl: vi.fn(async (path: string, ttl: number, opts?: { download?: string }) => ({
      data: { signedUrl: `https://db.example/sign/${path}?ttl=${ttl}${opts?.download ? `&download=${opts.download}` : ''}` },
      error: null,
    })),
  };
  return {
    storage,
    getSlidesForFile: vi.fn(),
    saveSlides: vi.fn(),
    updateSlides: vi.fn(),
  };
});

vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ storage: { from: () => mocks.storage } }),
  getSlidesForFile: mocks.getSlidesForFile,
  saveSlides: mocks.saveSlides,
  updateSlides: mocks.updateSlides,
}));

import {
  SLIDES_MAX_PDF_BYTES,
  SlidesError,
  attachSlides,
  buildSlidesPayload,
  ensureFreshSlides,
  messageCodeForError,
  needsRecheck,
  planSlidesSync,
  problemForError,
  renditionStatusToCode,
  resolveSlidesItem,
  slidesDownloadName,
  slidesPolicyProblem,
  slidesRefFromBody,
  slidesStoragePath,
  slidesVersionKey,
  toSlidesSourceItem,
} from './study-slides';
import type { NexusStudyFileSlides } from '@neram/database';

/**
 * A chapter's PowerPoint, turned into PDF pages once per SharePoint version.
 *
 * The rules worth pinning: a deck is converted only when its content tag
 * changes, a failed refresh never takes the last good PDF away from students,
 * and a file outside the library or not a deck is refused.
 */

const PDF = new TextEncoder().encode('%PDF-1.7\n%fake slides');
const NOT_PDF = new TextEncoder().encode('<html>error</html>');

const LIBRARY_DECK = {
  id: 'item-1',
  name: 'Ch 1 History of Architecture.pptx',
  size: 5_000_000,
  webUrl: 'https://neram.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/slides/Ch1.pptx',
  file: { mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  parentReference: { driveId: 'drive-1', driveType: 'documentLibrary', path: '/drives/drive-1/root:/nexus/slides' },
  cTag: '"c:{ABC},3"',
  lastModifiedDateTime: '2026-09-11T10:00:00Z',
};

function row(over: Partial<NexusStudyFileSlides> = {}): NexusStudyFileSlides {
  return {
    id: 's1',
    file_id: 'file-1',
    drive_id: 'drive-1',
    item_id: 'item-1',
    source_name: 'Ch1.pptx',
    source_web_url: null,
    source_ctag: '"c:{ABC},2"',
    source_modified_at: null,
    pdf_path: 'file-1/old0000000000000.pdf',
    pdf_size_bytes: 10,
    converted_at: '2026-09-11T09:00:00Z',
    checked_at: '2026-09-11T09:00:00Z',
    problem: null,
    attached_by: null,
    created_at: '2026-09-11T09:00:00Z',
    updated_at: '2026-09-11T09:00:00Z',
    ...over,
  };
}

const calls: string[] = [];

function res(status: number, opts: { json?: unknown; headers?: Record<string, string>; bytes?: Uint8Array } = {}) {
  const bytes = opts.bytes ?? new Uint8Array();
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(opts.headers || {}),
    json: async () => opts.json,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: null,
  };
}

interface GraphScript {
  meta?: unknown;
  metaStatus?: number;
  renditionStatus?: number;
  pdf?: Uint8Array;
  pdfHeaders?: Record<string, string>;
}

function mockGraph(script: GraphScript = {}) {
  const { meta = LIBRARY_DECK, metaStatus = 200, renditionStatus = 302, pdf = PDF, pdfHeaders = {} } = script;
  calls.length = 0;
  global.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/content?format=pdf')) {
      return renditionStatus === 302
        ? res(302, { headers: { location: 'https://files.example/rendition.pdf' } })
        : res(renditionStatus);
    }
    if (url.startsWith('https://files.example/')) return res(200, { bytes: pdf, headers: pdfHeaders });
    if (url.includes('/items/') || url.includes('/shares/')) {
      return metaStatus === 200 ? res(200, { json: meta }) : res(metaStatus, { json: {} });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
}

const conversions = () => calls.filter((u) => u.includes('/content?format=pdf')).length;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateSlides.mockImplementation(async (_fileId: string, patch: Partial<NexusStudyFileSlides>) => ({
    ...row(),
    ...patch,
  }));
  mocks.saveSlides.mockImplementation(async (input: Partial<NexusStudyFileSlides>) => ({
    id: 's1',
    created_at: 'now',
    updated_at: 'now',
    ...input,
  }));
  mocks.getSlidesForFile.mockResolvedValue(null);
  mocks.storage.upload.mockResolvedValue({ data: {}, error: null });
});

describe('needsRecheck', () => {
  const now = Date.parse('2026-09-11T09:30:00Z');

  it('checks a deck that was never checked', () => {
    expect(needsRecheck(null, now)).toBe(true);
  });

  it('trusts a check from a few minutes ago', () => {
    expect(needsRecheck('2026-09-11T09:25:00Z', now)).toBe(false);
  });

  it('checks again after ten minutes', () => {
    expect(needsRecheck('2026-09-11T09:20:00Z', now)).toBe(true);
  });

  it('checks again when the stored time is unreadable', () => {
    expect(needsRecheck('not a date', now)).toBe(true);
  });
});

describe('versions', () => {
  it('keys a version by content tag, then modified time, then size', () => {
    expect(slidesVersionKey({ cTag: 'c1', lastModifiedAt: 't', sizeBytes: 1 })).toBe('c1');
    expect(slidesVersionKey({ cTag: null, lastModifiedAt: 't', sizeBytes: 1 })).toBe('t');
    expect(slidesVersionKey({ cTag: null, lastModifiedAt: null, sizeBytes: 7 })).toBe('size:7');
  });

  it('stores one object per version, under the chapter, with no cTag punctuation in the path', () => {
    const a = slidesStoragePath('file-1', '"c:{ABC},2"');
    expect(a).toMatch(/^file-1\/[0-9a-f]{16}\.pdf$/);
    expect(slidesStoragePath('file-1', '"c:{ABC},2"')).toBe(a);
    expect(slidesStoragePath('file-1', '"c:{ABC},3"')).not.toBe(a);
  });

  it('converts when nothing is stored, or when the content tag moved', () => {
    expect(planSlidesSync({ pdf_path: null, source_ctag: 'c1' }, { cTag: 'c1' })).toBe('convert');
    expect(planSlidesSync({ pdf_path: 'p', source_ctag: 'c1' }, { cTag: 'c2' })).toBe('convert');
  });

  it('serves what is stored when the content is unchanged, or cannot be compared', () => {
    expect(planSlidesSync({ pdf_path: 'p', source_ctag: 'c1' }, { cTag: 'c1' })).toBe('serve');
    expect(planSlidesSync({ pdf_path: 'p', source_ctag: 'c1' }, { cTag: null })).toBe('serve');
  });
});

describe('slidesDownloadName', () => {
  it('names the PDF after the chapter', () => {
    expect(slidesDownloadName('Ch:1 History Of Architecture')).toBe('Ch 1 History Of Architecture slides.pdf');
  });

  it('drops a deck extension and characters a file name cannot hold', () => {
    expect(slidesDownloadName('Islamic "architecture".pptx')).toBe('Islamic architecture slides.pdf');
  });

  it('keeps a chapter number that only looks like an extension', () => {
    expect(slidesDownloadName('Chapter 2.5')).toBe('Chapter 2.5 slides.pdf');
  });

  it('falls back when there is no title', () => {
    expect(slidesDownloadName('')).toBe('Chapter slides.pdf');
    expect(slidesDownloadName(null)).toBe('Chapter slides.pdf');
  });
});

describe('slidesPolicyProblem', () => {
  const deck = toSlidesSourceItem(LIBRARY_DECK);

  it('accepts a deck in the library', () => {
    expect(slidesPolicyProblem(deck)).toBeNull();
  });

  it('refuses a file that is not a deck', () => {
    expect(slidesPolicyProblem({ ...deck, name: 'notes.pdf', mimeType: 'application/pdf' })).toBe('NOT_A_PRESENTATION');
    expect(slidesPolicyProblem({ ...deck, isFolder: true })).toBe('NOT_A_PRESENTATION');
  });

  it('refuses a deck in a OneDrive, by drive type or by address', () => {
    expect(slidesPolicyProblem({ ...deck, driveType: 'business' })).toBe('SLIDES_IN_ONEDRIVE');
    expect(
      slidesPolicyProblem({ ...deck, driveType: null, webUrl: 'https://neram-my.sharepoint.com/personal/hari/Documents/Ch1.pptx' }),
    ).toBe('SLIDES_IN_ONEDRIVE');
  });
});

describe('slidesRefFromBody', () => {
  it('reads a picked file by its ids', () => {
    expect(slidesRefFromBody({ drive_id: 'd', item_id: 'i' })).toEqual({ driveId: 'd', itemId: 'i' });
  });

  it('reads a pasted link', () => {
    expect(slidesRefFromBody({ url: '  https://neram.sharepoint.com/:p:/s/x  ' })).toBe('https://neram.sharepoint.com/:p:/s/x');
  });

  it('rejects anything else', () => {
    expect(slidesRefFromBody({})).toBeNull();
    expect(slidesRefFromBody({ drive_id: 'd' })).toBeNull();
    expect(slidesRefFromBody(null)).toBeNull();
    expect(slidesRefFromBody('https://x')).toBeNull();
  });
});

describe('error mapping', () => {
  it('records a missing deck as SOURCE_MISSING and anything transient as GRAPH_UNAVAILABLE', () => {
    expect(problemForError('NOT_FOUND')).toBe('SOURCE_MISSING');
    expect(problemForError('TOO_LARGE')).toBe('TOO_LARGE');
    expect(problemForError('STORAGE_FAILED')).toBe('GRAPH_UNAVAILABLE');
  });

  it('tells a teacher a storage failure is a save failure, not SharePoint', () => {
    expect(messageCodeForError('STORAGE_FAILED')).toBe('SAVE_FAILED');
    expect(messageCodeForError('NOT_FOUND')).toBe('NOT_FOUND');
  });

  it('reads a refused conversion by status', () => {
    expect(renditionStatusToCode(406)).toBe('RENDITION_UNAVAILABLE');
    expect(renditionStatusToCode(404)).toBe('NOT_FOUND');
    expect(renditionStatusToCode(503)).toBe('GRAPH_UNAVAILABLE');
  });
});

describe('resolveSlidesItem', () => {
  it('looks a picked file up by drive and item, asking for its content tag', async () => {
    mockGraph();
    const item = await resolveSlidesItem({ driveId: 'drive-1', itemId: 'item-1' });
    expect(calls[0]).toContain('/drives/drive-1/items/item-1?');
    expect(calls[0]).toContain('cTag');
    expect(item.cTag).toBe('"c:{ABC},3"');
    expect(item.driveId).toBe('drive-1');
  });

  it('resolves a pasted SharePoint link through /shares', async () => {
    mockGraph();
    await resolveSlidesItem('https://neram.sharepoint.com/:p:/s/NeramStorage/EabcDEF');
    expect(calls[0]).toContain('/shares/u!');
  });

  it('refuses a link that is not SharePoint without asking Graph', async () => {
    mockGraph();
    await expect(resolveSlidesItem('https://www.youtube.com/watch?v=abcdefghijk')).rejects.toMatchObject({
      code: 'LINK_NOT_RECOGNISED',
    });
    expect(calls).toHaveLength(0);
  });

  it('reports a deleted file as NOT_FOUND', async () => {
    mockGraph({ metaStatus: 404 });
    await expect(resolveSlidesItem({ driveId: 'drive-1', itemId: 'item-1' })).rejects.toBeInstanceOf(SlidesError);
    await expect(resolveSlidesItem({ driveId: 'drive-1', itemId: 'item-1' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('attachSlides', () => {
  it('converts, stores under the version path, saves the row and removes a replaced deck', async () => {
    mockGraph();
    mocks.getSlidesForFile.mockResolvedValue(row());
    const item = toSlidesSourceItem(LIBRARY_DECK);

    const saved = await attachSlides('file-1', item, 'teacher-1');

    const expectedPath = slidesStoragePath('file-1', '"c:{ABC},3"');
    expect(mocks.storage.upload).toHaveBeenCalledWith(expectedPath, expect.any(Uint8Array), {
      contentType: 'application/pdf',
      upsert: true,
    });
    expect(saved.pdf_path).toBe(expectedPath);
    expect(saved.source_ctag).toBe('"c:{ABC},3"');
    expect(saved.attached_by).toBe('teacher-1');
    expect(saved.problem).toBeNull();
    expect(mocks.storage.remove).toHaveBeenCalledWith(['file-1/old0000000000000.pdf']);
  });

  it('saves nothing when the deck will not convert', async () => {
    mockGraph({ renditionStatus: 406 });
    await expect(attachSlides('file-1', toSlidesSourceItem(LIBRARY_DECK), 't')).rejects.toMatchObject({
      code: 'RENDITION_UNAVAILABLE',
    });
    expect(mocks.saveSlides).not.toHaveBeenCalled();
    expect(mocks.storage.upload).not.toHaveBeenCalled();
  });
});

describe('ensureFreshSlides', () => {
  const soon = Date.parse('2026-09-11T09:05:00Z');
  const later = Date.parse('2026-09-11T10:30:00Z');

  it('serves a recently checked deck without asking SharePoint', async () => {
    mockGraph();
    const r = row();
    expect(await ensureFreshSlides(r, { now: soon })).toBe(r);
    expect(calls).toHaveLength(0);
  });

  it('keeps the stored PDF when SharePoint says the content has not changed', async () => {
    mockGraph({ meta: { ...LIBRARY_DECK, cTag: '"c:{ABC},2"' } });
    const out = await ensureFreshSlides(row(), { now: later });
    expect(conversions()).toBe(0);
    expect(mocks.storage.upload).not.toHaveBeenCalled();
    const patch = mocks.updateSlides.mock.calls[0][1];
    expect(patch.checked_at).toBe(new Date(later).toISOString());
    expect(patch.problem).toBeNull();
    expect(out.pdf_path).toBe('file-1/old0000000000000.pdf');
  });

  it('converts an edited deck, points the row at the new PDF and removes the old one', async () => {
    mockGraph();
    const out = await ensureFreshSlides(row(), { now: later });
    expect(conversions()).toBe(1);
    const newPath = slidesStoragePath('file-1', '"c:{ABC},3"');
    expect(out.pdf_path).toBe(newPath);
    expect(out.source_ctag).toBe('"c:{ABC},3"');
    expect(mocks.storage.remove).toHaveBeenCalledWith(['file-1/old0000000000000.pdf']);
  });

  it('records a deleted deck and keeps serving the last PDF', async () => {
    mockGraph({ metaStatus: 404 });
    const out = await ensureFreshSlides(row(), { now: later });
    const patch = mocks.updateSlides.mock.calls[0][1];
    expect(patch).toEqual({ checked_at: new Date(later).toISOString(), problem: 'SOURCE_MISSING' });
    expect(out.pdf_path).toBe('file-1/old0000000000000.pdf');
    expect(mocks.storage.remove).not.toHaveBeenCalled();
  });

  it('records a version that will not convert and keeps the last PDF', async () => {
    mockGraph({ renditionStatus: 406 });
    const out = await ensureFreshSlides(row(), { now: later });
    expect(out.problem).toBe('RENDITION_UNAVAILABLE');
    expect(out.pdf_path).toBe('file-1/old0000000000000.pdf');
  });

  it('refuses a PDF over the limit before reading it', async () => {
    mockGraph({ pdfHeaders: { 'content-length': String(SLIDES_MAX_PDF_BYTES + 1) } });
    const out = await ensureFreshSlides(row(), { now: later });
    expect(out.problem).toBe('TOO_LARGE');
    expect(mocks.storage.upload).not.toHaveBeenCalled();
  });

  it('refuses a response that is not a PDF', async () => {
    mockGraph({ pdf: NOT_PDF });
    const out = await ensureFreshSlides(row(), { now: later });
    expect(out.problem).toBe('RENDITION_UNAVAILABLE');
  });

  it('converts on Refresh now even when the content tag matches', async () => {
    mockGraph({ meta: { ...LIBRARY_DECK, cTag: '"c:{ABC},2"' } });
    await ensureFreshSlides(row(), { now: soon, force: true });
    expect(conversions()).toBe(1);
  });

  it('keeps the old PDF when the row cannot record the new one', async () => {
    mockGraph();
    mocks.updateSlides.mockRejectedValue(new Error('db down'));
    const out = await ensureFreshSlides(row(), { now: later });
    expect(out.pdf_path).toBe(slidesStoragePath('file-1', '"c:{ABC},3"'));
    expect(mocks.storage.remove).not.toHaveBeenCalled();
  });
});

describe('buildSlidesPayload', () => {
  it('gives a student a signed link and nothing about the source', async () => {
    const payload = await buildSlidesPayload(row(), { staff: false });
    expect(payload.status).toBe('ready');
    expect(payload.url).toContain('file-1/old0000000000000.pdf');
    expect(payload.expires_in).toBe(3600);
    expect(payload.source).toBeUndefined();
  });

  it('signs a download under the chapter name', async () => {
    await buildSlidesPayload(row(), { staff: false, downloadName: 'Ch 1 slides.pdf' });
    expect(mocks.storage.createSignedUrl).toHaveBeenCalledWith('file-1/old0000000000000.pdf', 3600, {
      download: 'Ch 1 slides.pdf',
    });
  });

  it('tells staff about the source and its problem', async () => {
    const payload = await buildSlidesPayload(row({ problem: 'SOURCE_MISSING' }), { staff: true });
    expect(payload.source?.problem).toBe('SOURCE_MISSING');
    expect(payload.source?.name).toBe('Ch1.pptx');
  });

  it('reports unavailable when there is no PDF to serve', async () => {
    const payload = await buildSlidesPayload(row({ pdf_path: null, problem: 'TOO_LARGE' }), { staff: false });
    expect(payload).toEqual({ status: 'unavailable', code: 'TOO_LARGE' });
    expect(mocks.storage.createSignedUrl).not.toHaveBeenCalled();
  });
});
