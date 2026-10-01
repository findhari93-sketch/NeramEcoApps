import { loadGeoDatasets } from '@/lib/seo/location-data';
import { buildLlmsTxt } from '@/lib/seo/llms';

/** /llms.txt for AI assistants, built from the same facts as the pages (lib/seo/llms.ts). */
export const revalidate = 86400;

export async function GET() {
  return new Response(buildLlmsTxt(await loadGeoDatasets()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
