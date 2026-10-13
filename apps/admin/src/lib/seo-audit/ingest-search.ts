/**
 * Search performance from Search Console into gsc_search_daily.
 *
 * Each day: re-read the last 3 final days (Google revises recent days), then
 * spend any spare time going back in 30-day chunks until SEO_BACKFILL_DAYS
 * (default 90) of history is in. Two reads per range: page totals (query '')
 * and page x query rows, both split by device.
 */
import type { GscClient, SearchAnalyticsRow } from './gsc/client';
import { db, earliestSearchDate, lastFinalDate, latestSearchDate, shiftDate, upsertBatches } from './store';

const CHUNK_DAYS = 30;

export function toRows(rows: SearchAnalyticsRow[], withQuery: boolean) {
  return rows.map((r) => {
    const [date, page, a, b] = r.keys;
    return {
      date,
      page,
      query: withQuery ? a : '',
      device: (withQuery ? b : a) || 'ALL',
      clicks: Math.round(r.clicks),
      impressions: Math.round(r.impressions),
      ctr: r.ctr,
      position: r.position,
    };
  });
}

async function ingestRange(client: any, gsc: GscClient, from: string, to: string): Promise<number> {
  const totals = await gsc.searchAnalytics({ startDate: from, endDate: to, dimensions: ['date', 'page', 'device'] });
  const queries = await gsc.searchAnalytics({ startDate: from, endDate: to, dimensions: ['date', 'page', 'query', 'device'] });
  const rows = [...toRows(totals, false), ...toRows(queries, true)];
  return upsertBatches(client, 'gsc_search_daily', rows, 'date,page,query,device');
}

export async function runSearchIngest(opts: { gsc: GscClient; client?: any; deadline: number; now?: Date; backfillDays?: number }) {
  const client = opts.client ?? db();
  const end = lastFinalDate(opts.now);
  const backfillDays = opts.backfillDays ?? (Number(process.env.SEO_BACKFILL_DAYS) || 90);
  const oldestWanted = shiftDate(end, -(backfillDays - 1));
  const ranges: string[] = [];
  let rows = 0;

  const latest = await latestSearchDate(client);
  const from = latest ? (shiftDate(latest, -2) > oldestWanted ? shiftDate(latest, -2) : oldestWanted) : shiftDate(end, -(CHUNK_DAYS - 1));
  if (from <= end) {
    rows += await ingestRange(client, opts.gsc, from, end);
    ranges.push(`${from}..${end}`);
  }

  // Backfill older history while time allows.
  while (Date.now() < opts.deadline) {
    const earliest = await earliestSearchDate(client);
    if (!earliest || earliest <= oldestWanted) break;
    const chunkEnd = shiftDate(earliest, -1);
    const chunkStart = shiftDate(chunkEnd, -(CHUNK_DAYS - 1)) < oldestWanted ? oldestWanted : shiftDate(chunkEnd, -(CHUNK_DAYS - 1));
    const n = await ingestRange(client, opts.gsc, chunkStart, chunkEnd);
    ranges.push(`${chunkStart}..${chunkEnd}`);
    rows += n;
    // A range with no data at all (a brand-new property) would loop forever.
    if (n === 0) break;
  }

  return { rows, ranges };
}
