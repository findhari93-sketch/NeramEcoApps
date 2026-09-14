import { beforeEach, describe, expect, it } from 'vitest';
import {
  QB_EXAM_ORDER,
  __resetRememberedQBExamForTests,
  examFromPathname,
  examFromSlug,
  examRelevanceFor,
  isExamPathListed,
  pickQBExam,
  qbExamPath,
  readRememberedQBExam,
  rememberQBExam,
  studentSidebarExams,
} from './qb-exam-routes';

describe('exam addresses', () => {
  it('round-trips every exam through its slug', () => {
    for (const exam of QB_EXAM_ORDER) {
      const path = qbExamPath('student', exam);
      expect(examFromPathname(path)).toBe(exam);
      expect(examFromSlug(path.split('/').pop())).toBe(exam);
    }
  });

  it('builds the paths the sidebar links to', () => {
    expect(qbExamPath('student', 'JEE_PAPER_2')).toBe('/student/question-bank/jee-paper-2');
    expect(qbExamPath('teacher', 'NATA')).toBe('/teacher/question-bank/nata');
  });

  it('reads the exam from anything under an exam page, and nothing from shared routes', () => {
    expect(examFromPathname('/teacher/question-bank/nata?stage=done')).toBe('NATA');
    expect(examFromPathname('/student/question-bank/questions')).toBeNull();
    expect(examFromPathname('/student/question-bank/papers/abc')).toBeNull();
    expect(examFromPathname('/student/question-bank')).toBeNull();
    expect(examFromSlug('JEE_PAPER_2')).toBeNull();
    expect(examFromSlug(undefined)).toBeNull();
  });

  /**
   * An exam slug equal to a static sibling folder would be shadowed by it, and
   * the exam page would silently be unreachable.
   */
  it('never collides with an existing question-bank folder', () => {
    const folders = [
      'papers', 'questions', 'recalled', 'reports', 'topic-intelligence', 'new', 'bulk-upload',
      'solutions', 'drawing-management', 'recalled-import', 'reclassify', 'section-collisions',
      'tags', 'tagging-assistant', 'sets', 'tests',
    ];
    for (const exam of QB_EXAM_ORDER) {
      const slug = qbExamPath('teacher', exam).split('/').pop()!;
      expect(folders).not.toContain(slug);
    }
  });

  it('maps an exam to the spelling questions use', () => {
    expect(examRelevanceFor('JEE_PAPER_2')).toBe('JEE');
    expect(examRelevanceFor('NATA')).toBe('NATA');
  });
});

describe('which exam to open', () => {
  it('prefers the one used last while it is still listed', () => {
    expect(pickQBExam('NATA', ['JEE_PAPER_2', 'NATA'])).toBe('NATA');
  });

  it('falls back to the first listed exam when the remembered one is not listed', () => {
    expect(pickQBExam('NATA', ['JEE_PAPER_2'])).toBe('JEE_PAPER_2');
    expect(pickQBExam(null, ['NATA'])).toBe('NATA');
  });

  it('opens nothing when nothing is listed', () => {
    expect(pickQBExam('NATA', [])).toBeNull();
  });
});

describe('the student sidebar', () => {
  it('lists only exams with a published paper, in sidebar order', () => {
    expect(studentSidebarExams(['NATA', 'JEE_PAPER_2'])).toEqual(['JEE_PAPER_2', 'NATA']);
    // Production on 2026-09-14: NATA has no published paper.
    expect(studentSidebarExams(['JEE_PAPER_2'])).toEqual(['JEE_PAPER_2']);
  });

  it('keeps the first exam when nothing is published, so search stays reachable', () => {
    expect(studentSidebarExams([])).toEqual(['JEE_PAPER_2']);
  });

  it('filters exam links and leaves every other path alone', () => {
    expect(isExamPathListed('/student/question-bank/nata', ['JEE_PAPER_2'])).toBe(false);
    expect(isExamPathListed('/student/question-bank/jee-paper-2', ['JEE_PAPER_2'])).toBe(true);
    expect(isExamPathListed('/student/question-bank', ['JEE_PAPER_2'])).toBe(true);
    expect(isExamPathListed('/student/library', [])).toBe(true);
  });
});

describe('the remembered exam', () => {
  beforeEach(() => {
    __resetRememberedQBExamForTests();
    try {
      window.localStorage.clear();
    } catch {
      /* no storage in this environment */
    }
  });

  it('remembers the last exam opened', () => {
    expect(readRememberedQBExam()).toBeNull();
    rememberQBExam('NATA');
    expect(readRememberedQBExam()).toBe('NATA');
    rememberQBExam('JEE_PAPER_2');
    expect(readRememberedQBExam()).toBe('JEE_PAPER_2');
  });

  it('ignores a stored value that is not an exam', () => {
    window.localStorage.setItem('nexus:qb:lastExam', 'ENGINEERING');
    expect(readRememberedQBExam()).toBeNull();
  });
});
