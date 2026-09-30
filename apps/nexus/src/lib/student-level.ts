/**
 * Student levels: Top, Mid, Needs practice. A teacher's judgement of how ready a
 * student is for the exam, per skill, plus the one OVERALL level the avatar shows.
 *
 * Why three levels and never a percentage: Nexus has no history yet that links
 * a student's signals to an exam result, so a "chance %" would be invented
 * precision. Three honest levels are what a teacher can act on: Top students get
 * an assignment and are left to work, Mid and Needs practice get teacher time.
 *
 * The skills differ per exam, which is why SKILLS carries `exams`:
 *
 *   drawing   JEE Paper 2 and NATA. The only skill set today, by a manager
 *             looking across the student's sketches.
 *   aptitude  both exams, but the syllabus differs. NATA's logical reasoning
 *             folds in here and is not tracked on its own.
 *   maths     JEE only.
 *
 * Aptitude and maths are listed so the snapshot can say "Not tracked yet"
 * honestly; they become real once Neram tests measure them reliably, and the
 * database CHECK widens then.
 *
 * NAMING. "Level" and "skill", never "band" (a 1-5 rubric band on a drawing)
 * or "readiness" (drawing-brief-readiness.ts, recap and prep readiness).
 *
 * PURE TypeScript, JSX-free, like student-stage.ts, so route handlers and
 * components share the same words.
 */

export type LevelKey = 'top' | 'mid' | 'needs_practice';

/** Strongest first. Drives menus, filter pills and the legend. */
export const LEVEL_KEYS: readonly LevelKey[] = ['top', 'mid', 'needs_practice'];

export const LEVEL_LABEL: Record<LevelKey, string> = {
  top: 'Top',
  mid: 'Mid',
  needs_practice: 'Needs practice',
};

/** How many of the three signal bars are filled. */
export const LEVEL_BARS: Record<LevelKey, 1 | 2 | 3> = {
  top: 3,
  mid: 2,
  needs_practice: 1,
};

/** What the level means for the teacher's time. One scannable line. */
export const LEVEL_MEANING: Record<LevelKey, string> = {
  top: 'Assign and let them work. Ready for exam papers.',
  mid: 'Getting there. Guided tasks on specific skills.',
  needs_practice: 'Basics first, with closer attention.',
};

/** Shown wherever a student has no level yet. */
export const NOT_RATED_LABEL = 'Not rated';

export type SkillKey = 'drawing' | 'aptitude' | 'maths';
export type ExamKey = 'jee' | 'nata';

export interface SkillDef {
  key: SkillKey;
  label: string;
  /** The exams this skill counts for. */
  exams: readonly ExamKey[];
  /** False until a level for it can actually be set or measured. */
  tracked: boolean;
}

export const SKILLS: readonly SkillDef[] = [
  { key: 'drawing', label: 'Drawing', exams: ['jee', 'nata'], tracked: true },
  { key: 'aptitude', label: 'Aptitude', exams: ['jee', 'nata'], tracked: false },
  { key: 'maths', label: 'Maths', exams: ['jee'], tracked: false },
];

/** The skills a level can be written for today. Mirrors the database CHECK. */
export const SETTABLE_SKILLS: readonly SkillKey[] = SKILLS.filter((s) => s.tracked).map((s) => s.key);

/** Where a level change came from. Mirrors the events table CHECK. */
export type LevelSource = 'sort' | 'flip' | 'snapshot' | 'profile';
export const LEVEL_SOURCES: readonly LevelSource[] = ['sort', 'flip', 'snapshot', 'profile'];

export const NOTE_MAX = 280;

export function isLevelKey(value: unknown): value is LevelKey {
  return typeof value === 'string' && (LEVEL_KEYS as readonly string[]).includes(value);
}

export function isSettableSkill(value: unknown): value is SkillKey {
  return typeof value === 'string' && (SETTABLE_SKILLS as readonly string[]).includes(value);
}

export function isLevelSource(value: unknown): value is LevelSource {
  return typeof value === 'string' && (LEVEL_SOURCES as readonly string[]).includes(value);
}

export type SkillLevels = Partial<Record<SkillKey, LevelKey | null>>;

/**
 * The ONE level the avatar shows.
 *
 * Today it is the drawing level, because drawing is the only skill anyone sets.
 * When aptitude and maths are measured, the blend rule goes here and nowhere
 * else, so every avatar, filter and snapshot moves together.
 */
export function overallLevel(levels: SkillLevels): LevelKey | null {
  return levels.drawing ?? null;
}

/** Which skills feed the overall level right now, for the sentence under it. */
export function overallBasis(): string {
  return 'Based on drawing for now.';
}

/**
 * The words the avatar speaks about the level, appended to the info ring's own
 * sentence. Null when not rated, so an unrated face says nothing extra.
 */
export function levelSentence(level: LevelKey | null | undefined): string | null {
  if (!level) return null;
  return `Overall level: ${LEVEL_LABEL[level]} (drawing).`;
}

/** "Drawing: Top", or "Drawing: Not rated". */
export function skillLevelLabel(skill: SkillKey, level: LevelKey | null | undefined): string {
  const def = SKILLS.find((s) => s.key === skill);
  return `${def?.label ?? skill}: ${level ? LEVEL_LABEL[level] : NOT_RATED_LABEL}`;
}

/** Filter keys for the roster: the three levels plus "not rated". */
export type LevelFilterKey = LevelKey | 'unrated';
export const LEVEL_FILTER_KEYS: readonly LevelFilterKey[] = [...LEVEL_KEYS, 'unrated'];

export function levelFilterLabel(key: LevelFilterKey): string {
  return key === 'unrated' ? NOT_RATED_LABEL : LEVEL_LABEL[key];
}

/** Does a row's level match the selected filters? No selection matches everything. */
export function matchesLevelFilter(level: LevelKey | null | undefined, selected: readonly LevelFilterKey[]): boolean {
  if (selected.length === 0) return true;
  return selected.includes(level ?? 'unrated');
}

export function countLevels(levels: readonly (LevelKey | null | undefined)[]): Record<LevelFilterKey, number> {
  const counts: Record<LevelFilterKey, number> = { top: 0, mid: 0, needs_practice: 0, unrated: 0 };
  for (const level of levels) counts[level ?? 'unrated'] += 1;
  return counts;
}

/**
 * Validates a PUT body for /api/students/[id]/skill-level. Returns the clean
 * value or an error sentence a person can act on.
 */
export function parseLevelWrite(body: unknown):
  | { ok: true; value: { skill: SkillKey; level: LevelKey | null; note: string | null; source: LevelSource } }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send a JSON body.' };
  const b = body as Record<string, unknown>;
  if (!isSettableSkill(b.skill)) return { ok: false, error: 'Only a drawing level can be set for now.' };
  if (b.level !== null && !isLevelKey(b.level)) {
    return { ok: false, error: 'Level must be top, mid, needs_practice or null.' };
  }
  if (!isLevelSource(b.source)) return { ok: false, error: 'Unknown source screen.' };
  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== 'string') return { ok: false, error: 'Note must be text.' };
    const trimmed = b.note.trim();
    if (trimmed.length > NOTE_MAX) return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
    note = trimmed || null;
  }
  return { ok: true, value: { skill: b.skill, level: b.level as LevelKey | null, note, source: b.source } };
}
