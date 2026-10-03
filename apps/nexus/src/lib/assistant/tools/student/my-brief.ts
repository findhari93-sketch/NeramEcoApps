import { buildBrief } from '@/lib/assistant/brief';
import { istHour, loadBriefFacts } from '@/lib/assistant/brief-load';
import type { ToolDef, ToolLink } from '@/lib/assistant/types';
import { EMPTY_SCHEMA } from './shared';

const LABELS: Record<string, string> = {
  '/student/timetable': 'Timetable', '/student/assignments': 'Assignments', '/student/catch-up': 'Catch-up',
  '/student/drawings': 'My drawings', '/student/sketchbook': 'Sketchbook', '/student/dashboard': 'Dashboard',
};

export const myBrief: ToolDef = {
  name: 'my_brief',
  description: "Today's summary for the student: next class, work due, catch-up, reviews, sketchbook, exam countdown, reminders.",
  parameters: EMPTY_SCHEMA,
  audience: 'student',
  kind: 'read',
  async run(ctx) {
    const facts = await loadBriefFacts(ctx.supabase, ctx.caller.id, ctx.now, ctx.features);
    const brief = buildBrief(facts, istHour(ctx.now));
    if (!brief.hasContent) return { ok: true, reply: `${brief.greeting}. Nothing is waiting on you right now.`, data: brief };
    const links: ToolLink[] = [];
    for (const s of brief.sections) if (s.link && !links.some((l) => l.url === s.link)) links.push({ label: LABELS[s.link] || 'Open', url: s.link });
    return { ok: true, reply: `${brief.greeting}. ${brief.sections.map((s) => s.text).join(' ')}`, data: brief, links };
  },
};
