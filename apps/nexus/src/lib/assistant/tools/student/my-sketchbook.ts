import { loadStudentRhythm } from '@/lib/sketchbook-payload';
import { rhythmLine } from '@/lib/sketchbook-rhythm';
import type { ToolDef } from '@/lib/assistant/types';
import { EMPTY_SCHEMA } from './shared';

export const mySketchbook: ToolDef = {
  name: 'my_sketchbook',
  description: "The student's sketchbook rhythm this week.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  feature: 'sketchbook',
  async run(ctx) {
    const { rhythm } = await loadStudentRhythm(ctx.caller.id, ctx.now);
    return { ok: true, reply: rhythmLine(rhythm), data: rhythm, links: [{ label: 'Sketchbook', url: '/student/sketchbook' }] };
  },
};
