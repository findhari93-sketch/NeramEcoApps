/**
 * A paper as one JSON document.
 *
 * The read half of the round trip. The write half is
 * POST /api/question-bank/papers/import, which takes what this hands out.
 *
 * `?download=1` sets Content-Disposition so a browser saves the file instead of
 * rendering it. Without it the same body comes back for the upload dialog to
 * diff against, which is the cheaper thing to do when nobody wants a file.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { readPaperForExport } from '@neram/database';
import { describeError } from '@/lib/api-errors';
import { paperJSONFilename, toPaperJSON } from '@/lib/paper-json';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;

    const rows = await readPaperForExport(params.id);
    if (!rows) return NextResponse.json({ error: 'Paper not found' }, { status: 404 });

    const document = toPaperJSON(rows);

    if (request.nextUrl.searchParams.get('download') === '1') {
      // Pretty-printed on purpose. The whole point of the file is that a human
      // opens it, changes a line and sends it back; a single-line 400 KB blob
      // is technically the same document and useless for that.
      return new NextResponse(JSON.stringify(document, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${paperJSONFilename(rows.paper)}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({ data: document }, { status: 200 });
  } catch (err) {
    console.error('[QB Paper JSON] GET:', describeError(err));
    const message = err instanceof Error ? err.message : 'Could not build the paper JSON';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
