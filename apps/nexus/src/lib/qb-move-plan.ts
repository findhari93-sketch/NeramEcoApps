/**
 * The choices behind "Move to another question bank", kept pure so the dialog
 * only renders them.
 *
 * The server (moveQuestionsToPaper in @neram/database) checks the same rules
 * and has the last word. These exist so the teacher sees a refusal before
 * pressing Move, with a way out, rather than an error after.
 */

import {
  QB_EXAM_TYPE_LABELS,
  QB_EXAM_TYPES,
  QB_SECTION_LABELS,
  QB_SECTION_ORDER,
  isJeeExam,
  qbSectionsForExam,
  type NexusQBOriginalPaper,
  type QBExamType,
  type QBQuestionSection,
} from '@neram/database';

export type MovablePaper = Pick<NexusQBOriginalPaper, 'id' | 'exam_type' | 'year' | 'session' | 'shift'>;

export interface MovableQuestion {
  id: string;
  section: string | null;
  display_order: number | null;
  question_format: string;
  question_text?: string | null;
}

/** 'keep' leaves each question in its own section. */
export type MoveSectionChoice = QBQuestionSection | 'keep';

/** "2021 Session 1 (AN)". */
export function sittingLabel(paper: Pick<MovablePaper, 'year' | 'session' | 'shift'>): string {
  const shift = paper.shift === 'forenoon' ? ' (FN)' : paper.shift === 'afternoon' ? ' (AN)' : '';
  return `${paper.year}${paper.session ? ` ${paper.session}` : ''}${shift}`;
}

/** "JEE Paper 2A (B.Arch) 2021 Session 1 (AN)". */
export function paperLabel(paper: MovablePaper): string {
  return `${QB_EXAM_TYPE_LABELS[paper.exam_type as QBExamType] ?? paper.exam_type} ${sittingLabel(paper)}`;
}

const sameSitting = (a: MovablePaper, b: MovablePaper) =>
  a.year === b.year && (a.session ?? '') === (b.session ?? '') && (a.shift ?? '') === (b.shift ?? '');

const newestFirst = (a: MovablePaper, b: MovablePaper) =>
  b.year - a.year ||
  (a.session ?? '').localeCompare(b.session ?? '') ||
  (a.shift ?? '').localeCompare(b.shift ?? '');

export interface MoveTargetOption {
  /** 'new' when the paper does not exist yet and the move creates it. */
  value: string;
  label: string;
  willCreate: boolean;
}

/**
 * The papers of `targetExam` a selection from `source` can go to.
 *
 * Between the two JEE papers the same sitting comes first, and is offered even
 * when it does not exist yet (the move creates it): that is the 2021 Session 1
 * (AN) case. NATA sittings never line up with JEE ones, so a NATA target is
 * always an existing paper.
 */
export function moveTargetOptions(
  source: MovablePaper,
  papers: MovablePaper[],
  targetExam: QBExamType,
): MoveTargetOption[] {
  const ofExam = papers.filter((p) => p.exam_type === targetExam && p.id !== source.id).sort(newestFirst);
  const options: MoveTargetOption[] = [];
  if (isJeeExam(targetExam) && isJeeExam(source.exam_type) && targetExam !== source.exam_type) {
    const twin = ofExam.find((p) => sameSitting(p, source));
    options.push(
      twin
        ? { value: twin.id, label: sittingLabel(twin), willCreate: false }
        : { value: 'new', label: `${sittingLabel(source)}, will be created`, willCreate: true },
    );
  }
  for (const p of ofExam) {
    if (!options.some((o) => o.value === p.id)) options.push({ value: p.id, label: sittingLabel(p), willCreate: false });
  }
  return options;
}

/** The exams a paper of `sourceExam` can send questions to. */
export function otherExams(sourceExam: string): QBExamType[] {
  return QB_EXAM_TYPES.filter((e) => e !== sourceExam);
}

const fitsExam = (section: string | null, exam: QBExamType) =>
  !!section && (qbSectionsForExam(exam) as string[]).includes(section);

/**
 * Where the section picker starts. Keep each question's section when they all
 * exist on the target; otherwise Planning for 2B (Planning questions filed
 * under Drawing, the case this was built for), else the target's first.
 */
export function defaultMoveSection(questions: MovableQuestion[], targetExam: QBExamType): MoveSectionChoice {
  if (questions.length > 0 && questions.every((q) => fitsExam(q.section, targetExam))) return 'keep';
  if (targetExam === 'JEE_PAPER_2B') return 'planning';
  return qbSectionsForExam(targetExam)[0];
}

/** Questions whose section the target exam does not have, when keeping sections. */
export function homelessQuestions(
  questions: MovableQuestion[],
  targetExam: QBExamType,
  section: MoveSectionChoice,
): MovableQuestion[] {
  return section === 'keep' ? questions.filter((q) => !fitsExam(q.section, targetExam)) : [];
}

/** Drawing prompts that would land outside a Drawing section, which the server refuses. */
export function blockedDrawings(questions: MovableQuestion[], section: MoveSectionChoice): MovableQuestion[] {
  return questions.filter(
    (q) => q.question_format === 'DRAWING_PROMPT' && (section === 'keep' ? q.section : section) !== 'drawing',
  );
}

/** "Move 25 questions from JEE Paper 2A (B.Arch) 2021 Session 1 (AN) to JEE Paper 2B (B.Planning) 2021 Session 1 (AN), into Planning." */
export function moveSummary(
  count: number,
  source: MovablePaper,
  targetExam: QBExamType,
  target: MoveTargetOption | null,
  section: MoveSectionChoice,
): string {
  const what = `${count} question${count === 1 ? '' : 's'}`;
  const where = `${QB_EXAM_TYPE_LABELS[targetExam]}${target ? ` ${target.label.replace(/, will be created$/, '')}` : ''}`;
  const into = section === 'keep' ? ', each in its own section' : `, into ${QB_SECTION_LABELS[section]}`;
  return `Move ${what} from ${paperLabel(source)} to ${where}${into}.`;
}

/** Selected questions grouped by section, in paper order, for the pick list. */
export function groupBySection(questions: MovableQuestion[]): Array<{ section: string; questions: MovableQuestion[] }> {
  const order = ['math_mcq', 'math_numerical', 'aptitude', 'drawing', 'planning'];
  const groups = new Map<string, MovableQuestion[]>();
  for (const q of questions) {
    const key = q.section ?? '';
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([section, list]) => ({
      section,
      questions: list.sort((a, b) => (a.display_order ?? 1e9) - (b.display_order ?? 1e9)),
    }));
}

/* ── A whole paper changing exam (Edit paper details) ── */

export type PaperSectionMap = Partial<Record<QBQuestionSection, QBQuestionSection>>;

export interface SectionRemap {
  /** A section on the paper that the new exam does not have. */
  section: QBQuestionSection;
  /** Questions in it that need a new section. */
  count: number;
  /** The new exam's sections, to pick from. */
  options: QBQuestionSection[];
}

/** Drawing prompts always stay behind when a paper becomes B.Planning, which has no Drawing. */
const staysBehindFor2B = (q: MovableQuestion, targetExam: QBExamType) =>
  targetExam === 'JEE_PAPER_2B' && q.question_format === 'DRAWING_PROMPT';

/** Sections of the paper the new exam lacks, each with how many questions it holds. */
export function paperExamRemaps(questions: MovableQuestion[], targetExam: QBExamType): SectionRemap[] {
  const options = qbSectionsForExam(targetExam);
  const counts = new Map<QBQuestionSection, number>();
  for (const q of questions) {
    if (!q.section || fitsExam(q.section, targetExam) || staysBehindFor2B(q, targetExam)) continue;
    const section = q.section as QBQuestionSection;
    counts.set(section, (counts.get(section) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => QB_SECTION_ORDER[a] - QB_SECTION_ORDER[b])
    .map(([section, count]) => ({ section, count, options }));
}

/** Planning when the new exam has it (Drawing became Planning), else Aptitude. */
export function defaultRemapTarget(targetExam: QBExamType): QBQuestionSection {
  return qbSectionsForExam(targetExam).includes('planning') ? 'planning' : 'aptitude';
}

export function defaultSectionMap(questions: MovableQuestion[], targetExam: QBExamType): PaperSectionMap {
  const map: PaperSectionMap = {};
  for (const r of paperExamRemaps(questions, targetExam)) map[r.section] = defaultRemapTarget(targetExam);
  return map;
}

/** Drawing prompts that would lose their Drawing section, so stay behind under the old name. */
export function leftBehindDrawings(
  questions: MovableQuestion[],
  targetExam: QBExamType,
  map: PaperSectionMap,
): MovableQuestion[] {
  return questions.filter((q) => {
    if (q.question_format !== 'DRAWING_PROMPT') return false;
    if (targetExam === 'JEE_PAPER_2B') return true;
    const to = q.section ? map[q.section as QBQuestionSection] : undefined;
    return !!to && to !== 'drawing';
  });
}
