import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getCachedLibraryHome } from '@/lib/library-cache';

/**
 * GET /api/library/home
 *
 * Everything the Library home needs in one request: the category rows and the
 * popular-topic chips.
 *
 * Previously each CategoryRow fetched itself, so first paint fired six parallel
 * requests to /api/library/videos plus one for collections. That is six Vercel
 * function invocations per page view, on the app's most visited student screen,
 * for data that is identical for every student.
 *
 * The data is the same for every student, so after the auth check it comes from
 * a shared five minute cache (tag 'library', see lib/library-cache.ts) instead
 * of seven Supabase queries per view. Library write routes invalidate the tag.
 */

export async function GET(request: NextRequest) {
  try {
    await verifyMsToken(request.headers.get('Authorization'));

    return NextResponse.json(await getCachedLibraryHome());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the library';
    console.error('Library home error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
