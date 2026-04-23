import { getCollegeBySlug } from '@/lib/college-hub/queries';
import type { GetCollegeArgs, ToolResult } from './types';

export async function getCollegeTool(
  args: GetCollegeArgs
): Promise<ToolResult<Record<string, unknown>>> {
  const slug = (args?.slug || '').trim();
  if (!slug) return { ok: false, error: 'invalid_slug' };

  try {
    const college = await getCollegeBySlug(slug);
    if (!college) return { ok: false, error: 'not_found', slug };

    const c = college as any;
    const url = `/colleges/${c.state_slug ?? 'india'}/${c.slug}`;

    return {
      ok: true,
      data: { url, ...(c as Record<string, unknown>) },
    };
  } catch (err) {
    console.error('[aintra/get-college] query error', err);
    return { ok: false, error: 'tool_error', slug };
  }
}
