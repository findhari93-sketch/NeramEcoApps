/**
 * The daily Google Business Profile sync. Called by the cron and by the
 * "Sync now" button; both get the same answer shape.
 *
 * For every centre that maps to a Business Profile location:
 *   1. read its Google reviews and upsert them into gbp_reviews (staff fields
 *      like reply_draft are never overwritten: only Google's fields are sent);
 *   2. copy Google's own average and count onto offline_centers, which is what
 *      the marketing pages quote ("4.9 from 120 Google reviews");
 * then match students who opened Google from their review link to the review
 * they posted.
 *
 * A centre is mapped by its saved gbp_location_name, or by the location whose
 * placeId equals the centre's google_place_id (and that mapping is saved).
 */
import type { GbpClient, ApiLocation } from './client';
import { matchReviewsToRequests, toGbpReviewRow, type GbpReviewRow } from './core';

export interface SyncSummary {
  runId: string | null;
  status: 'ok' | 'partial' | 'failed';
  locations: number;
  reviewsUpserted: number;
  matched: number;
  unmappedCentres: string[];
  errors: string[];
}

interface CentreRow {
  id: string;
  name: string;
  google_place_id: string | null;
  gbp_location_name: string | null;
}

/** Which location each centre is, saved name first, then by Place ID. */
export function mapCentresToLocations(centres: CentreRow[], locations: ApiLocation[]): Array<{ centre: CentreRow; location: ApiLocation; isNew: boolean }> {
  const byName = new Map(locations.map((l) => [l.name, l]));
  const byPlace = new Map(locations.filter((l) => l.metadata?.placeId).map((l) => [l.metadata!.placeId!, l]));
  const out: Array<{ centre: CentreRow; location: ApiLocation; isNew: boolean }> = [];
  for (const c of centres) {
    const saved = c.gbp_location_name ? byName.get(c.gbp_location_name) : undefined;
    if (saved) {
      out.push({ centre: c, location: saved, isNew: false });
      continue;
    }
    const byId = c.google_place_id ? byPlace.get(c.google_place_id.trim()) : undefined;
    if (byId) out.push({ centre: c, location: byId, isNew: true });
  }
  return out;
}

export async function runGbpSync(opts: {
  supabase: any;
  client: Pick<GbpClient, 'listLocations' | 'listReviews'>;
  trigger: 'cron' | 'manual';
  now?: Date;
}): Promise<SyncSummary> {
  const { supabase, client, trigger } = opts;
  const now = (opts.now ?? new Date()).toISOString();
  const errors: string[] = [];

  const { data: run } = await supabase.from('gbp_sync_runs').insert({ trigger, status: 'running' }).select('id').single();
  const runId: string | null = run?.id ?? null;

  const finish = async (summary: Omit<SyncSummary, 'runId'>) => {
    if (runId) {
      await supabase
        .from('gbp_sync_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: summary.status,
          locations: summary.locations,
          reviews_upserted: summary.reviewsUpserted,
          matched: summary.matched,
          error: summary.errors.length ? summary.errors.join(' | ').slice(0, 2000) : null,
        })
        .eq('id', runId);
    }
    return { runId, ...summary };
  };

  let locations: ApiLocation[];
  try {
    locations = await client.listLocations();
  } catch (e: any) {
    return finish({ status: 'failed', locations: 0, reviewsUpserted: 0, matched: 0, unmappedCentres: [], errors: [`Could not list locations: ${e?.message || e}`] });
  }

  const { data: centreRows, error: centreError } = await supabase
    .from('offline_centers')
    .select('id, name, google_place_id, gbp_location_name')
    .eq('is_active', true);
  if (centreError) {
    return finish({ status: 'failed', locations: 0, reviewsUpserted: 0, matched: 0, unmappedCentres: [], errors: [centreError.message] });
  }
  const centres = (centreRows || []) as CentreRow[];
  const mapped = mapCentresToLocations(centres, locations);
  const mappedIds = new Set(mapped.map((m) => m.centre.id));
  const unmappedCentres = centres.filter((c) => !mappedIds.has(c.id)).map((c) => c.name);

  const synced: GbpReviewRow[] = [];
  for (const { centre, location, isNew } of mapped) {
    try {
      if (isNew) {
        await supabase.from('offline_centers').update({ gbp_location_name: location.name }).eq('id', centre.id);
      }
      const { reviews, averageRating, totalReviewCount } = await client.listReviews(location.name);
      const rows = reviews.filter((r) => r.name).map((r) => toGbpReviewRow(r, location.name, centre.id, now));
      if (rows.length) {
        const { error } = await supabase.from('gbp_reviews').upsert(rows, { onConflict: 'google_review_name' });
        if (error) throw new Error(error.message);
      }
      synced.push(...rows);
      if (averageRating != null && totalReviewCount != null) {
        await supabase
          .from('offline_centers')
          .update({ rating: Math.round(averageRating * 10) / 10, review_count: totalReviewCount, rating_checked_at: now })
          .eq('id', centre.id);
      }
    } catch (e: any) {
      errors.push(`${centre.name}: ${e?.message || e}`);
    }
  }

  // Confirm students' "I posted it" against what Google now shows.
  let matched = 0;
  try {
    const { data: pending } = await supabase
      .from('review_requests')
      .select('id, student_name, google_clicked_at, google_review_id, testimonial:testimonials!review_requests_testimonial_id_fkey(consent_display_name)')
      .not('google_clicked_at', 'is', null)
      .is('google_review_id', null);
    const requests = ((pending || []) as any[]).map((r) => ({
      id: r.id,
      student_name: r.student_name,
      consent_display_name: r.testimonial?.consent_display_name ?? null,
      google_clicked_at: r.google_clicked_at,
      google_review_id: r.google_review_id,
    }));
    for (const m of matchReviewsToRequests(synced, requests)) {
      await supabase.from('review_requests').update({ google_review_id: m.reviewName, google_review_matched_at: now }).eq('id', m.requestId);
      await supabase.from('gbp_reviews').update({ review_request_id: m.requestId }).eq('google_review_name', m.reviewName);
      matched += 1;
    }
  } catch (e: any) {
    errors.push(`Matching: ${e?.message || e}`);
  }

  const status: SyncSummary['status'] = errors.length === 0 ? 'ok' : mapped.length && synced.length ? 'partial' : 'failed';
  return finish({ status, locations: mapped.length, reviewsUpserted: synced.length, matched, unmappedCentres, errors });
}

/** Record that a run could not start because the API is not connected yet. */
export async function recordNotConnected(supabase: any, trigger: 'cron' | 'manual', missing: string[]) {
  await supabase.from('gbp_sync_runs').insert({
    trigger,
    status: 'not_connected',
    finished_at: new Date().toISOString(),
    error: `Missing: ${missing.join(', ')}`,
  });
}
