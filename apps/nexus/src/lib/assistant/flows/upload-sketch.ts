/** "Add a sketch": wait for the photo, offer a caption, propose. Nexus only. */
import { CAPTION_MAX } from '@/lib/sketchbook-add';
import { chip, type FlowDeps, type FlowInput, type FlowOutcome, type FlowState } from './types';

const NO_CAPTION = 'No caption';

function state(deps: FlowDeps, step: string, data: Record<string, unknown>, prev?: FlowState): FlowState {
  return { flow: 'upload-sketch', step, data, startedAt: prev?.startedAt ?? deps.now.toISOString() };
}

function askCaption(data: Record<string, unknown>, deps: FlowDeps, prev?: FlowState): FlowOutcome {
  return { state: state(deps, 'caption', data, prev), reply: 'Got it. Add a caption? A few words about what you drew, or skip it.', suggestions: [chip(NO_CAPTION)] };
}

function proposal(data: Record<string, unknown>, caption: string): FlowOutcome {
  return {
    state: null,
    reply: 'Ready to add it to your sketchbook.',
    suggestions: [],
    propose: {
      kind: 'add_sketch',
      args: { original_image_url: data.original_image_url, thumbnail_url: data.thumbnail_url ?? null, caption },
      summary: 'Add this sketch to your sketchbook.',
      fields: [{ label: 'Caption', value: caption || 'None' }],
    },
  };
}

export function start(input: FlowInput, deps: FlowDeps): FlowOutcome {
  if (input.attachment) return askCaption({ ...input.attachment }, deps);
  return { state: state(deps, 'attach', {}), reply: 'Attach a photo of your sketch and I will add it to your sketchbook.', suggestions: [], wantsAttachment: true };
}

export function step(prev: FlowState, input: FlowInput, deps: FlowDeps): FlowOutcome {
  if (prev.step === 'attach') {
    if (input.attachment) return askCaption({ ...input.attachment }, deps, prev);
    return { state: prev, reply: 'I still need the photo. Tap the camera button to attach it.', suggestions: [], wantsAttachment: true, miss: true };
  }
  if (prev.step === 'caption') {
    const t = input.text.trim();
    const caption = t.toLowerCase() === NO_CAPTION.toLowerCase() || /^(skip|no|none)$/i.test(t) ? '' : t.slice(0, CAPTION_MAX);
    return proposal(prev.data, caption);
  }
  return start(input, deps);
}
