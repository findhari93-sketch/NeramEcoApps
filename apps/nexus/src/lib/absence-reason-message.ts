/**
 * What we say to a student who missed a class and told us nothing.
 *
 * PURE: no Supabase, no React, no sending. Returns the words and leaves
 * delivery to sendNudge, which is the only door a message to a student may go
 * through (see the standing rule in apps/nexus/CLAUDE.md). `{firstName}` is
 * filled in per recipient by sendNudge itself.
 *
 * THE TONE IS THE FEATURE. The thing being asked for is one sentence of
 * communication, not attendance, and every line here has to keep those two
 * apart. Missing a class is allowed and is said to be allowed, in the first
 * message and again in the last. What is not allowed is vanishing. A student
 * who reads step 3 and feels accused of truancy will not file a reason, they
 * will stop opening Nexus, and the feature will have produced exactly the
 * silence it exists to end.
 *
 * Three steps and no more. Each is tied to one class, so a student with three
 * silent misses has had exactly three messages and the third named the
 * consequence in words. Nobody is ever held over a rule they were not told.
 */

/** The three steps, one per class in the streak. */
export type AbsenceStep = 1 | 2 | 3;

export interface AbsenceReasonMessage {
  subject: string;
  plain: string;
  buttonLabel: string;
}

export interface AbsenceMessageInput {
  step: AbsenceStep;
  /** The class this message is about, as "Tue 6 Oct". */
  classDay: string;
  /** Earlier classes in the streak, oldest first, for steps 2 and 3. */
  earlierDays: string[];
}

/** "2 Oct and 5 Oct", or "2 Oct, 5 Oct and 9 Oct". No serial comma, no dashes. */
function listDays(days: string[]): string {
  if (days.length === 0) return '';
  if (days.length === 1) return days[0];
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}

export function absenceReasonMessage(input: AbsenceMessageInput): AbsenceReasonMessage {
  const all = listDays([...input.earlierDays, input.classDay]);

  if (input.step === 1) {
    return {
      subject: 'You missed a class, just tell us why',
      plain:
        `Hi {firstName}, you were down for the class on ${input.classDay} and we did not see you. ` +
        'That is completely fine, things come up. We only need a reason on the class so your ' +
        'teacher is not guessing. It takes about ten seconds. And if you already know about days ' +
        'you will be away later, put those dates in too and we will stop asking.',
      buttonLabel: 'Give a reason',
    };
  }

  if (input.step === 2) {
    return {
      subject: 'Two classes now, and nothing telling us why',
      plain:
        `Hi {firstName}, that is ${all} with no reason on either. ` +
        'Nobody is cross about a missed class. Being unreachable is the problem, because we ' +
        'cannot tell a busy week from something being wrong. Please add a reason for both. If you ' +
        'are going to be away for a while, put the dates in once and that covers all of it.',
      buttonLabel: 'Give a reason',
    };
  }

  // The only message that names the consequence, and it has to name the remedy
  // in the same breath. "Your access will be held" on its own is a threat; "add
  // a reason now and nothing happens" is a rule, and a rule is the thing a
  // seventeen year old can actually act on.
  return {
    subject: 'Last ask before your Nexus goes on hold',
    plain:
      `Hi {firstName}, you have missed ${all} and there is still no reason on any of them. ` +
      'We have asked twice. If nothing is recorded, your Nexus will be put on hold until you ' +
      'speak to your teacher. That is not a punishment. At this point we genuinely do not know ' +
      'whether you are all right, and that is the part we cannot leave alone. ' +
      'Add a reason now and nothing happens. If something is wrong, reply here and a teacher ' +
      'will call you.',
    buttonLabel: 'Give a reason',
  };
}

/**
 * The standing notice on a class share and on the Teams group post.
 *
 * Asked for by the founder: a student should learn the rule BEFORE they miss
 * anything, not on their third strike. This is the cheapest fairness win in the
 * whole feature, because it turns a hold from a surprise into a published
 * condition, and a published condition is one a student can comply with.
 *
 * RETURNS AN EMPTY STRING WHEN THE GATE IS OFF, and callers must pass the
 * resolved flag rather than hard-coding the line. Advertising a rule that is
 * not armed is an empty threat, and an empty threat is worse than saying
 * nothing: it teaches students that a Nexus notice does not mean what it says,
 * which is the exact credibility the hold depends on.
 *
 * Names the behaviour first and the consequence second, for the same reason
 * step 3 does.
 */
export function classPostAbsenceNotice(gateEnabled: boolean): string {
  if (!gateEnabled) return '';
  return (
    'If you cannot make it, record it in Nexus before the class. ' +
    'Classes missed with nothing recorded can put your Nexus on hold.'
  );
}
