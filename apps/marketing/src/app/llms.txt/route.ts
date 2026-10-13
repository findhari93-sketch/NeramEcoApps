import { loadGeoDatasets } from '@/lib/seo/location-data';
import { buildLlmsTxt } from '@/lib/seo/llms';
import { getLlmsCollegeRows } from '@/lib/college-hub/queries';

/** /llms.txt for AI assistants, built from the same facts as the pages (lib/seo/llms.ts). */
export const revalidate = 86400;

export async function GET() {
  const [ds, colleges] = await Promise.all([loadGeoDatasets(), getLlmsCollegeRows()]);
  return new Response(buildLlmsTxt(ds, colleges), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
