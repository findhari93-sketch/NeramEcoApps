/**
 * "I can't attend." Which class (or several days), why, then a proposal the
 * person confirms. Pure: the turn loads the deps and stores the state.
 */
import { parseDateRange, parseSingleDate } from '@/lib/assistant/dates';
import { daysBetweenYmd, formatTime12, relativeDay } from '@/lib/assistant/format';
import { MAX_WINDOW_DAYS } from '@/lib/away-windows-write';
import { RSVP_REASONS } from '@/lib/rsvp-reasons';
import type { UpcomingClass } from '@/lib/upcoming-classes';
import { chip, type FlowDeps, type FlowInput, type FlowOutcome, type FlowState } from './types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SEVERAL = 'Several days';
const REASON_CHIPS = RSVP_REASONS.map((r) => chip(r.label));

function classLabel(c: UpcomingClass, today: string): string {
  return `${cap(relativeDay(c.scheduled_date, today))} ${formatTime12(c.start_time)}: ${c.title}`;
}

function state(deps: FlowDeps, step: string, data: Record<string, unknown>, prev?: FlowState): FlowState {
  return { flow: 'cannot-attend', step, data, startedAt: prev?.startedAt ?? deps.now.toISOString() };
}

/** Match a typed answer to one upcoming class: chip text, title, or a day word. */
function matchClass(text: string, deps: FlowDeps): UpcomingClass | 'several' | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/\b(several|few|many|some)\s+days\b|\bweek\b|\btill\b|\buntil\b|\baway\b/.test(t) || t === SEVERAL.toLowerCase()) return 'several';
  const byLabel = deps.upcoming.find((c) => classLabel(c, deps.today).toLowerCase() === t);
  if (byLabel) return byLabel;
  const byTitle = deps.upcoming.filter((c) => c.title && t.includes(c.title.toLowerCase()));
  if (byTitle.length === 1) return byTitle[0];
  const dayWord = /\b(today|tomorrow|day after( tomorrow)?|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?|\d{1,2}(st|nd|rd|th)?\s+[a-z]{3,9})\b/.exec(t);
  if (dayWord) {
    const day = parseSingleDate(dayWord[0].replace(/'s$/, ''), deps.today);
    const onDay = day ? deps.upcoming.filter((c) => c.scheduled_date === day) : [];
    if (onDay.length === 1) return onDay[0];
  }
  return null;
}

function askClass(deps: FlowDeps, prev?: FlowState, prefix = ''): FlowOutcome {
  if (deps.upcoming.length === 0) {
    return {
      state: state(deps, 'pick-range', {}, prev),
      reply: 'There is no class in the next two weeks to decline. If you will be away for a while, tell me the dates, for example "from Monday for 5 days" or "8 Oct to 12 Oct".',
      suggestions: [chip('Next week'), chip('For 3 days')],
    };
  }
  return {
    state: state(deps, 'pick-class', {}, prev),
    reply: `${prefix}Which class can you not attend?`,
    suggestions: [...deps.upcoming.slice(0, 4).map((c) => chip(classLabel(c, deps.today))), chip(SEVERAL)],
  };
}

function askReason(data: Record<string, unknown>, deps: FlowDeps, prev?: FlowState): FlowOutcome {
  let lead: string;
  if (data.classId) {
    const c = deps.upcoming.find((x) => x.id === data.classId);
    lead = c ? `${c.title}, ${relativeDay(c.scheduled_date, deps.today)} at ${formatTime12(c.start_time)}. ` : '';
  } else {
    const r = data.range as { from: string; to: string };
    lead = `Away from ${relativeDay(r.from, deps.today)} to ${relativeDay(r.to, deps.today)}. `;
  }
  return { state: state(deps, 'pick-reason', data, prev), reply: `${lead}Why can you not make it?`, suggestions: REASON_CHIPS };
}

function propose(data: Record<string, unknown>, deps: FlowDeps, reasonCode: string, note: string | null, prev?: FlowState): FlowOutcome {
  const reason = RSVP_REASONS.find((r) => r.code === reasonCode)!;
  if (data.classId) {
    const c = deps.upcoming.find((x) => x.id === data.classId);
    if (!c) return askClass(deps, prev, 'That class is no longer on your timetable. ');
    const when = `${cap(relativeDay(c.scheduled_date, deps.today))}, ${formatTime12(c.start_time)}`;
    return {
      state: null,
      reply: 'Here is what I will tell your teacher. Confirm and it is done.',
      suggestions: [],
      propose: {
        kind: 'decline_class',
        args: { class_id: c.id, reason_code: reasonCode, note },
        summary: `Tell your teacher you cannot attend ${c.title} on ${cap(relativeDay(c.scheduled_date, deps.today))} at ${formatTime12(c.start_time)}.`,
        fields: [{ label: 'Class', value: c.title }, { label: 'When', value: when }, { label: 'Reason', value: note && reasonCode === 'other' ? note : reason.label }],
      },
    };
  }
  const r = data.range as { from: string; to: string };
  const fields = [
    { label: 'From', value: cap(relativeDay(r.from, deps.today)) },
    { label: 'To', value: cap(relativeDay(r.to, deps.today)) },
    { label: 'Reason', value: reason.label },
  ];
  if (note) fields.push({ label: 'Note', value: note });
  return {
    state: null,
    reply: 'Here is what I will record. Confirm and your teachers are told.',
    suggestions: [],
    propose: {
      kind: 'declare_away_window',
      args: { starts_on: r.from, ends_on: r.to, reason_code: reasonCode, note },
      summary: `Mark you away from ${cap(relativeDay(r.from, deps.today))} to ${cap(relativeDay(r.to, deps.today))}. Reason: ${reason.label}.`,
      fields,
    },
  };
}

export function start(input: FlowInput, deps: FlowDeps): FlowOutcome {
  const match = matchClass(input.text, deps);
  if (match && match !== 'several') return askReason({ classId: match.id }, deps);
  if (match === 'several') {
    const range = parseDateRange(input.text.replace(/^.*?\b(away|attend|come|join|miss)\b/i, '').trim(), deps.today);
    if (range) return rangeAccepted(range, deps);
    return { state: state(deps, 'pick-range', {}), reply: 'Which dates will you be away? For example "8 Oct to 12 Oct" or "from tomorrow for 3 days".', suggestions: [chip('Next week'), chip('For 3 days')] };
  }
  return askClass(deps);
}

function rangeAccepted(range: { from: string; to: string }, deps: FlowDeps, prev?: FlowState): FlowOutcome {
  if (range.from < deps.today) {
    return { state: state(deps, 'pick-range', {}, prev), reply: 'Those dates have already passed. Away dates can only start from today. Which dates?', suggestions: [chip('Next week'), chip('For 3 days')] };
  }
  if (daysBetweenYmd(range.from, range.to) > MAX_WINDOW_DAYS) {
    return { state: state(deps, 'pick-range', {}, prev), reply: `That is more than ${MAX_WINDOW_DAYS} days. Give me a shorter range, and tell me again when you know more.`, suggestions: [] };
  }
  return askReason({ range }, deps, prev);
}

export function step(prev: FlowState, input: FlowInput, deps: FlowDeps): FlowOutcome {
  const text = input.text.trim();
  switch (prev.step) {
    case 'pick-class': {
      const match = matchClass(text, deps);
      if (match === 'several') {
        return { state: state(deps, 'pick-range', {}, prev), reply: 'Which dates will you be away? For example "8 Oct to 12 Oct" or "from tomorrow for 3 days".', suggestions: [chip('Next week'), chip('For 3 days')] };
      }
      if (match) return askReason({ classId: match.id }, deps, prev);
      return { ...askClass(deps, prev, 'I did not catch that. Tap one of the classes, or say "several days". '), miss: true };
    }
    case 'pick-range': {
      const range = parseDateRange(text, deps.today);
      if (!range) return { state: state(deps, 'pick-range', {}, prev), reply: 'I did not catch the dates. Try "8 Oct to 12 Oct" or "from tomorrow for 3 days".', suggestions: [chip('Next week'), chip('For 3 days')], miss: true };
      return rangeAccepted(range, deps, prev);
    }
    case 'pick-reason': {
      const t = text.toLowerCase();
      const reason = RSVP_REASONS.find((r) => r.label.toLowerCase() === t || r.shortLabel.toLowerCase() === t || r.code === t)
        || RSVP_REASONS.find((r) => t.includes(r.shortLabel.toLowerCase()) || t.includes(r.code));
      if (!reason) return { state: prev, reply: 'Pick one of the reasons so your teacher knows.', suggestions: REASON_CHIPS, miss: true };
      if (reason.requiresNote) return { state: state(deps, 'note', { ...prev.data, reasonCode: reason.code }, prev), reply: 'Tell me a little more so your teacher knows what came up.', suggestions: [] };
      return propose(prev.data, deps, reason.code, null, prev);
    }
    case 'note': {
      if (text.length < 3) return { state: prev, reply: 'A few words is enough, for example "hospital visit".', suggestions: [] };
      return propose(prev.data, deps, String(prev.data.reasonCode), text.slice(0, 200), prev);
    }
    default:
      return askClass(deps);
  }
}
