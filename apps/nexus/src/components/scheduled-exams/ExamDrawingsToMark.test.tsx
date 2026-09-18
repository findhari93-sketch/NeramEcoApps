import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const swr = vi.fn();
vi.mock('@/lib/nexus-swr', () => ({ useAuthSWR: (...a: unknown[]) => swr(...a) }));
vi.mock('@/components/students/StudentAvatar', () => ({ default: ({ name }: { name?: string }) => <span aria-label={`Avatar for ${name}`} /> }));

import ExamDrawingsToMark, { examDrawingHref } from './ExamDrawingsToMark';

const row = (id: string, awarded: number | null) => ({
  submission_id: id, student_id: `s-${id}`, student_name: `Student ${id}`, avatar_url: null, question_id: 'q',
  image_url: `https://x/${id}.jpg`, awarded, max_marks: 10, status: awarded == null ? 'submitted' : 'completed',
});

describe('ExamDrawingsToMark', () => {
  it('counts what is left and links each drawing to the review screen', () => {
    swr.mockReturnValue({ data: { drawings: [row('a', null), row('b', 7)] }, isLoading: false });
    render(<ExamDrawingsToMark examId="e1" classId="c1" open />);
    expect(screen.getByText('Drawings to mark (1)')).toBeTruthy();
    expect(screen.getByText('Not marked')).toBeTruthy();
    expect(screen.getByText('7 of 10')).toBeTruthy();
    expect(screen.getAllByRole('link')[0].getAttribute('href')).toBe(examDrawingHref('a', 'e1', 'c1'));
  });

  it('renders nothing for an exam with no drawings', () => {
    swr.mockReturnValue({ data: { drawings: [] }, isLoading: false });
    const { container } = render(<ExamDrawingsToMark examId="e1" classId={null} open />);
    expect(container.textContent).toBe('');
  });

  it('does not fetch while the sheet is closed', () => {
    swr.mockReturnValue({ data: undefined, isLoading: false });
    render(<ExamDrawingsToMark examId="e1" classId={null} open={false} />);
    expect(swr).toHaveBeenLastCalledWith(null);
  });
});

describe('examDrawingHref', () => {
  it('opens the review screen from the exam, with the class for Back', () => {
    expect(examDrawingHref('d1', 'e1', 'c1')).toBe('/teacher/drawing-reviews/d1?from=exam&exam=e1&class=c1');
    expect(examDrawingHref('d1', 'e1', null)).toBe('/teacher/drawing-reviews/d1?from=exam&exam=e1');
  });
});
