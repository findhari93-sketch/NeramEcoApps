import { describe, it, expect } from 'vitest';
import {
  blockedDrawings,
  defaultMoveSection,
  defaultSectionMap,
  leftBehindDrawings,
  paperExamRemaps,
  groupBySection,
  homelessQuestions,
  moveSummary,
  moveTargetOptions,
  otherExams,
  sittingLabel,
  type MovablePaper,
  type MovableQuestion,
} from './qb-move-plan';

const p2a: MovablePaper = { id: 'p2a', exam_type: 'JEE_PAPER_2', year: 2021, session: 'Session 1', shift: 'afternoon' };
const p2aOther: MovablePaper = { id: 'p2a-22', exam_type: 'JEE_PAPER_2', year: 2022, session: 'Session 1', shift: null };
const p2b: MovablePaper = { id: 'p2b', exam_type: 'JEE_PAPER_2B', year: 2021, session: 'Session 1', shift: 'afternoon' };
const p2bOld: MovablePaper = { id: 'p2b-20', exam_type: 'JEE_PAPER_2B', year: 2020, session: null, shift: null };
const nata: MovablePaper = { id: 'nata', exam_type: 'NATA', year: 2024, session: 'Test 1', shift: null };

const q = (id: string, section: string | null, extra: Partial<MovableQuestion> = {}): MovableQuestion => ({
  id,
  section,
  display_order: 1,
  question_format: 'MCQ',
  ...extra,
});

describe('moveTargetOptions', () => {
  it('offers the same sitting first, then the rest newest first', () => {
    const options = moveTargetOptions(p2a, [p2a, p2aOther, p2b, p2bOld, nata], 'JEE_PAPER_2B');
    expect(options.map((o) => o.value)).toEqual(['p2b', 'p2b-20']);
    expect(options[0]).toMatchObject({ label: '2021 Session 1 (AN)', willCreate: false });
  });

  it('offers to create the same-sitting JEE paper when it is missing', () => {
    const options = moveTargetOptions(p2a, [p2a, p2bOld], 'JEE_PAPER_2B');
    expect(options[0]).toEqual({ value: 'new', label: '2021 Session 1 (AN), will be created', willCreate: true });
    expect(options[1].value).toBe('p2b-20');
  });

  it('never creates a NATA paper, since its sittings differ', () => {
    expect(moveTargetOptions(p2a, [p2a, nata], 'NATA')).toEqual([{ value: 'nata', label: '2024 Test 1', willCreate: false }]);
    expect(moveTargetOptions(p2a, [p2a], 'NATA')).toEqual([]);
  });

  it('within the same exam lists other papers only', () => {
    expect(moveTargetOptions(p2a, [p2a, p2aOther], 'JEE_PAPER_2').map((o) => o.value)).toEqual(['p2a-22']);
  });
});

describe('section choice', () => {
  it('keeps sections that the target has', () => {
    expect(defaultMoveSection([q('a', 'aptitude'), q('m', 'math_mcq')], 'JEE_PAPER_2B')).toBe('keep');
  });

  it('starts on Planning for Drawing questions moving to 2B', () => {
    expect(defaultMoveSection([q('a', 'drawing')], 'JEE_PAPER_2B')).toBe('planning');
  });

  it('starts on the first section for an unsectioned move elsewhere', () => {
    expect(defaultMoveSection([q('a', 'planning')], 'JEE_PAPER_2')).toBe('math_mcq');
  });

  it('flags questions whose section the target lacks only when keeping', () => {
    const list = [q('a', 'aptitude'), q('d', 'drawing')];
    expect(homelessQuestions(list, 'JEE_PAPER_2B', 'keep').map((x) => x.id)).toEqual(['d']);
    expect(homelessQuestions(list, 'JEE_PAPER_2B', 'planning')).toEqual([]);
  });

  it('blocks a drawing prompt from any section but Drawing', () => {
    const list = [q('d', 'drawing', { question_format: 'DRAWING_PROMPT' }), q('m', 'drawing')];
    expect(blockedDrawings(list, 'planning').map((x) => x.id)).toEqual(['d']);
    expect(blockedDrawings(list, 'keep')).toEqual([]);
  });
});

describe('labels', () => {
  it('reads a sitting and a move the way a teacher says them', () => {
    expect(sittingLabel(p2a)).toBe('2021 Session 1 (AN)');
    const target = moveTargetOptions(p2a, [p2a], 'JEE_PAPER_2B')[0];
    expect(moveSummary(25, p2a, 'JEE_PAPER_2B', target, 'planning')).toBe(
      'Move 25 questions from JEE Paper 2A (B.Arch) 2021 Session 1 (AN) to JEE Paper 2B (B.Planning) 2021 Session 1 (AN), into Planning.',
    );
    expect(moveSummary(1, p2b, 'JEE_PAPER_2', null, 'keep')).toBe(
      'Move 1 question from JEE Paper 2B (B.Planning) 2021 Session 1 (AN) to JEE Paper 2A (B.Arch), each in its own section.',
    );
  });

  it('lists the other exams', () => {
    expect(otherExams('JEE_PAPER_2B')).toEqual(['JEE_PAPER_2', 'NATA']);
  });

  it('groups a pick list by section in paper order', () => {
    const groups = groupBySection([
      q('d2', 'drawing', { display_order: 2 }),
      q('m1', 'math_mcq'),
      q('d1', 'drawing', { display_order: 1 }),
    ]);
    expect(groups.map((g) => [g.section, g.questions.map((x) => x.id)])).toEqual([
      ['math_mcq', ['m1']],
      ['drawing', ['d1', 'd2']],
    ]);
  });
});

describe('a whole paper changing exam', () => {
  const paper = [
    q('m', 'math_mcq'),
    q('p1', 'drawing'),
    q('p2', 'drawing'),
    q('d', 'drawing', { question_format: 'DRAWING_PROMPT' }),
  ];

  it('asks only about sections the new exam lacks, not counting drawings that stay behind', () => {
    expect(paperExamRemaps(paper, 'JEE_PAPER_2B')).toEqual([
      { section: 'drawing', count: 2, options: ['math_mcq', 'math_numerical', 'aptitude', 'planning'] },
    ]);
    expect(paperExamRemaps(paper, 'NATA')).toEqual([]);
  });

  it('starts Drawing on Planning for B.Planning, and Planning on Aptitude elsewhere', () => {
    expect(defaultSectionMap(paper, 'JEE_PAPER_2B')).toEqual({ drawing: 'planning' });
    expect(defaultSectionMap([q('x', 'planning')], 'JEE_PAPER_2')).toEqual({ planning: 'aptitude' });
  });

  it('leaves drawing prompts behind for B.Planning, or when their section is mapped away', () => {
    expect(leftBehindDrawings(paper, 'JEE_PAPER_2B', {}).map((x) => x.id)).toEqual(['d']);
    expect(leftBehindDrawings(paper, 'NATA', {})).toEqual([]);
    const prompt = [q('d', 'planning', { question_format: 'DRAWING_PROMPT' })];
    expect(leftBehindDrawings(prompt, 'JEE_PAPER_2', { planning: 'drawing' })).toEqual([]);
    expect(leftBehindDrawings(prompt, 'JEE_PAPER_2', { planning: 'aptitude' }).map((x) => x.id)).toEqual(['d']);
  });
});
