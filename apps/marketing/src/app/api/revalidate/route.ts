import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { isRevalidatableTag } from '@/lib/cache-tags';

/**
 * POST /api/revalidate
 *
 * On-demand purge for ISR content that staff edit in the admin app
 * (testimonials, reviews, #AskSeniors). Header `x-revalidate-secret` must equal
 * REVALIDATE_SECRET; body is `{ tags: string[] }`, filtered to the allowlist in
 * lib/cache-tags.ts so a caller can never purge arbitrary cache entries.
 */
export const dynamic = 'force-dynamic';

const MAX_TAGS = 10;

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  // Hash both sides so the comparison is constant time whatever the lengths.
  const a = crypto.createHash('sha256').update(given, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'Revalidation is not configured' }, { status: 503, headers: noStore });
  }
  if (!secretMatches(request.headers.get('x-revalidate-secret'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON: { tags: string[] }' }, { status: 400, headers: noStore });
  }
  const raw = (body as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'Body must be JSON: { tags: string[] }' }, { status: 400, headers: noStore });
  }

  const revalidated: string[] = [];
  const ignored: string[] = [];
  for (const tag of raw.slice(0, MAX_TAGS)) {
    if (isRevalidatableTag(tag)) {
      if (!revalidated.includes(tag)) revalidated.push(tag);
    } else {
      ignored.push(String(tag));
    }
  }
  if (revalidated.length === 0) {
    return NextResponse.json({ error: 'No known tags', ignored }, { status: 400, headers: noStore });
  }

  for (const tag of revalidated) revalidateTag(tag);
  return NextResponse.json({ revalidated, ignored, now: Date.now() }, { headers: noStore });
}
