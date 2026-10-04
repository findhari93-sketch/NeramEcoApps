import { searchInspiration } from '@neram/database/queries/nexus';
import { EMPTY_QUERY, toFilters } from '@/lib/inspiration-query';
import { presentRow } from '@/lib/inspiration-present';
import type { ToolDef } from '@/lib/assistant/types';

export const getInspirations: ToolDef = {
  name: 'get_inspirations',
  description: 'Drawings from the Neram inspiration gallery (reference work and featured student drawings), optionally matching a topic such as "perspective" or "market scene".',
  parameters: { type: 'object', properties: { query: { type: 'string' } } },
  audience: 'student', kind: 'read', feature: 'inspiration',
  async run(ctx, args) {
    const q = typeof args.query === 'string' ? args.query.trim().slice(0, 100) : '';
    const filters = toFilters({ ...EMPTY_QUERY, q, sort: q ? 'relevant' : 'newest' }, { offset: 0, limit: 5, scope: 'visible', savedOnly: false });
    const result = await searchInspiration(filters, ctx.caller.id, ctx.supabase);
    // presentRow is the student shape: credit line, no score, no author id.
    const cards = result.rows.map((row) => presentRow(row, { staff: false }));
    const gallery = { label: 'Inspiration', url: q ? `/student/inspiration?q=${encodeURIComponent(q)}` : '/student/inspiration' };
    if (cards.length === 0) return { ok: true, reply: q ? `Nothing in the gallery matches "${q}" yet.` : 'The gallery is empty right now.', data: [], links: [gallery] };
    return {
      ok: true,
      data: cards.map((c) => ({ title: c.title, brief: c.brief, credit: c.credit })),
      links: [...cards.slice(0, 2).map((c) => ({ label: c.title || 'Inspiration', url: `/student/inspiration/${c.id}` })), gallery],
    };
  },
};
