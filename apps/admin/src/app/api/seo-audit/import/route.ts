export const dynamic = 'force-dynamic';

/**
 * POST /api/seo-audit/import { text } - URLs pasted from a Search Console
 * report export (CSV or one per line). They go to the front of the inspection
 * and crawl queues, so a report like "Server error (5xx)" can be checked
 * URL by URL on the next run. Admins only.
 */
import { NextResponse } from 'next/server';
import { readSeoEnv } from '@/lib/seo-audit/config';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { extractUrls, importUrls } from '@/lib/seo-audit/urls';

export async function POST(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text.slice(0, 1_000_000) : '';
    const urls = extractUrls(text, readSeoEnv().env.origins);
    if (!urls.length) return NextResponse.json({ error: 'No neramclasses.com URLs found in the pasted text.' }, { status: 400 });
    const result = await importUrls({ urls });
    return NextResponse.json({ found: urls.length, ...result });
  } catch (err) {
    return seoError(err, 'import');
  }
}
