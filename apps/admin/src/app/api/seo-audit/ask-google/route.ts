export const dynamic = 'force-dynamic';

/**
 * POST /api/seo-audit/ask-google { url } - remembers that staff pressed
 * "Request indexing" in Search Console for this URL, so it leaves today's
 * "ask Google" list for 14 days. Google's API cannot request indexing for
 * ordinary pages, so the request itself is a click in Search Console.
 * Admins only.
 */
import { NextResponse } from 'next/server';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { db } from '@/lib/seo-audit/store';

export async function POST(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body?.url === 'string' ? body.url : '';
    if (!url) return NextResponse.json({ error: 'Send the url.' }, { status: 400 });
    const { data, error } = await db()
      .from('seo_url_status')
      .update({ index_requested_at: new Date().toISOString(), priority_inspect: true })
      .eq('url', url)
      .select('url, index_requested_at')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: 'URL not tracked.' }, { status: 404 });
    return NextResponse.json(data);
  } catch (err) {
    return seoError(err, 'ask-google');
  }
}
