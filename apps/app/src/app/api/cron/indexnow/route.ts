import { NextResponse } from 'next/server';
import { parseSitemap, selectRecent, type SitemapEntry } from '@/lib/seo/sitemaps';

const INDEXNOW_KEY = '9a2eee830f3b46a198a5633703432138';
const HOST = 'app.neramclasses.com';
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Cron endpoint to submit the app's sitemap URLs to IndexNow (ported from
 * apps/marketing; the key file is public/<key>.txt on this host).
 * Triggered by Vercel Cron or manually via GET request.
 * Protected by CRON_SECRET to prevent abuse.
 */
export async function GET(request: Request) {
  // Verify cron secret (Vercel Cron sets this header)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  // Production must have CRON_SECRET set; without it the route refuses to run.
  if ((process.env.NODE_ENV === 'production' && !cronSecret) || (cronSecret && authHeader !== `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch sitemap
    const sitemapRes = await fetch(SITEMAP_URL, {
      headers: { 'User-Agent': 'aiArchitek-IndexNow/1.0' },
      cache: 'no-store',
    });
    if (!sitemapRes.ok) {
      return NextResponse.json(
        { error: `Sitemap fetch failed: ${sitemapRes.status}` },
        { status: 500 }
      );
    }

    // /sitemap.xml is an index: follow it into each child sitemap.
    const root = parseSitemap(await sitemapRes.text());
    let entries: SitemapEntry[] = root.entries;
    if (root.kind === 'index') {
      entries = [];
      for (const child of root.entries) {
        const res = await fetch(child.loc, { headers: { 'User-Agent': 'aiArchitek-IndexNow/1.0' }, cache: 'no-store' });
        if (res.ok) entries.push(...parseSitemap(await res.text()).entries);
      }
    }

    // Daily runs submit only what changed in the last two days; ?full=1 resubmits everything.
    const full = new URL(request.url).searchParams.get('full') === '1';
    const urls = full ? entries.map((e) => e.loc) : selectRecent(entries, 2);

    // Outside production, never call IndexNow unless asked: a local test once
    // submitted the live sitemap. ?submit=1 opts in.
    if (process.env.NODE_ENV !== 'production' && new URL(request.url).searchParams.get('submit') !== '1') {
      return NextResponse.json({ dryRun: true, total: urls.length, sample: urls.slice(0, 10) });
    }

    if (urls.length === 0) {
      if (!full && entries.length > 0) {
        return NextResponse.json({ success: true, total: 0, submitted: 0, note: 'No URLs changed in the last 2 days' });
      }
      return NextResponse.json({ error: 'No URLs found in sitemap' }, { status: 500 });
    }

    // Submit in batches of 100 (IndexNow limit per request)
    const batchSize = 100;
    let submitted = 0;
    const errors: string[] = [];

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const payload = {
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
        urlList: batch,
      };

      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });

      if (res.ok || res.status === 202) {
        submitted += batch.length;
      } else {
        const body = await res.text().catch(() => '');
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: HTTP ${res.status} - ${body.slice(0, 100)}`);
      }
    }

    return NextResponse.json({
      success: true,
      total: urls.length,
      submitted,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `IndexNow submission failed: ${error instanceof Error ? error.message : 'Unknown'}` },
      { status: 500 }
    );
  }
}
