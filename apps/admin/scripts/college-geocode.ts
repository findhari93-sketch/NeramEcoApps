/**
 * Suggests map pins for active colleges that have none, using OpenStreetMap
 * Nominatim. Writes only the geo_suggested_* columns; staff accept or dismiss
 * each one in Admin > College Hub > Map pins. Never writes latitude/longitude.
 *
 * From apps/admin:
 *   node ../../node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs scripts/college-geocode.ts --env staging --dry-run --limit 5
 *   node ../../node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs scripts/college-geocode.ts --env staging
 *   ... --env prod        (only when asked)
 *
 * Nominatim's usage policy: at most one request a second, a real User-Agent,
 * no bulk jobs. This waits 1.1 s between requests and stops after --limit.
 */
// Aliased: useEnv is not a React hook, but its name trips react-hooks/rules-of-hooks.
import { arg, flag, useEnv as selectEnv } from './college-env';

const USER_AGENT = 'NeramClasses-CollegeHub/1.0 (admin geocoder)';
const GAP_MS = 1100;

interface CollegeRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: { state?: string; state_district?: string; [k: string]: string | undefined };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let lastRequestAt = 0;
async function nominatim(q: string): Promise<NominatimResult | null> {
  const wait = lastRequestAt + GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&addressdetails=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } });
  if (res.status === 429) throw new Error('Nominatim rate limit (429). Stop and try later.');
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json = (await res.json()) as NominatimResult[];
  return json[0] ?? null;
}

async function main() {
  const env = selectEnv();
  const { getSupabaseAdminClient } = await import('@neram/database');
  const { geocodeQueries, isValidLatLng, roundCoord, stateMatches } = await import('../src/lib/college-map-pins/geo');
  const db = getSupabaseAdminClient() as any;

  const dryRun = flag('dry-run');
  const limit = Number(arg('limit')) || Infinity;

  const { data, error } = await db
    .from('colleges')
    .select('id, slug, name, city, state')
    .eq('status', 'active')
    .is('latitude', null)
    .is('geo_suggested_lat', null)
    .order('name')
    .limit(1000);
  if (error) throw error;
  const colleges = (data as CollegeRow[]).slice(0, limit);
  console.log(`${dryRun ? 'DRY RUN: ' : ''}${colleges.length} college(s) without a pin or suggestion on ${env}\n`);

  const tally = { suggested: 0, wrong_state: 0, not_found: 0, failed: 0 };
  for (const [i, c] of colleges.entries()) {
    const n = String(i + 1).padStart(3);
    try {
      let picked: { result: NominatimResult; query: string } | null = null;
      let sawWrongState = false;
      for (const q of geocodeQueries(c)) {
        const result = await nominatim(q);
        if (!result) continue;
        if (!stateMatches(result.address?.state, c.state)) {
          sawWrongState = true;
          continue;
        }
        picked = { result, query: q };
        break;
      }
      if (!picked) {
        if (sawWrongState) tally.wrong_state += 1;
        else tally.not_found += 1;
        console.log(`${n}. ${c.slug.padEnd(48)} ${sawWrongState ? 'skipped (result in another state)' : 'not found'}`);
        continue;
      }
      const lat = roundCoord(Number(picked.result.lat));
      const lng = roundCoord(Number(picked.result.lon));
      if (!isValidLatLng(lat, lng)) {
        tally.not_found += 1;
        console.log(`${n}. ${c.slug.padEnd(48)} bad coordinates`);
        continue;
      }
      if (!dryRun) {
        const { error: upErr } = await db
          .from('colleges')
          .update({
            geo_suggested_lat: lat,
            geo_suggested_lng: lng,
            geo_suggested_source: 'nominatim',
            geo_suggested_label: picked.result.display_name.slice(0, 500),
            geo_suggested_at: new Date().toISOString(),
          })
          .eq('id', c.id)
          .is('latitude', null);
        if (upErr) throw upErr;
      }
      tally.suggested += 1;
      console.log(`${n}. ${c.slug.padEnd(48)} ${lat}, ${lng}  ${picked.result.display_name.slice(0, 80)}`);
    } catch (err) {
      tally.failed += 1;
      console.log(`${n}. ${c.slug.padEnd(48)} FAILED ${(err as Error).message}`);
      if (/429/.test((err as Error).message)) break;
    }
  }

  console.log(
    `\nSummary${dryRun ? ' (dry run, nothing written)' : ''}: ${tally.suggested} suggested, ${tally.wrong_state} skipped for a wrong state, ${tally.not_found} not found, ${tally.failed} failed.`,
  );
  if (!dryRun && tally.suggested) console.log('Review them in Admin > College Hub > Map pins.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
