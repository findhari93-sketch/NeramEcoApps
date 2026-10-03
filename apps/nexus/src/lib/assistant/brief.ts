/**
 * The daily brief: what a student should know when they arrive, as templated
 * sentences built from facts. No model. The same function feeds the dashboard
 * card, the `my_brief` tool and (M3) the morning Teams message, so the three
 * cannot say different things.
 */
import { formatTime12, relativeDay } from './format';

export interface BriefFacts {
  firstName: string | null;
  /** IST calendar date. */
  today: string;
  classroomName: string | null;
  nextClass: { id: string; title: string; date: string; startTime: string; endTime: string; declined: boolean } | null;
  assignments: { pending: number; nextTitle: string | null; nextDueOn: string | null };
  /** Null when the student has no catch-up list at all. */
  catchup: { open: number; sentence: string | null } | null;
  /** Drawings reviewed by a teacher in the last seven days. */
  reviewsBack: number;
  /** rhythmLine() from lib/sketchbook-rhythm, or null when the sketchbook is off. */
  sketchbookLine: string | null;
  exam: { shortLabel: string; headline: string; detail: string } | null;
  /** Texts of reminders due today, and only today (Ruling 24). */
  remindersToday: string[];
}

export type BriefSectionId = 'next_class' | 'assignments' | 'catchup' | 'reviews' | 'sketchbook' | 'exam' | 'reminders';

export interface BriefSection {
  id: BriefSectionId;
  text: string;
  link: string | null;
}

export interface Brief {
  greeting: string;
  classroomName: string | null;
  sections: BriefSection[];
  hasContent: boolean;
}

function greeting(firstName: string | null, hour: number): string {
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return firstName ? `${part}, ${firstName}` : part;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `nowHourIst` is 0 to 23 in IST; the caller reads the clock so this stays pure. */
export function buildBrief(f: BriefFacts, nowHourIst: number): Brief {
  const sections: BriefSection[] = [];

  if (f.nextClass) {
    const when = relativeDay(f.nextClass.date, f.today);
    const declined = f.nextClass.declined ? ' You said you cannot attend.' : '';
    sections.push({ id: 'next_class', text: `Class ${when} at ${formatTime12(f.nextClass.startTime)}: ${f.nextClass.title}.${declined}`, link: '/student/timetable' });
  }

  if (f.assignments.pending > 0) {
    const head = plural(f.assignments.pending, 'assignment', 'assignments');
    let text: string;
    if (f.assignments.nextTitle && f.assignments.nextDueOn) {
      text = `${head} to submit. ${f.assignments.nextTitle} is due ${relativeDay(f.assignments.nextDueOn, f.today)}.`;
    } else if (f.assignments.nextTitle) {
      text = `${head} to submit: ${f.assignments.nextTitle}.`;
    } else {
      text = `${head} to submit.`;
    }
    sections.push({ id: 'assignments', text, link: '/student/assignments' });
  }

  if (f.catchup && f.catchup.open > 0) {
    const text = f.catchup.sentence || `${plural(f.catchup.open, 'class', 'classes')} to catch up on.`;
    sections.push({ id: 'catchup', text, link: '/student/catch-up' });
  }

  if (f.reviewsBack > 0) {
    sections.push({ id: 'reviews', text: `${plural(f.reviewsBack, 'drawing', 'drawings')} came back with a review this week.`, link: '/student/drawings' });
  }

  if (f.sketchbookLine) {
    sections.push({ id: 'sketchbook', text: `Sketchbook: ${f.sketchbookLine}`, link: '/student/sketchbook' });
  }

  if (f.exam) {
    const detail = f.exam.detail ? ` ${f.exam.detail.replace(/\.?$/, '.')}` : '';
    sections.push({ id: 'exam', text: `${f.exam.shortLabel}: ${f.exam.headline.replace(/\.?$/, '.')}${detail}`, link: '/student/dashboard' });
  }

  if (f.remindersToday.length > 0) {
    sections.push({ id: 'reminders', text: `You asked me to remind you today: ${f.remindersToday.join('; ')}.`, link: null });
  }

  return { greeting: greeting(f.firstName, nowHourIst), classroomName: f.classroomName, sections, hasContent: sections.length > 0 };
}
