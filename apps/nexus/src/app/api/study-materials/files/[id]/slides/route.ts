import { NextRequest, NextResponse } from 'next/server';
import { getFileById, getSlidesForFile, deleteSlidesForFile } from '@neram/database';
import { assertStaff, authorizeStudyFileRequest, getRequestUser } from '@/lib/study-materials';
import { ApiError, httpStatusForError } from '@/lib/api-errors';
import { slidesMessage } from '@/lib/slides-messages';
import {
  SlidesError,
  attachSlides,
  buildSlidesPayload,
  ensureFreshSlides,
  messageCodeForError,
  removeAllSlidesPdfs,
  resolveSlidesItem,
  slidesDownloadName,
  slidesPolicyProblem,
  slidesRefFromBody,
} from '@/lib/study-slides';

/**
 * A chapter's PowerPoint slides, read as PDF pages beside the chapter PDF.
 *
 *   GET    student or staff. The slides as they should be read now, with a
 *          signed link to the PDF. `?download=1` signs it as a download, only
 *          when the chapter may be downloaded. `{ slides: null }` when the
 *          chapter has none.
 *   PUT    staff. Attach or replace the deck. Body `{ drive_id, item_id }` for a
 *          file picked in Nexus, or `{ url }` for a pasted SharePoint link.
 *   PATCH  staff. Refresh now: convert the deck again from SharePoint.
 *   DELETE staff. Remove the slides from the chapter. The deck in SharePoint is
 *          never touched.
 *
 * The deck has to live in the Neram SharePoint library, as recordings do. See
 * lib/study-slides.ts for how versions are kept current.
 */

export const runtime = 'nodejs';
// A large deck takes a while to convert on attach, on Refresh now, or on the
// first open after an edit. Every other request answers in well under a second.
export const maxDuration = 120;

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/** Plain answers for known refusals; never an internal message for anything else. */
function failure(err: unknown, fallback: string) {
  if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof SlidesError) {
    const code = messageCodeForError(err.code);
    const transient = err.code === 'GRAPH_UNAVAILABLE' || err.code === 'STORAGE_FAILED';
    return NextResponse.json({ error: slidesMessage(code), code }, { status: transient ? 503 : 422 });
  }
  const status = httpStatusForError(err);
  if (status === 500) console.error('[study-materials/slides]', err);
  return NextResponse.json({ error: status === 500 ? fallback : 'Not authorized' }, { status });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await authorizeStudyFileRequest(request.headers.get('Authorization'), params.id);
    if (access.file.is_deleted) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const existing = await getSlidesForFile(params.id);
    if (!existing) return NextResponse.json({ slides: null }, { headers: NO_STORE });

    const wantDownload = request.nextUrl.searchParams.get('download') === '1';
    if (wantDownload && !access.downloadable) {
      return NextResponse.json({ error: 'These slides are view only.' }, { status: 403 });
    }

    const row = await ensureFreshSlides(existing);
    const slides = await buildSlidesPayload(row, {
      staff: access.staff,
      downloadName: wantDownload ? slidesDownloadName(access.file.title) : undefined,
    });
    return NextResponse.json({ slides }, { headers: NO_STORE });
  } catch (err) {
    return failure(err, 'The slides could not be opened right now.');
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const file = await getFileById(params.id);
    if (!file || file.is_deleted) return NextResponse.json({ error: 'File not found' }, { status: 404 });

    const ref = slidesRefFromBody(await request.json().catch(() => null));
    if (!ref) {
      return NextResponse.json(
        { error: slidesMessage('LINK_NOT_RECOGNISED'), code: 'LINK_NOT_RECOGNISED' },
        { status: 400 },
      );
    }

    const item = await resolveSlidesItem(ref);
    const policy = slidesPolicyProblem(item);
    if (policy) {
      return NextResponse.json(
        { error: slidesMessage(policy, item), code: policy, item: { name: item.name } },
        { status: 422 },
      );
    }

    const row = await attachSlides(file.id, item, user.id);
    const slides = await buildSlidesPayload(row, { staff: true });
    return NextResponse.json({ slides }, { headers: NO_STORE });
  } catch (err) {
    return failure(err, 'The slides could not be attached right now.');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    const existing = await getSlidesForFile(params.id);
    if (!existing) return NextResponse.json({ error: 'This chapter has no slides.' }, { status: 404 });

    const row = await ensureFreshSlides(existing, { force: true });
    const slides = await buildSlidesPayload(row, { staff: true });
    return NextResponse.json({ slides }, { headers: NO_STORE });
  } catch (err) {
    return failure(err, 'The slides could not be refreshed right now.');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getRequestUser(request.headers.get('Authorization'));
    assertStaff(user);

    await deleteSlidesForFile(params.id);
    await removeAllSlidesPdfs(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return failure(err, 'The slides could not be removed right now.');
  }
}
