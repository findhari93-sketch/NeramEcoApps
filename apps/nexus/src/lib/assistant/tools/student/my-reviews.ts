import { formatDay } from '@/lib/assistant/format';
import { loadReviewsBack } from '@/lib/assistant/reviews-back';
import type { ToolDef } from '@/lib/assistant/types';
import { EMPTY_SCHEMA } from './shared';

const DAYS = 14;

export const myReviews: ToolDef = {
  name: 'my_reviews',
  description: 'Drawings and sketches the teacher reviewed for the student in the last two weeks, with the result.',
  parameters: EMPTY_SCHEMA,
  audience: 'student', kind: 'read', feature: 'sketchbook',
  async run(ctx) {
    const since = new Date(ctx.now.getTime() - DAYS * 86_400_000).toISOString();
    const { count, items } = await loadReviewsBack(ctx.supabase, ctx.caller.id, since);
    if (count === 0) return { ok: true, reply: 'No reviews came back in the last two weeks.', data: [], links: [{ label: 'Sketchbook', url: '/student/sketchbook' }] };
    const shown = items.slice(0, 5);
    const lines = shown.map((r, i) => `${i + 1}. ${r.kind}, ${r.words} (${formatDay(r.reviewedOn)}).`);
    return {
      ok: true,
      reply: `${count} ${count === 1 ? 'drawing' : 'drawings'} reviewed in the last two weeks:\n${lines.join('\n')}`,
      data: shown,
      links: shown.slice(0, 3).map((r) => ({ label: `${r.kind} review`, url: `/student/sketchbook/${r.id}` })),
    };
  },
};
