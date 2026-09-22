import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { QBReportGroup } from '@neram/database';
import SolutionReportsPanel from './SolutionReportsPanel';

/**
 * What students reported about the open question, and the two ways to close
 * it. Everything a teacher needs to judge the report sits here: which part,
 * how many students, why, their words, and the moment in the video.
 */

const VIDEO = 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ';

function group(over: Partial<QBReportGroup> = {}): QBReportGroup {
  return {
    question_id: 'q31',
    target: 'video',
    part_label: null,
    status: 'open',
    students: 2,
    reasons: [
      { reason: 'wrong_working', count: 1 },
      { reason: 'wrong_final_answer', count: 1 },
    ],
    notes: [
      {
        report_id: 'r1',
        student_id: 's1',
        student_name: 'Asha Bavi',
        reason: 'wrong_working',
        note: 'Step 3 uses sin instead of cos',
        video_seconds: 135,
        created_at: new Date().toISOString(),
      },
      {
        report_id: 'r2',
        student_id: 's2',
        student_name: 'Ravi Kumar',
        reason: 'wrong_final_answer',
        note: null,
        video_seconds: null,
        created_at: new Date().toISOString(),
      },
    ],
    first_reported_at: new Date().toISOString(),
    last_reported_at: new Date().toISOString(),
    changed_since_reported: false,
    resolution_note: null,
    resolved_at: null,
    ...over,
  };
}

describe('SolutionReportsPanel', () => {
  it('says which part is wrong, how many students think so, and why', () => {
    render(<SolutionReportsPanel groups={[group()]} videoUrlFor={() => VIDEO} onResolve={vi.fn()} />);
    expect(screen.getByText('Video solution')).not.toBeNull();
    expect(screen.getByText('2 students')).not.toBeNull();
    expect(screen.getByText('Mistake in the working (1)')).not.toBeNull();
    expect(screen.getByText('Wrong final answer (1)')).not.toBeNull();
    expect(screen.getByText('Step 3 uses sin instead of cos')).not.toBeNull();
    expect(screen.getByText('Asha', { exact: false })).not.toBeNull();
  });

  it('links the moment in the video a student pointed at', () => {
    render(<SolutionReportsPanel groups={[group()]} videoUrlFor={() => VIDEO} onResolve={vi.fn()} />);
    const link = screen.getByRole('link', { name: /at 2:15/ });
    expect(link.getAttribute('href')).toBe(`${VIDEO}&t=135s`);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('says when the video has changed since they reported it', () => {
    render(
      <SolutionReportsPanel groups={[group({ changed_since_reported: true })]} videoUrlFor={() => VIDEO} onResolve={vi.fn()} />,
    );
    expect(screen.getByText(/Changed since they reported it/)).not.toBeNull();
  });

  it('marks it fixed in one press', async () => {
    const onResolve = vi.fn().mockResolvedValue(true);
    render(<SolutionReportsPanel groups={[group()]} videoUrlFor={() => VIDEO} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark fixed' }));
    await waitFor(() => expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ target: 'video' }), 'fixed', ''));
  });

  it('asks why before calling it not a mistake, and sends the reason', async () => {
    const onResolve = vi.fn().mockResolvedValue(true);
    render(<SolutionReportsPanel groups={[group()]} videoUrlFor={() => VIDEO} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Not a mistake' }));
    const send = screen.getByRole('button', { name: 'Send to 2 students' });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Tell them why'), { target: { value: 'sin 30 is 0.5, so step 3 is right.' } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith(expect.anything(), 'not_a_mistake', 'sin 30 is 0.5, so step 3 is right.'),
    );
  });

  it('says so when closing it failed, and keeps the buttons', async () => {
    const onResolve = vi.fn().mockResolvedValue(false);
    render(<SolutionReportsPanel groups={[group()]} videoUrlFor={() => VIDEO} onResolve={onResolve} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark fixed' }));
    expect(await screen.findByRole('alert')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Mark fixed' })).not.toBeNull();
  });

  it('keeps each part of a split drawing on its own card', () => {
    render(
      <SolutionReportsPanel
        groups={[group({ part_label: 'A' }), group({ part_label: 'B', students: 1 })]}
        videoUrlFor={() => VIDEO}
        onResolve={vi.fn()}
      />,
    );
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(within(cards[1]).getByText('Video solution, part B')).not.toBeNull();
  });

  it('shows nothing when nobody has reported anything', () => {
    const { container } = render(<SolutionReportsPanel groups={[]} onResolve={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
