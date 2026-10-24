/**
 * Who a person is to Neram, and which language they follow, for PersonAvatar.
 *
 * THE RING. One look at a list should answer "is this our student?":
 *
 *   student  gold          a student_profiles row, a linked classroom account,
 *                          or a CRM stage of enrolled / active student
 *   paused   dashed gold   our student, lifecycle_stage 'paused'
 *   alumni   silver        is_alumni or lifecycle_stage 'alumni'
 *   lead     slate         everyone else in the funnel, including demo
 *                          requests that have no account yet
 *   staff    blue          admin and teacher accounts
 *   other    dotted slate  parents, guests and outside reviewers
 *   none     no ring       only while the facts are still loading
 *
 * A fee that is entered but not finalised is still a lead: gold always means a
 * confirmed student, and the demo desk already says "Payment entered" in words.
 *
 * THE LANGUAGE. users.home_language is a fact staff recorded (in Nexus or here)
 * and wins outright, including a recorded 'english', which means "no mark, and
 * do not guess". Without one, the server guesses from the site language they
 * picked, then their state, then their city (person-language.server.ts), and the
 * mark is drawn grey with "Likely" in front. A guess is never written back.
 *
 * Pure TypeScript, no JSX and no @neram/geo: the browser imports this file.
 */
// The subpath, not the '@neram/ui' barrel: API routes import this file too, and
// the barrel is a 'use client' module.
import {
  LANGUAGES,
  LIMITED_ENGLISH_LABEL,
  isLanguageValue,
  showsLanguageMark,
  type LanguageKey,
} from '@neram/ui/language';
import type { AvatarRingVariant } from '@neram/ui';
import type { StudySource } from './person-study';

// ── The facts ───────────────────────────────────────────────────────────────

export type LanguageGuessSource = 'locale' | 'state' | 'city';

/** A language worked out from where someone lives or the site language they use. */
export interface LanguageGuess {
  key: LanguageKey;
  source: LanguageGuessSource;
  /** The place or setting it came from, as people read it ("Chennai", "Tamil Nadu"). */
  from: string | null;
}

/** Everything PersonAvatar needs about one person. All optional: screens pass what they have. */
export interface PersonFacts {
  name: string | null;
  avatarUrl: string | null;
  userType: string | null;
  lifecycleStage: string | null;
  pipelineStage: string | null;
  isAlumni: boolean;
  studentProfileId: string | null;
  linkedClassroomEmail: string | null;
  /** users.home_language: recorded by staff, null when nobody has. */
  homeLanguage: string | null;
  limitedEnglish: boolean;
  /** Present only when homeLanguage is null and something pointed at a language. */
  guess: LanguageGuess | null;

  // ── The glance details: corners and the hover card ──
  /** The exam they are preparing for (user_lifecycle_view.exam_year). Top-right "27". */
  examYear: number | null;
  /**
   * '10th' | '11th' | '12th' | 'gap_year', resolved on the server from Nexus,
   * staff, the application and the demo booking (person-study.ts). A break year
   * ('gap_year') fills the exam pill orange.
   */
  currentStandard: string | null;
  /** Where currentStandard came from: the hover card flags a student's own word. */
  studySource: StudySource | null;
  /** The year a break-year student finished Class 12. */
  twelfthPassedYear: number | null;
  city: string | null;
  state: string | null;
  /** Their Nexus classroom, for a student. */
  classroomName: string | null;
  /** user_lifecycle_view.engagement: new | engaged | low | inactive | dormant. */
  engagement: string | null;
  lastActiveAt: string | null;
  /** The interest staff logged on their open follow-up: hot | warm | cold. */
  interest: string | null;
}

// ── The ring ────────────────────────────────────────────────────────────────

const FUNNEL_USER_TYPES = new Set(['lead', 'student']);
const STAFF_USER_TYPES = new Set(['admin', 'teacher']);
const STUDENT_STAGES = new Set(['enrolled', 'active_student']);

/**
 * The ring for one person. First match wins, in the order the table above reads.
 * Undefined facts mean "not loaded yet" and draw no ring, so nothing flashes.
 */
export function resolvePersonRing(facts: Partial<PersonFacts> | null | undefined): AvatarRingVariant {
  if (!facts) return 'none';
  if (facts.userType && STAFF_USER_TYPES.has(facts.userType)) return 'staff';
  if (facts.userType && !FUNNEL_USER_TYPES.has(facts.userType)) return 'other';
  if (facts.isAlumni || facts.lifecycleStage === 'alumni') return 'alumni';
  if (facts.lifecycleStage === 'paused') return 'paused';
  if (
    STUDENT_STAGES.has(facts.lifecycleStage ?? '') ||
    facts.pipelineStage === 'enrolled' ||
    !!facts.studentProfileId ||
    !!facts.linkedClassroomEmail
  ) {
    return 'student';
  }
  return 'lead';
}

/** Words for each ring, for the tooltip, the aria-label and the key. */
export const RING_LABEL: Record<AvatarRingVariant, string> = {
  student: 'Enrolled student',
  paused: 'Paused student',
  alumni: 'Alumni',
  lead: 'Lead',
  staff: 'Neram staff',
  other: 'Not a student',
  none: '',
};

export const RING_HELP: Record<Exclude<AvatarRingVariant, 'none'>, string> = {
  student: 'Studying with us now.',
  paused: 'Our student, taking a break.',
  alumni: 'Studied with us before.',
  lead: 'Signed up, applied or booked a demo. Not enrolled yet.',
  staff: 'Works at Neram.',
  other: 'A parent, a chat guest or an outside reviewer.',
};

// ── The language ────────────────────────────────────────────────────────────

/** The site language (users.preferred_language) that points at a home language. 'en' says nothing. */
const LOCALE_LANGUAGE: Record<string, LanguageKey> = {
  ta: 'tamil',
  hi: 'hindi',
  kn: 'kannada',
  ml: 'malayalam',
  te: 'telugu',
};

export function languageFromLocale(locale: string | null | undefined): LanguageKey | null {
  return (locale && LOCALE_LANGUAGE[locale.trim().toLowerCase()]) || null;
}

/**
 * The language most people in a state follow, by @neram/geo state slug.
 * Only the six we teach in; a state outside them gives no guess at all.
 */
export const STATE_LANGUAGE: Record<string, LanguageKey> = {
  'tamil-nadu': 'tamil',
  puducherry: 'tamil',
  karnataka: 'kannada',
  kerala: 'malayalam',
  lakshadweep: 'malayalam',
  'andhra-pradesh': 'telugu',
  telangana: 'telugu',
  'uttar-pradesh': 'hindi',
  'madhya-pradesh': 'hindi',
  bihar: 'hindi',
  jharkhand: 'hindi',
  rajasthan: 'hindi',
  haryana: 'hindi',
  delhi: 'hindi',
  chhattisgarh: 'hindi',
  uttarakhand: 'hindi',
  'himachal-pradesh': 'hindi',
  chandigarh: 'hindi',
};

/** What the avatar corner shows: a recorded language, a guess, or nothing. */
export interface AvatarLanguage {
  key: LanguageKey;
  limitedEnglish: boolean;
  likely: boolean;
  guess: LanguageGuess | null;
}

/**
 * Recorded beats guessed. A recorded 'english' with no limited-English tick is a
 * decision ("no mark"), so it also silences any guess.
 */
export function avatarLanguageOf(facts: Partial<PersonFacts> | null | undefined): AvatarLanguage | null {
  if (!facts) return null;
  const limitedEnglish = facts.limitedEnglish === true;
  if (isLanguageValue(facts.homeLanguage)) {
    const key = facts.homeLanguage;
    return showsLanguageMark(key, limitedEnglish) ? { key, limitedEnglish, likely: false, guess: null } : null;
  }
  if (facts.guess) return { key: facts.guess.key, limitedEnglish, likely: true, guess: facts.guess };
  if (limitedEnglish) return { key: 'english', limitedEnglish, likely: false, guess: null };
  return null;
}

/** "Tamil." / "Tamil, limited English." / "Likely Tamil, from Chennai." */
export function avatarLanguageSentence(language: AvatarLanguage | null): string | null {
  if (!language) return null;
  const label = LANGUAGES[language.key].label;
  if (language.likely) {
    const from = language.guess?.from ? `, from ${language.guess.from}` : '';
    const limited = language.limitedEnglish ? ` ${LIMITED_ENGLISH_LABEL}.` : '';
    return `Likely ${label}${from}.${limited}`;
  }
  if (language.key === 'english') return `${LIMITED_ENGLISH_LABEL}.`;
  return language.limitedEnglish ? `${label}, limited English.` : `${label}.`;
}

/** The chip's short label: "Tamil", "Likely Tamil", "English". */
export function languageChipLabel(facts: Partial<PersonFacts> | null | undefined): string {
  const language = avatarLanguageOf(facts);
  if (!language) return isLanguageValue(facts?.homeLanguage) ? 'English' : 'Language';
  const label = LANGUAGES[language.key].label;
  if (language.likely) return `Likely ${label}`;
  if (language.key === 'english') return LIMITED_ENGLISH_LABEL;
  return language.limitedEnglish ? `${label}, limited English` : label;
}

/**
 * The whole sentence an avatar says: "Asha Kumar. Enrolled student. Tamil."
 * The name comes first so a screen reader announces the person before the facts.
 */
export function personAvatarLabel(
  name: string | null | undefined,
  ring: AvatarRingVariant,
  language: AvatarLanguage | null,
  /** Says what this person is when the ring's own word is too general ("Parent", "Google reviewer"). */
  ringLabel?: string | null,
): string {
  const parts = [name?.trim() ? `${name.trim()}.` : null];
  const role = ringLabel || RING_LABEL[ring];
  if (role) parts.push(`${role}.`);
  parts.push(avatarLanguageSentence(language));
  return parts.filter(Boolean).join(' ');
}

// ── From rows screens already hold ──────────────────────────────────────────

/**
 * The ring facts a CRM row (user_journey_view / user_lifecycle_view) already
 * carries, so the ring paints with the row. The language is not on these rows;
 * PersonAvatar fills it in from the provider by userId.
 */
export function factsFromJourney(row: {
  name?: string | null;
  avatar_url?: string | null;
  user_type?: string | null;
  lifecycle_stage?: string | null;
  pipeline_stage?: string | null;
  is_alumni?: boolean | null;
  student_profile_id?: string | null;
  linked_classroom_email?: string | null;
  exam_year?: number | null;
  city?: string | null;
  state?: string | null;
  nexus_classroom_name?: string | null;
  engagement?: string | null;
  last_meaningful_activity_at?: string | null;
}): Partial<PersonFacts> {
  // A column this row does not carry stays undefined, so the looked-up value
  // shows instead of being overwritten with a null that only means "not selected".
  // current_standard is left to the provider on purpose: the row only knows the
  // Nexus enrolment's, and its null would hide a break year from the application.
  const has = (key: keyof typeof row) => Object.prototype.hasOwnProperty.call(row, key);
  const opt = <T,>(key: keyof typeof row, value: T) => (has(key) ? value : undefined);
  return {
    avatarUrl: opt('avatar_url', row.avatar_url ?? null),
    userType: opt('user_type', row.user_type ?? null),
    lifecycleStage: opt('lifecycle_stage', row.lifecycle_stage ?? null),
    pipelineStage: opt('pipeline_stage', row.pipeline_stage ?? null),
    isAlumni: opt('is_alumni', row.is_alumni === true),
    studentProfileId: opt('student_profile_id', row.student_profile_id ?? null),
    linkedClassroomEmail: opt('linked_classroom_email', row.linked_classroom_email ?? null),
    examYear: opt('exam_year', row.exam_year ?? null),
    city: opt('city', row.city ?? null),
    state: opt('state', row.state ?? null),
    classroomName: opt('nexus_classroom_name', row.nexus_classroom_name ?? null),
    engagement: opt('engagement', row.engagement ?? null),
    lastActiveAt: opt('last_meaningful_activity_at', row.last_meaningful_activity_at ?? null),
  };
}

/**
 * The ring for someone known only by the exam they sat with us (a result row,
 * no account id): our student until that exam season is over, alumni after.
 * NATA and JEE B.Arch results are all out by the end of July.
 */
export function ringForExamYear(examYear: number | null | undefined, now: Date = new Date()): AvatarRingVariant {
  if (!examYear) return 'student';
  const seasonOver = new Date(examYear, 7, 1); // 1 August of the exam year
  return now >= seasonOver ? 'alumni' : 'student';
}

// ── The glance: corners and the hover card ──────────────────────────────────

/** Only people in the funnel carry exam, class, heat and activity marks. */
export function showsGlanceMarks(ring: AvatarRingVariant): boolean {
  return ring === 'student' || ring === 'paused' || ring === 'alumni' || ring === 'lead';
}

/** "27" for the 2027 exam: the season CRM segments everyone by. */
export function examYearMark(examYear: number | null | undefined): string | null {
  return examYear && examYear > 2000 ? String(examYear % 100).padStart(2, '0') : null;
}

export const STANDARD_LABEL: Record<string, string> = {
  '12th': 'Class 12',
  '11th': 'Class 11',
  '10th': 'Class 10',
  gap_year: 'Break year',
};

/** Nexus's break-year orange (student-stage.ts gap_year): white on it is 5.2:1. */
export const BREAK_YEAR_COLOR = '#C2410C';
/** A hot lead's flame. Red, so it never reads as the break-year orange: white on it is 6.5:1. */
export const HOT_LEAD_COLOR = '#B91C1C';

/** Finished Class 12 and preparing full time: the orange exam pill. */
export function isBreakYear(facts: Partial<PersonFacts> | null | undefined): boolean {
  return facts?.currentStandard === 'gap_year';
}

const STUDY_SOURCE_NOTE: Partial<Record<StudySource, string>> = {
  application: 'from their application',
  demo: 'from the demo booking',
};

/**
 * "Class 12, 2027 exam" / "Break year: finished Class 12 in 2025, 2027 exam" /
 * "2027 exam" / null. A stage the student gave on a form says so in brackets.
 */
export function studyLine(facts: Partial<PersonFacts> | null | undefined): string | null {
  const exam = facts?.examYear ? `${facts.examYear} exam` : null;
  let standard = facts?.currentStandard ? STANDARD_LABEL[facts.currentStandard] ?? null : null;
  if (standard && isBreakYear(facts) && facts?.twelfthPassedYear) {
    standard = `${standard}: finished Class 12 in ${facts.twelfthPassedYear}`;
  }
  const note = standard && facts?.studySource ? STUDY_SOURCE_NOTE[facts.studySource] : undefined;
  const line = [standard, exam].filter(Boolean).join(', ');
  return line ? (note ? `${line} (${note})` : line) : null;
}

/** "Chennai, Tamil Nadu", without repeating a city that is also the state's name. */
export function placeLine(facts: Partial<PersonFacts> | null | undefined): string | null {
  const city = facts?.city?.trim();
  const state = facts?.state?.trim();
  if (city && state && city.toLowerCase() !== state.toLowerCase()) return `${city}, ${state}`;
  return city || state || null;
}

/** Engaged or new in the last week or so: the green dot at bottom-right. */
export function isActiveRecently(facts: Partial<PersonFacts> | null | undefined): boolean {
  return facts?.engagement === 'engaged' || facts?.engagement === 'new';
}

export function isHotLead(facts: Partial<PersonFacts> | null | undefined, ring: AvatarRingVariant): boolean {
  return ring === 'lead' && facts?.interest === 'hot';
}

/** "Active today" / "Active 3 days ago" / "Last active 2 months ago" / null. */
export function activityLine(lastActiveAt: string | null | undefined, now: Date = new Date()): string | null {
  if (!lastActiveAt) return null;
  const then = new Date(lastActiveAt);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  if (days < 14) return `Active ${days} days ago`;
  if (days < 60) return `Last active ${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `Last active ${Math.round(days / 30)} months ago`;
  return `Last active ${Math.round(days / 365)} years ago`;
}

const INTEREST_LABEL: Record<string, string> = { hot: 'Hot lead', warm: 'Warm lead', cold: 'Cold lead' };

export function interestLabel(interest: string | null | undefined): string | null {
  return (interest && INTEREST_LABEL[interest]) || null;
}

/**
 * The facts a glance can carry, in the order the hover card and the
 * aria-label say them. Words only: the corners are drawn from the same facts.
 */
export function glanceSentences(facts: Partial<PersonFacts> | null | undefined, ring: AvatarRingVariant): string[] {
  if (!facts || !showsGlanceMarks(ring)) return [];
  return [
    isHotLead(facts, ring) ? 'Hot lead' : null,
    studyLine(facts),
    isActiveRecently(facts) ? 'Active this week' : null,
  ].filter((s): s is string => !!s);
}
