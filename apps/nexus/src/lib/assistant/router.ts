/**
 * Where a message goes before any model sees it. A small table of English
 * patterns; Tamil and Hindi forms are a later task. Order matters: cancel
 * first, then guided flows, then direct tools, then the model.
 */
import type { Mode, PageContext } from './types';

export type FlowName = 'cannot-attend' | 'remind-me' | 'upload-sketch';

export type Route =
  | { kind: 'cancel' }
  | { kind: 'flow'; flow: FlowName }
  | { kind: 'tool'; tool: string }
  | { kind: 'llm'; mode: Mode };

const CANCEL = /^\s*(cancel|stop|never ?mind|forget it|no thanks)\s*[.!]?\s*$/i;

const FLOWS: Array<[FlowName, RegExp]> = [
  ['cannot-attend', /\b(can'?t|cannot|can not|won'?t be able to|unable to|not able to)\s+(attend|come|join|make it)\b|\bmiss(ing)?\s+(the\s+|today'?s\s+|tomorrow'?s\s+)?class\b|\bmark me away\b|\bi am away\b|\bi'?ll be away\b/i],
  ['remind-me', /\bremind me\b/i],
  ['upload-sketch', /\b(add|upload|submit|post)\s+(a\s+|my\s+|this\s+)?(sketch|drawing|photo of my sketch)\b/i],
];

const TOOLS: Array<[string, RegExp]> = [
  ['my_assignments', /\b(due|pending|assignments?|homework|work to submit|submit)\b/i],
  ['my_schedule', /\b(schedule|timetable|next class|my classes|class (today|tomorrow|this week)|when is (the|my) class)\b/i],
  ['exam_countdown', /\b(days (left|to go|until)|exam (date|countdown)|how long (till|until) (the )?exam|days to (nata|jee))\b/i],
  ['my_attendance', /\battendance\b/i],
  ['my_catchup', /\bcatch[\s-]?up\b|\bwhat did i miss\b|\bmissed classes\b/i],
  ['my_sketchbook', /\bsketchbook\b|\brhythm\b|\bpractice days\b/i],
  ['my_brief', /^\s*(brief|summary|today|what do i have today|what'?s (on|up) today|my day)\s*\??\s*$/i],
];

const EXAM_WORDS = /\b(chapter|jee|nata|maths?|mathematics|formula|question|weightage|ncert|syllabus|aptitude|past papers?)\b/i;

export function detectMode(text: string, page: PageContext | null | undefined): Mode {
  if (page?.path?.startsWith('/student/question-bank')) return 'exam';
  return EXAM_WORDS.test(text) ? 'exam' : 'general';
}

export function routeIntent(text: string, page: PageContext | null | undefined): Route {
  const t = text.trim();
  if (CANCEL.test(t)) return { kind: 'cancel' };
  for (const [flow, re] of FLOWS) if (re.test(t)) return { kind: 'flow', flow };
  for (const [tool, re] of TOOLS) if (re.test(t)) return { kind: 'tool', tool };
  return { kind: 'llm', mode: detectMode(t, page) };
}
