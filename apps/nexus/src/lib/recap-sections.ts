/**
 * The shape of a checkpoint while a teacher is editing it, and the one function
 * that is allowed to build it from an API response.
 *
 * Pure TypeScript, no JSX, so it can be unit tested without dragging the whole
 * component tree in, and so the class-recap editor and the Foundation chapter
 * track editor share exactly one definition rather than two that drift.
 *
 * THE ID IS LOAD BEARING. updateRecapSections decides update-in-place versus
 * re-create on whether a section carries its id, and re-creating archives the
 * live rows. nexus_class_recap_attempts hangs off those rows, so a save that
 * lost the ids leaves every student who had passed a checkpoint pointing at an
 * invisible one, and markRecapCompletedIfAllPassed then re-locks them. Silently,
 * mid-recap, because a teacher fixed a typo.
 *
 * That is exactly what happened: the query layer had a test guarding it, and the
 * editor screen defeated the guard by hand-mapping the response and dropping the
 * id. Hence toEditableSections, and hence the rule that nothing maps that
 * response itself.
 */

export interface EditableQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'a' | 'b' | 'c' | 'd';
  explanation: string;
}

export interface EditableSection {
  /**
   * Present for a checkpoint that already exists in the database, absent for one
   * the teacher or the generator just made. See the header: dropping this is a
   * data loss, not a cosmetic omission.
   */
  id?: string;
  title: string;
  description: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  min_questions_to_pass: number | null;
  questions: EditableQuestion[];
}

const OPTION_KEYS = ['a', 'b', 'c', 'd'] as const;

export const emptyQuestion = (): EditableQuestion => ({
  question_text: '',
  option_a: '',
  option_b: '',
  option_c: '',
  option_d: '',
  correct_option: 'a',
  explanation: '',
});

export const emptySection = (index: number): EditableSection => ({
  title: `Checkpoint ${index + 1}`,
  description: '',
  start_timestamp_seconds: 0,
  end_timestamp_seconds: 60,
  // Never a number here. A NULL pass mark is resolved server-side from the same
  // source the student quiz grades against, so the two cannot drift; guessing
  // one here is how a checkpoint ends up demanding every question in the bank.
  min_questions_to_pass: null,
  questions: [emptyQuestion()],
});

/**
 * Turn whatever the API returned into editable rows, keeping the id.
 *
 * Use this everywhere. Hand-mapping the response is how the id went missing the
 * first time, and nothing about the resulting bug is visible until a student who
 * had finished a recap finds themselves locked out of it again.
 */
export function toEditableSections(raw: unknown[]): EditableSection[] {
  return (raw || []).map((r) => {
    const s = (r || {}) as Record<string, any>;
    return {
      ...(s.id ? { id: String(s.id) } : {}),
      title: s.title || '',
      description: s.description || '',
      start_timestamp_seconds: s.start_timestamp_seconds ?? 0,
      end_timestamp_seconds: s.end_timestamp_seconds ?? 0,
      min_questions_to_pass: s.min_questions_to_pass ?? null,
      questions: (s.questions || []).map((q: Record<string, any>) => ({
        question_text: q.question_text || '',
        option_a: q.option_a || '',
        option_b: q.option_b || '',
        option_c: q.option_c || '',
        option_d: q.option_d || '',
        correct_option: (OPTION_KEYS as readonly string[]).includes(q.correct_option)
          ? (q.correct_option as EditableQuestion['correct_option'])
          : 'a',
        explanation: q.explanation || '',
      })),
    };
  });
}

/** Seconds as m:ss, so a teacher can find the moment in the recording. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}
