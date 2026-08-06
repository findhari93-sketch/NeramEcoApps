import { NextRequest, NextResponse } from 'next/server';
import { verifyQBAccess } from '@/lib/qb-auth';
import { resolveStaffRole } from '@/lib/staff-capabilities';
import { getTestImportRecord, buildImportPayloadFromTest, saveTestImportPayload } from '@/lib/test-import-store';
import { applyEditedImportPayload, TestEditError } from '@/lib/test-import-edit';

/**
 * The JSON a test is made of.
 *
 *   GET -> the payload, for downloading or for opening the editor.
 *   PUT -> an edited payload, applied back onto the test.
 *
 * Before this existed a test's questions were frozen at creation: the commit
 * route wrote them and the only mutation route in the module whitelisted
 * title, description, is_published, passing_marks and test_kind. A single typo
 * in one stem meant rebuilding the entire paper.
 *
 * GET falls back to reading the test itself when no payload was archived,
 * because every test created before this table existed has none, and handing
 * those teachers a 404 would make the feature look broken on exactly the tests
 * they most want to fix.
 */

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can edit a test' }, { status: 403 });
    }

    /**
     * `?meta=1`: the provenance without the document.
     *
     * A caller drawing "uploaded from history_of_architecture_ch1.json" needs
     * six small fields, and shipping a hundred and fifty questions to render
     * one sentence is the kind of cost that gets a panel removed later for
     * being slow.
     */
    const metaOnly = request.nextUrl.searchParams.get('meta') === '1';

    const record = await getTestImportRecord(params.id);
    if (record) {
      return NextResponse.json({
        data: {
          // Omitted rather than nulled, so a caller cannot mistake "not asked
          // for" for "this test has no questions".
          ...(metaOnly ? {} : { payload: record.payload }),
          source: record.source,
          source_file_id: record.source_file_id,
          prompt_meta: record.prompt_meta,
          created_at: record.created_at,
          updated_at: record.updated_at,
        },
      });
    }

    // Nothing archived and only the provenance was wanted. Say so plainly
    // rather than rebuilding the whole payload to answer a question about
    // where it came from.
    if (metaOnly) {
      return NextResponse.json({ data: null });
    }

    // Nothing archived. Read the test back into the same shape so it is still
    // downloadable and still editable.
    const payload = await buildImportPayloadFromTest(params.id);
    if (!payload) return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    return NextResponse.json({
      data: { payload, source: null, source_file_id: null, prompt_meta: {}, updated_at: null },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the test JSON';
    console.error('Test import GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const access = await verifyQBAccess(request.headers.get('Authorization'), null);
    if (!access.ok) return access.response;
    if (resolveStaffRole(access.caller) === null) {
      return NextResponse.json({ error: 'Only staff can edit a test' }, { status: 403 });
    }

    const body = await request.json();
    const raw = typeof body?.payload === 'string' ? body.payload : JSON.stringify(body?.payload ?? {});

    const result = await applyEditedImportPayload({
      testId: params.id,
      raw,
      callerId: access.caller.id,
    });

    // Rewrite the archive from the test, so the file and the test can never
    // drift: what comes back out of a download is what is actually stored.
    await saveTestImportPayload({
      testId: params.id,
      source: 'edit',
      createdBy: access.caller.id,
      promptMeta: { edited_at: new Date().toISOString(), forked: result.forked },
    }).catch((err) => console.error('Could not re-archive the edited payload:', err));

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof TestEditError) {
      return NextResponse.json({ error: err.message, details: err.details }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'Failed to save the test';
    console.error('Test import PUT error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
