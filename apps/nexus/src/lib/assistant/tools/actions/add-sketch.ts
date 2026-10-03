import type { ActionToolDef } from '@/lib/assistant/types';
import { CAPTION_MAX, addSketchForStudent } from '@/lib/sketchbook-add';
import { rhythmLine } from '@/lib/sketchbook-rhythm';

export interface AddSketchArgs { original_image_url: string; thumbnail_url?: string | null; caption?: string | null }

export const addSketch: ActionToolDef<AddSketchArgs> = {
  name: 'add_sketch',
  description: "Add an already uploaded photo to the student's sketchbook, with an optional caption.",
  parameters: {
    type: 'object',
    properties: { original_image_url: { type: 'string' }, thumbnail_url: { type: 'string' }, caption: { type: 'string' } },
    required: ['original_image_url'],
  },
  audience: 'student',
  kind: 'action',
  async run(_ctx, args) {
    if (!/^https:\/\//.test(String(args.original_image_url || ''))) return { ok: false, error: 'I need the photo first. Tap the camera button to attach it.' };
    const caption = typeof args.caption === 'string' ? args.caption.trim().slice(0, CAPTION_MAX) : '';
    return {
      ok: true,
      data: {
        kind: 'add_sketch',
        args: { original_image_url: args.original_image_url, thumbnail_url: args.thumbnail_url ?? null, caption },
        summary: 'Add this sketch to your sketchbook.',
        fields: [{ label: 'Caption', value: caption || 'None' }],
      },
    };
  },
  async execute(ctx, args) {
    const result = await addSketchForStudent({ id: ctx.caller.id, user_type: ctx.caller.user_type }, args);
    return { ok: true, reply: `Added to your sketchbook. ${rhythmLine(result.rhythm)}`, links: [{ label: 'Sketchbook', url: '/student/sketchbook' }] };
  },
};
