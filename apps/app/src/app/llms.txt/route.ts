import { buildLlmsTxt } from '@/lib/seo/llms';
import { allToolSeo } from '@/lib/tools/tool-seo';
import { allGeoPages } from '@/lib/tools/geo-pages';

export const revalidate = 86400;

export async function GET() {
  return new Response(buildLlmsTxt(allToolSeo(), await allGeoPages()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
