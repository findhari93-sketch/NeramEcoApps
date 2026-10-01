import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NexusQBTagNode, QBExamTree } from '@neram/database';
import FilterDrawer from './FilterDrawer';

/**
 * The founder's report: on "JEE Paper 2 2019 Session 1, Mathematics" (30
 * questions) the drawer offered Aptitude (100), Drawing (6), NATA and every
 * year. Inside a scoped page the drawer must only offer choices that can
 * narrow the list the student is looking at.
 */

const node = (slug: string, label: string, count: number, children: NexusQBTagNode[] = []): NexusQBTagNode =>
  ({
    id: slug,
    slug,
    label,
    group_type: 'subject',
    parent_id: null,
    color: null,
    icon: null,
    sort_order: 0,
    is_system: true,
    is_active: true,
    self_count: count,
    rollup_count: count + children.reduce((n, c) => n + c.rollup_count, 0),
    children,
  }) as unknown as NexusQBTagNode;

const tree = [
  node('mathematics', 'Mathematics', 30),
  node('algebra', 'Algebra', 0, [node('functions', 'Functions', 4)]),
  node('calculus', 'Calculus', 0, [node('definite_integrals', 'Definite Integrals', 3)]),
];

const examTree = {
  exams: [
    { exam_type: 'JEE_PAPER_2', years: [{ year: 2019 }, { year: 2018 }] },
    { exam_type: 'NATA', years: [{ year: 2005 }] },
  ],
} as unknown as QBExamTree;

function renderDrawer(props: Partial<React.ComponentProps<typeof FilterDrawer>> = {}) {
  return render(
    <FilterDrawer
      open
      onClose={vi.fn()}
      filters={{}}
      onApply={vi.fn()}
      topics={[]}
      examTree={examTree}
      categoryCounts={{ mathematics: 30, aptitude: 50, functions: 4, definite_integrals: 3 }}
      categoryTree={tree}
      {...props}
    />,
  );
}

describe('FilterDrawer scoped to one paper section', () => {
  it('offers only maths chapters inside a Mathematics section', () => {
    renderDrawer({
      lockedScope: { exam_type: 'JEE_PAPER_2', year: 2019, section: 'math_mcq' },
      contextLabel: 'JEE Paper 2 2019 Session 1, Mathematics (MCQ)',
    });

    expect(screen.queryByText('Exam Type')).toBeNull();
    expect(screen.queryByText('Year')).toBeNull();
    expect(screen.queryByText(/Aptitude \(/)).toBeNull();
    expect(screen.queryByText(/^Mathematics \(/)).toBeNull();
    expect(screen.queryByText('Question Format')).toBeNull();
    expect(screen.queryByText('Confidence Level')).toBeNull();
    expect(screen.getByText('Math Topics')).toBeTruthy();
    expect(screen.getByText(/Filtering: JEE Paper 2 2019 Session 1, Mathematics/)).toBeTruthy();
  });

  it('keeps the year choice on an exam-wide page, limited to that exam', () => {
    renderDrawer({ lockedScope: { exam_type: 'JEE_PAPER_2' } });

    expect(screen.queryByText('Exam Type')).toBeNull();
    expect(screen.getByText('Year')).toBeTruthy();
    expect(screen.getByText('2018')).toBeTruthy();
    expect(screen.queryByText('2005')).toBeNull();
  });

  it('leaves the whole bank unscoped', () => {
    renderDrawer();

    expect(screen.getByText('Exam Type')).toBeTruthy();
    expect(screen.getByText('Question Format')).toBeTruthy();
    expect(screen.getByText(/Aptitude \(50\)/)).toBeTruthy();
  });
});
