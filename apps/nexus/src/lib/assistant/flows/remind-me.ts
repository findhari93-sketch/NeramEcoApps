/** "Remind me on Friday to finish the catch-up." Pure. */
import { parseSingleDate } from '@/lib/assistant/dates';
import { relativeDay } from '@/lib/assistant/format';
import { chip, type FlowDeps, type FlowInput, type FlowOutcome, type FlowState } from './types';

function state(deps: FlowDeps, step: string, data: Record<string, unknown>, prev?: FlowState): FlowState {
  return { flow: 'remind-me', step, data, startedAt: prev?.startedAt ?? deps.now.toISOString() };
}

/**
 * Each chip sends its own words, so the chat shows what was tapped. parseSingleDate
 * reads "Next Monday" as the coming Monday (a week away on a Monday), the same
 * day the chip means.
 */
function whenChips() {
  return [chip('Tomorrow'), chip('Day after tomorrow'), chip('Next Monday')];
}

/** Split "remind me ..." into a day and a task, either order. */
function parse(text: string, today: string): { due_on: string | null; task: string | null; pastDay: boolean } {
  let rest = text.replace(/^\s*remind me\b/i, '').trim().replace(/^(please|that|about)\s+/i, '');
  let task: string | null = null;
  let due: string | null = null;
  let pastDay = false;

  const tryDay = (s: string) => {
    const d = parseSingleDate(s.replace(/^(on|at|by|this|next)\s+/i, (m) => (/^next$/i.test(m.trim()) ? 'next ' : '')), today);
    return d;
  };

  const toIdx = rest.search(/\bto\b/i);
  if (toIdx >= 0) {
    const before = rest.slice(0, toIdx).trim();
    const after = rest.slice(toIdx + 2).trim();
    // "tomorrow to finish X" or "to finish X on friday"
    const dBefore = before ? tryDay(before) : null;
    if (dBefore) { due = dBefore; task = after; }
    else {
      const words = after.split(/\s+/);
      for (let n = Math.min(4, words.length); n >= 1 && !due; n--) {
        const tail = words.slice(-n).join(' ');
        const d = tryDay(tail);
        if (d) { due = d; task = words.slice(0, -n).join(' ').replace(/\s+(on|at|by)$/i, ''); }
      }
      if (!due) task = after;
      if (!before && !due) task = after;
    }
  } else if (rest) {
    const d = tryDay(rest);
    if (d) due = d; else task = rest;
  }
  if (due && due < today) { pastDay = true; due = null; }
  task = task ? task.trim().replace(/[.!]+$/, '').slice(0, 200) : null;
  return { due_on: due, task: task || null, pastDay };
}

function proposal(due_on: string, task: string, today: string): FlowOutcome {
  const when = relativeDay(due_on, today);
  return {
    state: null,
    reply: 'Here is the reminder. Confirm and I will keep it.',
    suggestions: [],
    propose: { kind: 'set_reminder', args: { due_on, text: task }, summary: `Remind you ${when}: ${task}.`, fields: [{ label: 'When', value: when }, { label: 'About', value: task }] },
  };
}

export function start(input: FlowInput, deps: FlowDeps): FlowOutcome {
  const { due_on, task, pastDay } = parse(input.text, deps.today);
  if (due_on && task) return proposal(due_on, task, deps.today);
  if (!due_on) {
    const reply = pastDay ? 'That day has already passed. Which day should I remind you?' : 'Which day should I remind you?';
    return { state: state(deps, 'when', { text: task }, undefined), reply, suggestions: whenChips() };
  }
  return { state: state(deps, 'what', { due_on }), reply: 'What should I remind you about?', suggestions: [] };
}

export function step(prev: FlowState, input: FlowInput, deps: FlowDeps): FlowOutcome {
  const text = input.text.trim();
  if (prev.step === 'when') {
    const day = parseSingleDate(text, deps.today);
    if (!day) return { state: prev, reply: 'I did not catch the day. Try "tomorrow", "Friday" or "8 Oct".', suggestions: whenChips(), miss: true };
    if (day < deps.today) return { state: prev, reply: 'That day has already passed. Which day should I remind you?', suggestions: whenChips() };
    if (prev.data.text) return proposal(day, String(prev.data.text), deps.today);
    return { state: state(deps, 'what', { due_on: day }, prev), reply: 'What should I remind you about?', suggestions: [] };
  }
  if (prev.step === 'what') {
    if (text.length < 2) return { state: prev, reply: 'A few words is enough, for example "finish the catch-up".', suggestions: [] };
    return proposal(String(prev.data.due_on), text.slice(0, 200), deps.today);
  }
  return start(input, deps);
}
