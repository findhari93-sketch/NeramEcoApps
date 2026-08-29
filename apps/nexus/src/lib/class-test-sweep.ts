/**
 * The nightly chase for class tests.
 *
 * nexus_class_test_reminders and its three query helpers have existed since the
 * class-test feature shipped, along with a manual "Remind" button, but nothing
 * ever ran on a schedule. So a class test set on Tuesday and due Friday went
 * unmentioned unless a teacher remembered to press the button.
 *
 * Folded into /api/cron/catchup-overdue rather than given a cron entry of its
 * own: apps/nexus/vercel.json already carries eighteen, that job already runs
 * daily, already walks classes and absences, and already addresses the same
 * students about the same missed work.
 */

/** Nobody hears about the same test twice inside this many hours. */
export const CLASS_TEST_REMINDER_COOLDOWN_HOURS = 48;

/** Total reminders one student can ever get about one test. */
export const CLASS_TEST_REMINDER_CAP = 3;

export const TEMPLATE_DUE_SOON = 'class_test_due_soon';
export const TEMPLATE_MISSED = 'class_test_missed';

export interface SweepCandidate {
  student_id: string;
  /** True once they have a submitted official attempt. */
  done: boolean;
  /** False for anyone the run is not answerable for. */
  is_mandatory: boolean;
  /** A live window of their own, past the run's shared close. */
  window_open_until: string | null;
}

export interface SweepDecision {
  student_id: string;
  template: typeof TEMPLATE_DUE_SOON | typeof TEMPLATE_MISSED;
}

/**
 * Who to chase about one run, and with which message.
 *
 * PURE, so the rules can be tested without a database or an outbox. The whole
 * value of this function is what it does NOT return: a chase list that includes
 * people who already did the work, were never asked for it, or have already
 * been told twice this week is a chase list teachers learn to ignore.
 */
export function decideClassTestReminders(input: {
  candidates: SweepCandidate[];
  /** The run's shared close time. Null means it never shuts. */
  closesAt: string | null;
  /** Already chased with this template inside the cooldown. */
  recentlyRemindedByTemplate: Record<string, Set<string>>;
  /** Reminders each student has had about this run, all time. */
  sentCounts: Map<string, number>;
  now: number;
}): SweepDecision[] {
  const { closesAt, now } = input;
  if (!closesAt) return [];
  const closes = Date.parse(closesAt);
  if (Number.isNaN(closes)) return [];

  const hoursOut = (closes - now) / 3600000;
  // Only two moments are worth a message: the day before it shuts, and the day
  // after. Anything else is noise about a deadline that is neither near nor
  // newly missed.
  let template: SweepDecision['template'] | null = null;
  if (hoursOut <= 24 && hoursOut > 0) template = TEMPLATE_DUE_SOON;
  else if (hoursOut <= 0 && hoursOut > -24) template = TEMPLATE_MISSED;
  if (!template) return [];

  const recent = input.recentlyRemindedByTemplate[template] || new Set<string>();
  const out: SweepDecision[] = [];

  for (const c of input.candidates) {
    if (c.done) continue;
    if (!c.is_mandatory) continue;
    if (recent.has(c.student_id)) continue;
    if ((input.sentCounts.get(c.student_id) || 0) >= CLASS_TEST_REMINDER_CAP) continue;

    // A student holding a live window of their own has not missed anything: the
    // shared door shut, theirs did not. Telling them they missed it would be
    // plainly wrong, and it is the exact case the reopen flow exists to create.
    if (template === TEMPLATE_MISSED && c.window_open_until) {
      const until = Date.parse(c.window_open_until);
      if (!Number.isNaN(until) && until > now) continue;
    }

    out.push({ student_id: c.student_id, template });
  }

  return out;
}

/** The message body for each template. */
export function classTestReminderMessage(
  template: SweepDecision['template'],
  testTitle: string,
): { subject: string; body: string } {
  if (template === TEMPLATE_DUE_SOON) {
    return {
      subject: 'Your class test closes tomorrow',
      body: `${testTitle} closes tomorrow. It only takes a few minutes, and finishing it is how your teacher knows the chapter landed.`,
    };
  }
  return {
    subject: 'You missed the class test',
    body: `${testTitle} has closed and you did not sit it. You can ask your teacher to reopen it from the test page.`,
  };
}
