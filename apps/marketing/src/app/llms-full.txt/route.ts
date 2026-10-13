import { loadGeoDatasets } from '@/lib/seo/location-data';
import { buildLlmsFullTxt } from '@/lib/seo/llms';
import { getLlmsCollegeRows } from '@/lib/college-hub/queries';

/** /llms-full.txt: every indexed state and city page with its answer, plus every B.Arch college (lib/seo/llms.ts). */
export const revalidate = 86400;

export async function GET() {
  const [ds, colleges] = await Promise.all([loadGeoDatasets(), getLlmsCollegeRows()]);
  return new Response(buildLlmsFullTxt(ds, colleges), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
