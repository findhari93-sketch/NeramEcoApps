import { loadGeoDatasets } from '@/lib/seo/location-data';
import { buildLlmsFullTxt } from '@/lib/seo/llms';

/** /llms-full.txt: every indexed state and city page with its answer (lib/seo/llms.ts). */
export const revalidate = 86400;

export async function GET() {
  return new Response(buildLlmsFullTxt(await loadGeoDatasets()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
